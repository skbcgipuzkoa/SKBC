import { PortalBackLink } from "@/app/portal/back-link";
import { requireDojo } from "@/lib/dojo-access";
import { BarChart3 } from "lucide-react";

function validDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default async function DojoSummary({ params, searchParams }: {
  params: Promise<{ dojo: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { db, dojo } = await requireDojo((await params).dojo);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const monday = new Date(today + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const { from, to } = await searchParams;
  const custom = validDate(from) && validDate(to) && from <= to;
  const start = custom ? from : monday.toISOString().slice(0, 10);
  const end = custom ? to : today;

  const [sessions, attendance] = await Promise.all([
    db.from("classes").select("id,name,class_date,closed")
      .eq("dojo_slug", dojo.slug).gte("class_date", start).lte("class_date", end)
      .order("class_date"),
    db.from("attendance_logs")
      .select("id,classes!inner(dojo_slug,class_date,closed)", { count: "exact", head: true })
      .eq("classes.dojo_slug", dojo.slug).eq("classes.closed", true)
      .gte("classes.class_date", start).lte("classes.class_date", end)
  ]);
  if (sessions.error) throw sessions.error;
  if (attendance.error) throw attendance.error;

  return (
    <main className="main">
      <PortalBackLink href={`/portal/${dojo.slug}`} label={`Volver a ${dojo.name}`} />
      <div className="topbar">
        <div><p className="eyebrow">{dojo.name}</p><h1>Resumen semanal</h1></div>
      </div>
      <section className="card">
        <h2>Consultar otro periodo</h2>
        <form className="form-grid" method="get">
          <label>Desde<input type="date" name="from" defaultValue={start} required /></label>
          <label>Hasta<input type="date" name="to" defaultValue={end} required /></label>
          <button className="primary-link" type="submit">Calcular resumen</button>
        </form>
        {custom && <a className="text-link" href={`/portal/${dojo.slug}/resumen`}>Volver a esta semana</a>}
        {!custom && (from || to) && <p role="alert">Indica un periodo válido.</p>}
      </section>
      <section className="control-hero control-ok">
        <div><span className="tag">{start} a {end}</span><h2>{custom ? "El periodo de un vistazo" : "La semana de un vistazo"}</h2></div>
        <BarChart3 size={32} aria-hidden="true" />
      </section>
      <section className="grid stats compact" aria-label="Resumen">
        <article className="card"><h2>Clases</h2><div className="metric">{sessions.data.length}</div></article>
        <article className="card"><h2>Clases cerradas</h2><div className="metric">{sessions.data.filter((session) => session.closed).length}</div></article>
        <article className="card"><h2>Asistencias</h2><div className="metric">{attendance.count ?? 0}</div></article>
      </section>
      {sessions.data.length ? <section className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Clase</th><th>Estado</th></tr></thead>
          <tbody>{sessions.data.map((session) => <tr key={session.id}>
            <td data-label="Fecha">{session.class_date}</td>
            <td data-label="Clase"><a className="text-link" href={`/portal/${dojo.slug}/clases/${session.id}`}>{session.name}</a></td>
            <td data-label="Estado">{session.closed ? "Cerrada" : "Abierta"}</td>
          </tr>)}</tbody>
        </table>
      </section> : <p className="card">No hay clases registradas en este periodo.</p>}
    </main>
  );
}
