import { ProvisionalAttendanceForm } from "@/components/provisional-attendance-form";
import { ClassVisitorForm } from "@/components/class-visitor-form";
import { PortalBackLink } from "@/app/portal/back-link";
import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { requireDojo } from "@/lib/dojo-access";

async function save(slug: string, id: string, guided: boolean, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("save_dojo_attendance", {
    p_slug: dojo.slug, p_class: id, p_members: form.getAll("member").map(String)
  });
  redirect(`/portal/${dojo.slug}/clases/${id}${guided ? (error ? "?modo=asistencia&error=1" : "?modo=cierre") : error ? "?error=1" : ""}`);
}

async function preparePlan(slug: string, id: string, guided: boolean) {
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
  redirect(`/portal/${dojo.slug}/clases/${id}${guided ? "?modo=plan" + (failed ? "&error=plan" : "") : failed ? "?error=plan" : ""}`);
}

async function finishClass(slug: string, id: string, guided: boolean, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("finish_dojo_class", {
    p_slug: dojo.slug, p_class: id, p_worked: form.getAll("worked").map(String)
  });
  redirect(`/portal/${dojo.slug}/clases/${id}${guided ? "?modo=cierre" + (error ? "&error=cierre" : "") : error ? "?error=cierre" : ""}`);
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
  searchParams: Promise<{ error?: string; modo?: string }>;
}) {
  const { error: formError, modo } = await searchParams;
  const guided = modo === "plan" || modo === "asistencia" || modo === "cierre";
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
  const path = `/portal/${slug}/clases/${id}`;
  const step = !editable ? "cerrada" : !plan.length ? "plan" : modo;
  const attendancePath = guided ? path + "?modo=asistencia" : path;
  return (
    <main className={guided ? "dojo-page" : "main"}>
      <PortalBackLink href={`/portal/${slug}/${guided ? "modo-dojo" : "clases"}`} label={guided ? "Volver a Modo Dojo" : "Volver a clases"} />
      <section className={guided ? "card" : undefined}>
      <h1>{guided ? (step === "cerrada" ? "Clase cerrada" : step === "plan" ? "Técnicas adultos" : step === "asistencia" ? "Asistencia adultos" : "Cerrar clase") : session.name}</h1>
      <p>{session.class_date} · {present.size} asistentes</p>
      {formError && <p role="alert">No se pudo guardar el cambio.</p>}
      {(!guided || step === "plan" || step === "cerrada") && <h2>Plan técnico</h2>}
      {guided && step === "plan" && plan.length > 0 && <>
        <ul>{plan.map((row) => <li key={row.id}>{row.group_grade} · {row.technique_name}</li>)}</ul>
        <a className="dojo-primary-button" href={attendancePath}>Pasar asistencia</a>
      </>}
      {!editable && <ul>{plan.filter((row) => row.completed).map((row) => <li key={row.id}>{row.group_grade} · {row.technique_name}</li>)}</ul>}
      {editable && session.class_group === "adults" && !plan.length &&
        <form action={preparePlan.bind(null, slug, id, guided)}><button>Generar plan técnico</button></form>}
      {editable && (!guided || step === "asistencia") && <ClassVisitorForm host={slug} classId={id} group={session.class_group} returnTo={attendancePath} />}
      {editable && (!guided || step === "asistencia") && <ProvisionalAttendanceForm dojo={slug} classId={id} group={session.class_group} returnTo={attendancePath} />}
      {editable && (!guided || step === "asistencia") && <form action={save.bind(null, slug, id, guided)}>
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
      {editable && plan.length > 0 && (!guided || step === "cierre") && <form action={finishClass.bind(null, slug, id, guided)}>
        <fieldset>
          <legend>Técnicas trabajadas</legend>
          {plan.map((row) => <div key={row.id}>
            <label><input name="worked" type="checkbox" value={row.id} /> {row.group_grade} · {row.technique_name}</label>
          </div>)}
        </fieldset>
        <button className={guided ? "dojo-primary-button" : undefined}>Cerrar clase</button>
      </form>}
      {editable && !guided && <section>
        <h2>Sustituto</h2>
        {substitutes?.[0] ? <a href={`/portal/sustituto/${substitutes[0].token}`}>Abrir o copiar enlace del sustituto</a> :
          <form action={createSubstituteLink.bind(null, slug, id)}><button>Crear enlace de sustitución</button></form>}
      </section>}
      </section>
    </main>
  );
}
