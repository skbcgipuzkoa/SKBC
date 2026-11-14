import { PortalBackLink } from "@/app/portal/back-link";
import { notFound, redirect } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";
import { driveImageUrl } from "@/lib/drive";

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
    .select("status,display_name,grade,free_trial_ends_on,photo_url,legacy_id,ika_id,class,joined_on,family_email,student_phone")
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
      <div className="topbar">
        <div><p className="eyebrow">{dojo.name}</p><h1>{data.display_name}</h1></div>
        {data.photo_url && <img className="mini-avatar" src={driveImageUrl(data.photo_url) ?? undefined} alt="" />}
      </div>
      <section className="card">
      <h2>Datos del kenshi</h2>
      <dl className="form-grid">
        <div><dt>ID SKBC</dt><dd>{data.legacy_id ?? "Pendiente"}</dd></div>
        <div><dt>ID IKA</dt><dd>{data.ika_id ?? "Pendiente"}</dd></div>
        <div><dt>Clase</dt><dd>{data.class === "kids" ? "Niños" : "Adultos"}</dd></div>
        <div><dt>Grado</dt><dd>{data.grade ?? "Sin grado"}</dd></div>
        <div><dt>Estado</dt><dd>{data.status === "active" ? "Activo" : "Baja"}</dd></div>
        <div><dt>Fecha de alta</dt><dd>{data.joined_on ?? "—"}</dd></div>
        <div><dt>Correo</dt><dd>{data.family_email ?? "—"}</dd></div>
        <div><dt>Teléfono</dt><dd>{data.student_phone ?? "—"}</dd></div>
      </dl>
      {!dojo.archived_at && <form action={setStatus.bind(null, dojo.slug, id, data.status !== "active")}>
        <button className="primary-link">{data.status === "active" ? "Dar de baja" : "Reactivar"}</button>
      </form>}
      {data.free_trial_ends_on && <p>Fin del mes de prueba: {data.free_trial_ends_on}</p>}
      </section>
      <section className="card">
      <h2>Asistencia en {dojo.name}</h2>
      {attendance.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Fecha</th><th scope="col">Clase</th></tr></thead>
        <tbody>{attendance.map((row) => <tr key={row.id}>
          <td data-label="Fecha">{row.attended_on}</td><td data-label="Clase">{row.classes.name}</td>
        </tr>)}</tbody>
      </table></div> : <p>Todavía no hay asistencias en este dojo.</p>}
      </section>
    </main>
  );
}
