import { notFound } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";

export default async function DojoMemberPage({ params }: {
  params: Promise<{ dojo: string; id: string }>;
}) {
  const { dojo: slug, id } = await params;
  const { dojo, db } = await requireDojo(slug);
  const { data, error } = await db.from("dojo_memberships")
    .select("status, members!inner(display_name, grade, free_trial_ends_on)")
    .eq("dojo_slug", dojo.slug).eq("member_id", id)
    .returns<{ status: string; members: { display_name: string; grade: string | null; free_trial_ends_on: string | null } }[]>()
    .maybeSingle();
  if (error || !data) notFound();
  const { data: attendance, error: attendanceError } = await db.from("attendance_logs")
    .select("id, attended_on, classes!inner(name)")
    .eq("classes.dojo_slug", dojo.slug).eq("member_id", id)
    .order("attended_on", { ascending: false })
    .returns<{ id: string; attended_on: string; classes: { name: string } }[]>();
  if (attendanceError) throw attendanceError;

  return (
    <main className="main">
      <a href={`/portal/${dojo.slug}`}>{dojo.name}</a>
      <h1>{data.members.display_name}</h1>
      <p>{data.members.grade ?? "Sin grado"} · {data.status === "active" ? "Activo" : "Baja"}</p>
      {data.members.free_trial_ends_on && <p>Fin del mes de prueba: {data.members.free_trial_ends_on}</p>}
      <h2>Asistencia en {dojo.name}</h2>
      {attendance.length ? <ul>{attendance.map((row) => (
        <li key={row.id}>{row.attended_on} · {row.classes.name}</li>
      ))}</ul> : <p>Todavía no hay asistencias en este dojo.</p>}
    </main>
  );
}
