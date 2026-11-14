import { PortalBackLink } from "@/app/portal/back-link";
import { notFound, redirect } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";

async function setStatus(slug: string, id: string, active: boolean) {
  "use server";
  const { dojo, db } = await requireDojo(slug, true);
  const { error } = await db.rpc("set_home_dojo_kenshi_status", {
    p_slug: dojo.slug, p_member: id, p_active: active
  });
  redirect(`/portal/${dojo.slug}/kenshis?${error ? "error=estado" : `status=${active ? "active" : "inactive"}`}`);
}

export default async function DojoMemberPage({ params }: {
  params: Promise<{ dojo: string; id: string }>;
}) {
  const { dojo: slug, id } = await params;
  const { dojo, db } = await requireDojo(slug);
  const { data, error } = await db.from("members")
    .select("status,display_name,grade,free_trial_ends_on")
    .eq("dojo", dojo.slug).eq("id", id).maybeSingle();
  if (error || !data) notFound();
  const { data: attendance, error: attendanceError } = await db.from("attendance_logs")
    .select("id, attended_on, classes!inner(name)")
    .eq("classes.dojo_slug", dojo.slug).eq("member_id", id)
    .order("attended_on", { ascending: false })
    .returns<{ id: string; attended_on: string; classes: { name: string } }[]>();
  if (attendanceError) throw attendanceError;

  return (
    <main className="main">
      <PortalBackLink href={`/portal/${dojo.slug}/kenshis?status=${data.status}`} label="Volver a Kenshis" />
      <h1>{data.display_name}</h1>
      <p>{data.grade ?? "Sin grado"} · {data.status === "active" ? "Activo" : "Baja"}</p>
      {!dojo.archived_at && <form action={setStatus.bind(null, dojo.slug, id, data.status !== "active")}>
        <button className="primary-link">{data.status === "active" ? "Dar de baja" : "Reactivar"}</button>
      </form>}
      {data.free_trial_ends_on && <p>Fin del mes de prueba: {data.free_trial_ends_on}</p>}
      <h2>Asistencia en {dojo.name}</h2>
      {attendance.length ? <ul>{attendance.map((row) => (
        <li key={row.id}>{row.attended_on} · {row.classes.name}</li>
      ))}</ul> : <p>Todavía no hay asistencias en este dojo.</p>}
    </main>
  );
}
