import { PortalBackLink } from "@/app/portal/back-link";
import { redirect } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";

async function createClass(slug: string, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const name = String(form.get("name") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const group = String(form.get("group") ?? "");
  const back = `/portal/${dojo.slug}/clases`;
  if (!name || name.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      (group !== "kids" && group !== "adults")) redirect(back + "?error=1");

  const { error } = await db.rpc("create_dojo_class", {
    p_slug: dojo.slug, p_name: name, p_date: date, p_group: group
  });
  redirect(error ? back + "?error=1" : back);
}

export default async function DojoClasses({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string; saved?: string; warning?: string }>;
}) {
  const { db, dojo } = await requireDojo((await params).dojo);
  const { error: formError, saved, warning } = await searchParams;
  const [classes, groups] = await Promise.all([
    db.from("classes").select("id,name,class_date,class_group,status")
      .eq("dojo_slug", dojo.slug).order("class_date", { ascending: false }).limit(100),
    db.from("dojo_groups").select("member_class").eq("dojo_slug", dojo.slug).order("member_class")
  ]);
  if (classes.error) throw classes.error;
  if (groups.error) throw groups.error;

  return (
    <main className="main">
      <PortalBackLink href={`/portal/${dojo.slug}`} label={`Volver a ${dojo.name}`} />
      <h1>Clases</h1>
      {!dojo.archived_at && <form className="filters" action={createClass.bind(null, dojo.slug)}>
        <label>Nombre <input name="name" required maxLength={100} /></label>
        <label>Fecha <input name="date" type="date" required /></label>
        <label>Clase <select name="group" required>
          {groups.data.map(({ member_class }) => <option key={member_class} value={member_class}>
            {member_class === "kids" ? "Niños" : "Adultos"}
          </option>)}
        </select></label>
        <button className="primary-link">Crear clase</button>
      </form>}
      {formError && <p role="alert">No se pudo crear la clase.</p>}
      {saved === "deleted" && <p role="status">Clase eliminada.</p>}
      {warning === "exam" && <p role="alert">Quedó pendiente recalcular la preparación de examen de algún asistente.</p>}
      {classes.data.length ? <section className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Clase</th><th>Grupo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{classes.data.map((session) => {
            const href = `/portal/${dojo.slug}/clases/${session.id}`;
            return <tr key={session.id}>
              <td data-label="Fecha">{session.class_date}</td>
              <td data-label="Clase"><a className="text-link" href={href}>{session.name}</a></td>
              <td data-label="Grupo">{session.class_group === "kids" ? "Niños" : "Adultos"}</td>
              <td data-label="Estado">{session.status === "completed" ? "Cerrada" : session.status === "cancelled" ? "Cancelada" : "Abierta"}</td>
              <td data-label="Acciones"><a className="text-link" href={href}>Abrir clase</a></td>
            </tr>;
          })}</tbody>
        </table>
      </section> : <p>Todavía no hay clases registradas.</p>}
    </main>
  );
}
