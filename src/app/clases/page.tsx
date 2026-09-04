import { redirect } from "next/navigation";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { LogOut } from "lucide-react";

type Clase = {
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  class_type: string | null;
  responsible: string | null;
  status: "pending" | "completed" | "cancelled";
  plan_generated: boolean;
  closed: boolean;
};

type ClaseDisplay = Clase & {
  display_group: "kids" | "adults" | "combined";
  display_name: string;
  display_status: "pending" | "completed" | "cancelled";
  display_closed: boolean;
  companion?: Clase;
};

export default async function ClasesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; month?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("classes")
    .select("legacy_id,class_date,name,class_group,class_type,responsible,status,plan_generated,closed")
    .order("class_date", { ascending: false })
    .limit(100)
    .returns<Clase[]>();

  if (error) throw error;
  const displayClasses = mergeCombinedClasses(data ?? []);
  const selectedMonth = normalizeMonth(params.month) ?? (displayClasses[0]?.class_date.slice(0, 7) ?? new Date().toISOString().slice(0, 7));
  const calendarDays = buildCalendar(selectedMonth, displayClasses);
  const monthLabel = monthName(selectedMonth);
  const previousMonth = shiftMonth(selectedMonth, -1);
  const nextMonth = shiftMonth(selectedMonth, 1);

  return (
    <div className="shell">
      <SidebarNav current="/clases" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Gestion de clases</p>
            <h1>Clases</h1>
          </div>
          <div className="top-actions compact-mobile-actions">
            <a className="primary-link" href="/clases/nueva">Nueva clase</a>
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
                <LogOut aria-hidden="true" size={18} />
              </button>
            </form>
          </div>
        </div>
        {params.saved === "deleted" ? <p className="save-ok">Clase eliminada del sistema nuevo.</p> : null}
        <section className="class-calendar" aria-label="Calendario de clases">
          <div className="calendar-head">
            <a className="mini-action" href={`/clases?month=${previousMonth}`}>Anterior</a>
            <h2>{monthLabel}</h2>
            <a className="mini-action" href={`/clases?month=${nextMonth}`}>Siguiente</a>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            <span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span><span>D</span>
          </div>
          <div className="calendar-grid">
            {calendarDays.map((day) => (
              <article className={day.inMonth ? "calendar-day" : "calendar-day muted-day"} key={day.date}>
                <span className="calendar-number">{Number(day.date.slice(8, 10))}</span>
                <div className="calendar-events">
                  {day.classes.map((clase) => (
                    <a className={`calendar-event ${clase.display_group}`} href={`/clases/${clase.legacy_id}`} key={`${day.date}-${clase.legacy_id ?? clase.display_name}`}>
                      {clase.display_name}
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mobile-class-list" aria-label="Clases recientes">
          {displayClasses.length ? displayClasses.map((clase) => (
            <a className="mobile-class-card" href={`/clases/${clase.legacy_id}`} key={`mobile-${clase.legacy_id ?? `${clase.class_date}-${clase.display_name}`}`}>
              <span>
                <strong>{clase.display_name}</strong>
                <small>{clase.class_date} · {displayGroupLabel(clase.display_group)} · {clase.class_type ?? "-"}</small>
              </span>
              <b className={clase.display_closed ? "mobile-state done" : "mobile-state"}>{clase.display_closed ? "Cerrada" : "Abierta"}</b>
            </a>
          )) : <p className="muted">Pendiente de normalizar desde legacy_rows.</p>}
        </section>

        <section className="table-wrap desktop-class-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Grupo</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {displayClasses.length ? displayClasses.map((clase) => (
                <tr key={clase.legacy_id ?? `${clase.class_date}-${clase.display_name}`}>
                  <td data-label="ID">{clase.legacy_id}</td>
                  <td data-label="Fecha">{clase.class_date}</td>
                  <td data-label="Nombre">
                    <a className="text-link" href={`/clases/${clase.legacy_id}`}>
                      {clase.display_name}
                    </a>
                  </td>
                  <td data-label="Grupo">{displayGroupLabel(clase.display_group)}</td>
                  <td data-label="Tipo">{clase.class_type ?? "-"}</td>
                  <td data-label="Estado">{clase.display_status}</td>
                  <td data-label="Plan">{clase.plan_generated ? "Generado" : "Pendiente"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="muted">Pendiente de normalizar desde legacy_rows.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function buildCalendar(month: string, classes: ClaseDisplay[]) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const start = new Date(first);
  const mondayIndex = (first.getDay() + 6) % 7;
  start.setDate(first.getDate() - mondayIndex);
  const byDate = new Map<string, ClaseDisplay[]>();
  classes.forEach((clase) => {
    const current = byDate.get(clase.class_date) ?? [];
    current.push(clase);
    byDate.set(clase.class_date, current);
  });
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = date.toISOString().slice(0, 10);
    return {
      date: iso,
      inMonth: iso.startsWith(month),
      classes: byDate.get(iso) ?? []
    };
  });
}

function mergeCombinedClasses(classes: Clase[]) {
  const byDate = new Map<string, Clase[]>();
  classes.forEach((clase) => {
    const current = byDate.get(clase.class_date) ?? [];
    current.push(clase);
    byDate.set(clase.class_date, current);
  });

  const merged: ClaseDisplay[] = [];
  for (const [, dayClasses] of byDate.entries()) {
    const adults = dayClasses.find((clase) => clase.class_group === "adults");
    const kids = dayClasses.find((clase) => clase.class_group === "kids");

    if (adults && kids) {
      merged.push({
        ...adults,
        display_group: "combined",
        display_name: combinedClassName(adults, kids),
        display_status: adults.status === "cancelled" || kids.status === "cancelled" ? "cancelled" : adults.closed && kids.closed ? "completed" : "pending",
        display_closed: adults.closed && kids.closed,
        companion: kids
      });
      continue;
    }

    dayClasses.forEach((clase) => {
      merged.push({
        ...clase,
        display_group: clase.class_group,
        display_name: clase.name,
        display_status: clase.status,
        display_closed: clase.closed
      });
    });
  }

  return merged.sort((a, b) => b.class_date.localeCompare(a.class_date));
}

function combinedClassName(adults: Clase, kids: Clase) {
  const adultName = adults.name?.trim();
  if (adultName && !/^clase adultos$/i.test(adultName)) return `${adultName} · adultos + ninos`;
  const kidName = kids.name?.trim();
  if (kidName && !/^ninos/i.test(kidName)) return `${kidName} · adultos + ninos`;
  return "Clase adultos + ninos";
}

function displayGroupLabel(group: ClaseDisplay["display_group"]) {
  if (group === "combined") return "Adultos + ninos";
  return group === "kids" ? "Ninos" : "Adultos";
}

function normalizeMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : null;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + offset, 1);
  return date.toISOString().slice(0, 7);
}

function monthName(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}
