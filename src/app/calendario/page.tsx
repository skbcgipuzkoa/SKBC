import { CalendarDays, LogOut } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { createClubClosureAction, deactivateClubClosureAction, duplicateClubCalendarYearAction, logoutAction, updateClubClosureAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type CalendarClosure = {
  id: string;
  starts_on: string;
  ends_on: string;
  title: string;
  applies_to: "all" | "kids" | "adults";
  notes: string | null;
};

export default async function CalendarioPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; year?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("skbc_calendar_closures")
    .select("id,starts_on,ends_on,title,applies_to,notes")
    .eq("active", true)
    .order("starts_on", { ascending: true })
    .limit(80)
    .returns<CalendarClosure[]>();

  const closures = error ? [] : data ?? [];
  const currentYear = new Date().getFullYear();
  const years = buildCalendarYears(closures, currentYear);
  const requestedYear = String(params.year ?? "");
  const selectedYear = years.some((item) => item.year === requestedYear) ? requestedYear : String(currentYear);
  const quickYears = buildQuickYears(years, selectedYear, currentYear);
  const selectedClosures = closures.filter((closure) => closure.starts_on.startsWith(`${selectedYear}-`));

  return (
    <div className="shell">
      <SidebarNav current="/calendario" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Festivos y cierres</p>
            <h1>Calendario del club</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "closure" ? <p className="save-ok">Cierre o festivo guardado.</p> : null}
        {params.saved === "duplicate" ? <p className="save-ok">Calendario duplicado. Revisa y ajusta las fechas necesarias.</p> : null}
        {params.error === "closure" ? <p className="form-error">No se pudo guardar el cierre. Revisa fechas y titulo.</p> : null}
        {params.error === "duplicate" ? <p className="form-error">No se pudo duplicar el calendario. Revisa los anos origen y destino.</p> : null}

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Anos preparados</h2>
              <p className="muted">Elige un ano para revisar sus festivos y cierres activos.</p>
            </div>
            <span className="tag">{selectedYear}</span>
          </div>
          <div className="year-chip-list">
            {quickYears.map((item) => (
              <a className={item.year === selectedYear ? "year-chip selected" : "year-chip"} href={`/calendario?year=${item.year}`} key={item.year}>
                <strong>{item.year}</strong>
                <span>{item.count} cierres</span>
              </a>
            ))}
          </div>
          <form action="/calendario" className="year-select-form" method="get">
            <label>
              Ver otro ano
              <select name="year" defaultValue={selectedYear}>
                {years.map((item) => (
                  <option value={item.year} key={item.year}>{item.year} - {item.count} cierres</option>
                ))}
              </select>
            </label>
            <button className="mini-action" type="submit">Ver</button>
          </form>
        </section>

        <section className="split-section">
          <article className="card">
            <CalendarDays aria-hidden="true" size={22} />
            <h2>Anadir festivo o cierre</h2>
            <p className="muted">Estos dias no penalizan ranking adulto ni calculo de proximos examenes.</p>
            <form action={createClubClosureAction} className="quick-form">
              <label className="wide">Titulo<input name="title" placeholder="Carnavales Tolosa, festivo, cierre dojo..." required /></label>
              <label>Desde<input name="startsOn" type="date" required /></label>
              <label>Hasta<input name="endsOn" type="date" required /></label>
              <label>
                Aplica a
                <select name="appliesTo" defaultValue="all">
                  <option value="all">Todos</option>
                  <option value="adults">Solo adultos</option>
                  <option value="kids">Solo ninos</option>
                </select>
              </label>
              <label className="wide">Notas<input name="notes" placeholder="Opcional" /></label>
              <button type="submit">Guardar cierre</button>
            </form>
          </article>
          <article className="card">
            <CalendarDays aria-hidden="true" size={22} />
            <h2>Duplicar ano</h2>
            <p className="muted">Copia todos los cierres activos de un ano a otro. Despues puedes ajustar fechas concretas manualmente.</p>
            <form action={duplicateClubCalendarYearAction} className="quick-form">
              <label>Ano origen<input name="sourceYear" type="number" min="2000" max="2100" defaultValue="2026" required /></label>
              <label>Ano destino<input name="targetYear" type="number" min="2000" max="2100" defaultValue="2027" required /></label>
              <button type="submit">Duplicar calendario</button>
            </form>
          </article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Cierres activos {selectedYear}</h2>
            <div className="stack-list compact-stack">
              {selectedClosures.length ? selectedClosures.map((closure) => (
                <div className="closure-row" key={closure.id}>
                  <details>
                    <summary>
                      <strong>{closure.title}</strong>
                      <span>{closure.starts_on === closure.ends_on ? closure.starts_on : `${closure.starts_on} - ${closure.ends_on}`} - {closure.applies_to === "all" ? "Todos" : closure.applies_to === "kids" ? "Ninos" : "Adultos"}</span>
                    </summary>
                    {closure.notes ? <p>{closure.notes}</p> : null}
                    <form action={updateClubClosureAction} className="quick-form closure-edit-form">
                      <input type="hidden" name="closureId" value={closure.id} />
                      <input type="hidden" name="selectedYear" value={selectedYear} />
                      <label className="wide">Titulo<input name="title" defaultValue={closure.title} required /></label>
                      <label>Desde<input name="startsOn" type="date" defaultValue={closure.starts_on} required /></label>
                      <label>Hasta<input name="endsOn" type="date" defaultValue={closure.ends_on} required /></label>
                      <label>
                        Aplica a
                        <select name="appliesTo" defaultValue={closure.applies_to}>
                          <option value="all">Todos</option>
                          <option value="adults">Solo adultos</option>
                          <option value="kids">Solo ninos</option>
                        </select>
                      </label>
                      <label className="wide">Notas<input name="notes" defaultValue={closure.notes ?? ""} /></label>
                      <button type="submit">Guardar cambios</button>
                    </form>
                    <form action={deactivateClubClosureAction}>
                      <input type="hidden" name="closureId" value={closure.id} />
                      <button className="mini-action danger" type="submit">Desactivar</button>
                    </form>
                  </details>
                </div>
              )) : <p className="muted">Sin cierres activos para este ano.</p>}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function buildCalendarYears(closures: CalendarClosure[], currentYear: number) {
  const counts = new Map<string, number>();
  closures.forEach((closure) => {
    const year = closure.starts_on.slice(0, 4);
    counts.set(year, (counts.get(year) ?? 0) + 1);
  });
  counts.set(String(currentYear), counts.get(String(currentYear)) ?? 0);
  counts.set(String(currentYear + 1), counts.get(String(currentYear + 1)) ?? 0);
  return Array.from(counts.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => Number(a.year) - Number(b.year));
}

function buildQuickYears(years: Array<{ year: string; count: number }>, selectedYear: string, currentYear: number) {
  const quick = new Set([String(currentYear - 1), String(currentYear), String(currentYear + 1), selectedYear]);
  return years.filter((item) => quick.has(item.year));
}
