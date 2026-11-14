import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

async function delegatedSession(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data, error } = await db.from("class_delegate_links")
    .select("class_id,classes!inner(name,class_date,class_group,dojo_slug,dojos!inner(archived_at))")
    .eq("token", token).eq("created_by", "dojo_portal").is("revoked_at", null)
    .is("classes.dojos.archived_at", null).eq("classes.closed", false)
    .eq("classes.status", "pending").gt("expires_at", new Date().toISOString())
    .returns<{ class_id: string; classes: { name: string; class_date: string; class_group: string; dojo_slug: string } }[]>()
    .maybeSingle();
  if (error || !data) notFound();
  return { db, id: data.class_id, session: data.classes };
}

async function save(token: string, form: FormData) {
  "use server";
  const { db, id, session } = await delegatedSession(token);
  const { error } = await db.rpc("save_dojo_attendance", {
    p_slug: session.dojo_slug, p_class: id, p_members: form.getAll("member").map(String)
  });
  redirect(`/portal/sustituto/${token}?${error ? "error=1" : "saved=1"}`);
}

export default async function SubstitutePage({ params, searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { token } = await params;
  const { db, id, session } = await delegatedSession(token);
  const { error, saved } = await searchParams;
  const [roster, attendance, plan] = await Promise.all([
    db.rpc("dojo_class_roster", { p_slug: session.dojo_slug, p_class: id }).overrideTypes<{ member_id: string; display_name: string; visit_id: string | null }[], { merge: false }>(),
    db.from("attendance_logs").select("member_id").eq("class_id", id),
    db.from("technical_plans").select("id,group_grade,technique_name").eq("class_id", id).order("suggested_order")
  ]);
  if (roster.error) throw roster.error;
  if (attendance.error) throw attendance.error;
  if (plan.error) throw plan.error;
  const present = new Set(attendance.data.map((row) => row.member_id));

  return (
    <main className="main">
      <h1>{session.name}</h1>
      <p>{session.class_date}</p>
      <h2>Plan técnico</h2>
      <ul>{plan.data.map((row) => <li key={row.id}>{row.group_grade} · {row.technique_name}</li>)}</ul>
      {error && <p role="alert">No se pudo guardar la asistencia.</p>}
      {saved && <p role="status">Asistencia guardada.</p>}
      <form action={save.bind(null, token)}>
        <fieldset>
          <legend>Pasar lista</legend>
          {(Array.isArray(roster.data) ? roster.data : []).map(({ member_id, display_name, visit_id }) => <div key={member_id}>
            <label><input name="member" type="checkbox" value={member_id} defaultChecked={present.has(member_id)} /> {display_name}{visit_id && " · Visitante"}</label>
          </div>)}
        </fieldset>
        <button>Guardar asistencia</button>
      </form>
    </main>
  );
}
