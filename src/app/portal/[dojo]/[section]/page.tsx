import { PortalBackLink } from "@/app/portal/back-link";
import { notFound } from "next/navigation";
import { requireDojo } from "@/lib/dojo-access";

const labels = {
  "control-dia": "Control del día",
  "modo-dojo": "Modo Dojo",
  rankings: "Ranking de asistencia",
  examenes: "Próximos exámenes"
} as const;

export default async function DojoSection({ params }: {
  params: Promise<{ dojo: string; section: string }>;
}) {
  const { dojo: slug, section } = await params;
  if (!Object.hasOwn(labels, section)) notFound();
  const { db, dojo } = await requireDojo(slug);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  let rows: { id: string; label: string; href?: string }[];
  if (section === "examenes") {
    const { data, error } = await db.from("exam_event_students")
      .select("id,target_grade,members!inner(display_name,dojo_memberships!inner(dojo_slug,status)),exam_events!inner(title,exam_date,status)")
      .eq("members.dojo_memberships.dojo_slug", slug).eq("members.dojo_memberships.status", "active")
      .gte("exam_events.exam_date", today).eq("exam_events.status", "active")
      .returns<{id: string; target_grade: string | null; members: {display_name: string}; exam_events: {title: string; exam_date: string}}[]>();
    if (error) throw error;
    rows = data.sort((a, b) => a.exam_events.exam_date.localeCompare(b.exam_events.exam_date))
      .map(({ id, members, exam_events, target_grade }) => ({
        id, label: [exam_events.exam_date, exam_events.title, members.display_name, target_grade].filter(Boolean).join(" · ")
      }));
  } else if (section === "rankings") {
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
      .map(([id, entry]) => ({ id, label: `${entry.name} · ${entry.sessions.size} asistencias` }));
  } else {
    const query = db.from("classes").select("id,name,class_date,status").eq("dojo_slug", slug);
    const { data, error } = await (section === "control-dia" ? query.eq("class_date", today) : query.eq("status", "pending"))
      .order("class_date").order("name");
    if (error) throw error;
    rows = data.map((session) => ({ id: session.id, label: `${session.class_date} · ${session.name}`, href: `/portal/${slug}/clases/${session.id}` }));
  }
  return (
    <main className="main">
      <PortalBackLink href={`/portal/${slug}`} label={`Volver a ${dojo.name}`} />
      <h1>{labels[section as keyof typeof labels]}</h1>
      {rows.length ? <ol>{rows.map(({ id, label, href }) => (
        <li key={id}>{href ? <a href={href}>{label}</a> : label}</li>
      ))}</ol> : <p>No hay registros para mostrar.</p>}
    </main>
  );
}
