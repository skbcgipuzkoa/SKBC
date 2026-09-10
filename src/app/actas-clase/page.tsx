import { CalendarDays, FileSearch, LogOut } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { SidebarNav } from "@/app/components/SidebarNav";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Clase = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  class_type: string | null;
  responsible: string | null;
  status: string | null;
  closed: boolean;
  plan_generated: boolean;
};

type Attendance = {
  class_id: string;
  member_id: string;
  members: { class: "kids" | "adults" | null; display_name: string | null } | null;
};

type Plan = {
  class_id: string;
  completed: boolean | null;
};

export default async function ActasClasePage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; q?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const selectedDate = normalizeDate(params.date);
  const search = String(params.q ?? "").trim();
  const supabase = createAdminClient();

  let query = supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,class_type,responsible,status,closed,plan_generated");

  if (selectedDate) query = query.eq("class_date", selectedDate);

  const { data: classes, error } = await query
    .order("class_date", { ascending: false })
    .order("name", { ascending: true })
    .limit(80)
    .returns<Clase[]>();
  if (error) throw error;

  const filteredClasses = (classes ?? []).filter((clase) => matchesSearch(clase, search));
  const classIds = filteredClasses.map((clase) => clase.id);

  const [{ data: attendance }, { data: plans }] = classIds.length
    ? await Promise.all([
        supabase
          .from("attendance_logs")
          .select("class_id,member_id,members(class,display_name)")
          .in("class_id", classIds)
          .returns<Attendance[]>(),
        supabase
          .from("technical_plans")
          .select("class_id,completed")
          .in("class_id", classIds)
          .returns<Plan[]>()
      ])
    : [{ data: [] as Attendance[] }, { data: [] as Plan[] }];

  const summaries = filteredClasses.map((clase) => summarizeClass(clase, attendance ?? [], plans ?? []));
  const months = buildMonths(summaries);

  return (
    <div className="shell">
      <SidebarNav current="/actas-clase" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Consulta de clase</p>
            <h1>Actas de clase</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="card">
          <form className="edit-form class-audit-form">
            <div className="form-grid">
              <label>Fecha<input name="date" type="date" defaultValue={selectedDate ?? ""} /></label>
              <label className="wide">Buscar<input name="q" defaultValue={search} placeholder="Nombre, tipo, responsable..." /></label>
            </div>
            <div className="form-actions">
              <button type="submit"><FileSearch aria-hidden="true" size={18} /> Buscar clases</button>
              <a className="secondary-link" href="/actas-clase">Limpiar</a>
            </div>
          </form>
        </section>

        <section className="class-audit-calendar-grid" aria-label="Calendario de actas">
          {months.length ? months.map((month) => (
            <article className="class-audit-month" key={month.key}>
              <header className="class-audit-month-head">
                <CalendarDays aria-hidden="true" size={18} />
                <h2>{month.label}</h2>
                <span>{month.totalClasses}</span>
              </header>
              <div className="class-audit-weekdays" aria-hidden="true">
                {["L", "M", "X", "J", "V", "S", "D"].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="class-audit-days">
                {month.days.map((day) => (
                  <div className={`class-audit-day${day.inMonth ? "" : " muted-day"}`} key={day.key}>
                    <span className="calendar-number">{day.date.getDate()}</span>
                    <div className="class-audit-day-events">
                      {day.items.map((summary) => (
                        <a
                          className={`class-audit-event ${summary.combined ? "combined" : summary.group}`}
                          href={`/clases/${summary.legacyId}`}
                          key={summary.id}
                          title={`${summary.name} - ${summary.totalAttendance} asistentes`}
                        >
                          <strong>{summary.name}</strong>
                          <span>{summary.totalAttendance} asis. · {summary.completedTechniques}/{summary.totalTechniques} tec.</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          )) : (
            <article className="card">
              <h2>Sin resultados</h2>
              <p className="muted">Prueba con otra fecha o deja el buscador vacio para ver las ultimas clases.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

function summarizeClass(clase: Clase, attendance: Attendance[], plans: Plan[]) {
  const rows = attendance.filter((row) => row.class_id === clase.id);
  const classPlans = plans.filter((plan) => plan.class_id === clase.id);
  return {
    id: clase.id,
    legacyId: clase.legacy_id ?? "",
    date: clase.class_date,
    name: clase.name,
    group: clase.class_group,
    type: clase.class_type ?? "NORMAL",
    responsible: clase.responsible,
    closed: clase.closed,
    combined: Boolean(clase.legacy_id?.includes("-COMBINED") || clase.class_type?.toUpperCase().includes("COMBIN")),
    totalAttendance: rows.length,
    adultAttendance: rows.filter((row) => row.members?.class === "adults").length,
    kidAttendance: rows.filter((row) => row.members?.class === "kids").length,
    totalTechniques: classPlans.length,
    completedTechniques: classPlans.filter((plan) => plan.completed).length,
    sampleNames: rows.slice(0, 4).map((row) => row.members?.display_name ?? "Kenshi")
  };
}

type ClassSummary = ReturnType<typeof summarizeClass>;

function buildMonths(summaries: ClassSummary[]) {
  const monthKeys = [...new Set(summaries.map((summary) => summary.date.slice(0, 7)))].sort().reverse();
  return monthKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const start = startOfCalendar(first);
    const days = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const iso = toIsoDate(date);
      return {
        key: iso,
        date,
        inMonth: date.getMonth() === month - 1,
        items: summaries.filter((summary) => summary.date === iso)
      };
    });

    return {
      key,
      label: first.toLocaleDateString("es-ES", { month: "long", year: "numeric" }),
      totalClasses: summaries.filter((summary) => summary.date.startsWith(key)).length,
      days
    };
  });
}

function startOfCalendar(date: Date) {
  const start = new Date(date);
  const mondayBasedDay = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayBasedDay);
  return start;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function matchesSearch(clase: Clase, search: string) {
  if (!search) return true;
  const needle = normalize(search);
  return normalize([clase.name, clase.class_type, clase.responsible, clase.status, clase.class_group].filter(Boolean).join(" ")).includes(needle);
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function groupLabel(group: Clase["class_group"]) {
  return group === "kids" ? "Ninos" : "Adultos";
}
