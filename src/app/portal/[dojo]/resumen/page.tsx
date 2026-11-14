import { requireDojo } from "@/lib/dojo-access";

export default async function DojoSummary({ params }: {
  params: Promise<{ dojo: string }>;
}) {
  const { db, dojo } = await requireDojo((await params).dojo);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
  const monday = new Date(today + "T00:00:00Z");
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const start = monday.toISOString().slice(0, 10);

  const [sessions, attendance] = await Promise.all([
    db.from("classes").select("id,name,class_date,closed")
      .eq("dojo_slug", dojo.slug).gte("class_date", start).lte("class_date", today)
      .order("class_date"),
    db.from("attendance_logs")
      .select("id,classes!inner(dojo_slug,class_date,closed)", { count: "exact", head: true })
      .eq("classes.dojo_slug", dojo.slug).eq("classes.closed", true)
      .gte("classes.class_date", start).lte("classes.class_date", today)
  ]);
  if (sessions.error) throw sessions.error;
  if (attendance.error) throw attendance.error;

  return (
    <main className="main">
      <a href={`/portal/${dojo.slug}`}>{dojo.name}</a>
      <h1>Resumen semanal</h1>
      <p>{start} – {today}</p>
      <p>{sessions.data.filter((session) => session.closed).length} clases cerradas · {attendance.count ?? 0} asistencias</p>
      <ul>{sessions.data.map((session) => (
        <li key={session.id}>{session.class_date} · {session.name}</li>
      ))}</ul>
    </main>
  );
}
