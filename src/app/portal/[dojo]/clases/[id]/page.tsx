import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { requireDojo } from "@/lib/dojo-access";

async function save(slug: string, id: string, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("save_dojo_attendance", {
    p_slug: dojo.slug, p_class: id, p_members: form.getAll("member").map(String)
  });
  redirect(`/portal/${dojo.slug}/clases/${id}${error ? "?error=1" : ""}`);
}

async function preparePlan(slug: string, id: string) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { data } = await db.from("classes").select("id")
    .eq("id", id).eq("dojo_slug", dojo.slug).eq("class_group", "adults")
    .eq("status", "pending").eq("closed", false).maybeSingle();
  if (!data || dojo.slug === "gainberri") notFound();
  let failed = false;
  try {
    const { error } = await db.rpc("prepare_dojo_plan_groups", { p_slug: dojo.slug, p_class: id });
    if (error) throw error;
    await generateAdultTechnicalPlan(id);
  } catch {
    failed = true;
  }
  redirect(`/portal/${dojo.slug}/clases/${id}${failed ? "?error=plan" : ""}`);
}

async function finishClass(slug: string, id: string, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("finish_dojo_class", {
    p_slug: dojo.slug, p_class: id, p_worked: form.getAll("worked").map(String)
  });
  redirect(`/portal/${dojo.slug}/clases/${id}${error ? "?error=cierre" : ""}`);
}

async function createSubstituteLink(slug: string, id: string) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { data } = await db.from("classes").select("id").eq("id", id)
    .eq("dojo_slug", dojo.slug).eq("closed", false).eq("status", "pending").maybeSingle();
  if (!data || slug === "gainberri") notFound();
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("class_delegate_links").insert({
    class_id: id, token, expires_at: new Date(Date.now() + 86_400_000).toISOString(), created_by: "dojo_portal"
  });
  redirect(`/portal/${slug}/clases/${id}${error ? "?error=sustituto" : ""}`);
}

export default async function SessionPage({ params, searchParams }: {
  params: Promise<{ dojo: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { dojo: slug, id } = await params;
  const { db, dojo } = await requireDojo(slug);
  const { data: session, error } = await db.from("classes")
    .select("name,class_date,class_group,closed,status")
    .eq("dojo_slug", dojo.slug).eq("id", id).maybeSingle();
  if (error || !session) notFound();
  const [roster, attendance] = await Promise.all([
    db.rpc("dojo_class_roster", { p_slug: slug, p_class: id }).overrideTypes<{ member_id: string; display_name: string; visit_id: string | null }[], { merge: false }>(),
    db.from("attendance_logs").select("member_id").eq("class_id", id)
  ]);
  if (roster.error) throw roster.error;
  if (attendance.error) throw attendance.error;
  const { data: plan, error: planError } = await db.from("technical_plans")
    .select("id,group_grade,technique_name,completed").eq("class_id", id).order("suggested_order");
  if (planError) throw planError;
  const present = new Set(attendance.data.map((row) => row.member_id));
  const editable = slug !== "gainberri" && !dojo.archived_at && !session.closed && session.status === "pending";
  const { data: substitutes, error: substituteError } = editable
    ? await db.from("class_delegate_links").select("token").eq("class_id", id)
      .eq("created_by", "dojo_portal").is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1)
    : { data: [], error: null };
  if (substituteError) throw substituteError;
  return (
    <main className="main">
      <a href={`/portal/${slug}/clases`}>Clases de {dojo.name}</a>
      <h1>{session.name}</h1>
      <p>{session.class_date} · {present.size} asistentes</p>
      {(await searchParams).error && <p role="alert">No se pudo guardar el cambio.</p>}
      <h2>Plan técnico</h2>
      {!editable && <ul>{plan.filter((row) => row.completed).map((row) => <li key={row.id}>{row.group_grade} · {row.technique_name}</li>)}</ul>}
      {editable && session.class_group === "adults" && !plan.length &&
        <form action={preparePlan.bind(null, slug, id)}><button>Generar plan técnico</button></form>}
      {editable && <form action={save.bind(null, slug, id)}>
        <fieldset>
          <legend>Pasar lista</legend>
          {(Array.isArray(roster.data) ? roster.data : []).map(({member_id, display_name, visit_id}) => (
            <div key={member_id}>
              <label><input type="checkbox" name="member" value={member_id} defaultChecked={present.has(member_id)} /> {display_name}{visit_id && " · Visitante"}</label>
            </div>
          ))}
        </fieldset>
        <button className="primary-link">Guardar asistencia</button>
      </form>}
      {editable && plan.length > 0 && <form action={finishClass.bind(null, slug, id)}>
        <fieldset>
          <legend>Técnicas trabajadas</legend>
          {plan.map((row) => <div key={row.id}>
            <label><input name="worked" type="checkbox" value={row.id} /> {row.group_grade} · {row.technique_name}</label>
          </div>)}
        </fieldset>
        <button>Cerrar clase</button>
      </form>}
      {editable && <section>
        <h2>Sustituto</h2>
        {substitutes?.[0] ? <a href={`/portal/sustituto/${substitutes[0].token}`}>Abrir o copiar enlace del sustituto</a> :
          <form action={createSubstituteLink.bind(null, slug, id)}><button>Crear enlace de sustitución</button></form>}
      </section>}
    </main>
  );
}
