import { PortalBackLink } from "@/app/portal/back-link";
import { notFound } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";

const labels = {
  "control-dia": "Control del día",
  rankings: "Ranking de asistencia",
  examenes: "Próximos exámenes"
} as const;

export default async function DojoSection({ params, searchParams }: {
  params: Promise<{ dojo: string; section: string }>;
  searchParams: Promise<{ fecha?: string; q?: string }>;
}) {
  const { dojo: slug, section } = await params;
  if (!Object.hasOwn(labels, section)) notFound();
  const { db, dojo } = await requireDojo(slug);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const filters = await searchParams;
  const parsedDate = filters.fecha && /^\d{4}-\d{2}-\d{2}$/.test(filters.fecha) ? new Date(filters.fecha + "T00:00:00Z") : null;
  const date = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === filters.fecha ? filters.fecha : today;
  const search = (filters.q ?? "").trim().toLocaleLowerCase("es");
  let rows: { id: string; cells: string[]; href?: string }[];
  let columns: string[];
  if (section === "examenes") {
    columns = ["Fecha", "Convocatoria", "Kenshi", "Grado previsto"];
    const { data, error } = await db.from("exam_event_students")
      .select("id,target_grade,members!inner(display_name,dojo,dojo_memberships!inner(dojo_slug,status)),exam_events!inner(title,exam_date,status)")
      .eq("members.dojo", slug).eq("members.dojo_memberships.dojo_slug", slug).eq("members.dojo_memberships.status", "active")
      .gte("exam_events.exam_date", today).eq("exam_events.status", "active")
      .returns<{id: string; target_grade: string | null; members: {display_name: string}; exam_events: {title: string; exam_date: string}}[]>();
    if (error) throw error;
    rows = data.sort((a, b) => a.exam_events.exam_date.localeCompare(b.exam_events.exam_date))
      .map(({ id, members, exam_events, target_grade }) => ({
        id, cells: [exam_events.exam_date, exam_events.title, members.display_name, target_grade ?? "—"]
      }));
  } else if (section === "rankings") {
    columns = ["Puesto", "Kenshi", "Asistencias"];
    const standings = new Map<string, { name: string; sessions: Set<string> }>();
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from("attendance_logs")
        .select("member_id,class_id,members!inner(display_name),classes!inner(dojo_slug,status)")
        .eq("classes.dojo_slug", slug).eq("classes.status", "completed")
        .order("id").range(start, start + 499)
        .returns<{member_id: string; class_id: string; members: {display_name: string}}[]>();
      if (error) throw error;
      for (const row of data) {
        const entry = standings.get(row.member_id) ?? { name: row.members.display_name, sessions: new Set<string>() };
        entry.sessions.add(row.class_id);
        standings.set(row.member_id, entry);
      }
      if (data.length < 500) break;
    }
    rows = [...standings.entries()]
      .sort(([, a], [, b]) => b.sessions.size - a.sessions.size || a.name.localeCompare(b.name, "es"))
      .map(([id, entry], index) => ({ id, cells: [String(index + 1), entry.name, String(entry.sessions.size)] }));
  } else {
    columns = ["Clase", "Fecha", "Estado"];
    const query = db.from("classes").select("id,name,class_date,status").eq("dojo_slug", slug);
    const { data, error } = await query.eq("class_date", date)
      .order("class_date").order("name");
    if (error) throw error;
    rows = data.map((session) => ({ id: session.id, cells: [session.name, session.class_date, session.status === "completed" ? "Cerrada" : session.status === "cancelled" ? "Cancelada" : "Abierta"], href: `/portal/${slug}/clases/${session.id}` }));
  }
  if (search && section !== "control-dia") rows = rows.filter(row => row.cells.some(cell => cell.toLocaleLowerCase("es").includes(search)));
  return (
    <main className="main">
      <PortalBackLink href={`/portal/${slug}`} label={`Volver a ${dojo.name}`} />
      <div className="topbar">
        <div><p className="eyebrow">{dojo.name}</p><h1>{labels[section as keyof typeof labels]}</h1></div>
      </div>
      {section === "control-dia" ? <section className={`control-hero control-${rows.length ? "ok" : "neutral"}`}>
        <div><span className="tag">{date.split("-").reverse().join("/")}</span>
          <h2>{rows.length ? "Clases del día" : "No hay clases registradas para este día"}</h2>
        </div>
        <div className="control-date-form">
          <form method="get">
            <label>Fecha<input name="fecha" type="date" defaultValue={date} required /></label>
            <button type="submit">Ver</button>
          </form>
          <a className="primary-link" href={`/portal/${slug}/modo-dojo`}>Modo dojo</a>
        </div>
      </section> : <form method="get" className="card filters">
        <label>Buscar kenshi<input name="q" type="search" defaultValue={filters.q ?? ""} /></label>
        <button type="submit" className="primary-link">Aplicar</button>
      </form>}
      {rows.length ? <section className="table-wrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{rows.map(({ id, cells, href }) => <tr key={id}>
            {cells.map((cell, index) => <td key={columns[index]} data-label={columns[index]}>
              {index === 0 && href ? <a className="text-link" href={href}>{cell}</a> : cell}
            </td>)}
          </tr>)}</tbody>
        </table>
      </section> : <p className="card">No hay registros para mostrar.</p>}
    </main>
  );
}
