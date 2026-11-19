import { PortalBackLink } from "@/app/portal/back-link";
import { redirect } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";
import { prepareVisitorPlan } from "@/lib/visitor-plan";

async function createClass(slug: string, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const name = String(form.get("name") ?? "").trim();
  const date = String(form.get("date") ?? "");
  const group = String(form.get("group") ?? "");
  const back = `/portal/${dojo.slug}/clases`;
  if (!name || name.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      (group !== "kids" && group !== "adults")) redirect(back + "?error=1");

  if (group === "adults" && dojo.slug !== "gainberri") {
    const { data, error } = await db.from("classes").insert({ dojo_slug: dojo.slug, name, class_date: date, class_group: group }).select("id").single();
    if (error || !data) redirect(back + "?error=1");
    try { await prepareVisitorPlan(slug, data.id); }
    catch (error) {
      console.error("Error preparing new dojo class", error);
      redirect(`${back}/${data.id}?error=plan`);
    }
    redirect(`${back}/${data.id}?modo=plan`);
  }

  const { error } = await db.rpc("create_dojo_class", {
    p_slug: dojo.slug, p_name: name, p_date: date, p_group: group
  });
  redirect(error ? back + "?error=1" : back);
}

export default async function DojoClasses({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ error?: string; saved?: string; warning?: string; month?: string }>;
}) {
  const { db, dojo } = await requireDojo((await params).dojo);
  const { error: formError, saved, warning, month } = await searchParams;
  const selectedMonth = month && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)
    ? month : new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()).slice(0, 7);
  const first = new Date(selectedMonth + "-01T00:00:00Z");
  const shift = (offset: number) => new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
  const offset = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, index) =>
    new Date(first.getTime() + (index - offset) * 86_400_000).toISOString().slice(0, 10));
  const path = `/portal/${dojo.slug}/clases`;
  const [classes, groups] = await Promise.all([
    db.from("classes").select("id,name,class_date,class_group,status")
      .eq("dojo_slug", dojo.slug).gte("class_date", days[0]).lte("class_date", days[41]).order("class_date", { ascending: false }),
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
      <section className="class-calendar" aria-label="Calendario de clases">
        <div className="calendar-head">
          <a className="mini-action" href={`${path}?month=${shift(-1)}`}>Anterior</a>
          <h2>{first.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <a className="mini-action" href={`${path}?month=${shift(1)}`}>Siguiente</a>
        </div>
        <div className="calendar-weekdays" aria-hidden="true">
          <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
        </div>
        <div className="calendar-grid">{days.map(date => <article className={date.startsWith(selectedMonth) ? "calendar-day" : "calendar-day muted-day"} key={date}>
          <span className="calendar-number">{Number(date.slice(8))}</span>
          <div className="calendar-events">{classes.data.filter(session => session.class_date === date).map(session =>
            <a className={`calendar-event ${session.class_group}`} href={`${path}/${session.id}`} key={session.id}>{session.name}</a>
          )}</div>
        </article>)}</div>
      </section>
      <section className="mobile-class-list" aria-label="Navegación por mes">
        <nav className="calendar-head">
          <a className="mini-action" href={`${path}?month=${shift(-1)}`}>Anterior</a>
          <span>{selectedMonth}</span>
          <a className="mini-action" href={`${path}?month=${shift(1)}`}>Siguiente</a>
        </nav>
      </section>
      {classes.data.some(session => session.class_date.startsWith(selectedMonth)) ? <section className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Clase</th><th>Grupo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{classes.data.filter(session => session.class_date.startsWith(selectedMonth)).map((session) => {
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
      </section> : <p>No hay clases registradas en este mes.</p>}
    </main>
  );
}
