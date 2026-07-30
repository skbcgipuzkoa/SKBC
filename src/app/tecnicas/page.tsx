import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";
import { BookOpenCheck, CheckCircle2, Filter, LogOut, RotateCcw } from "lucide-react";

type Tecnica = {
  legacy_id: string | null;
  grade: string;
  name: string;
  category: string;
  active: boolean;
  repetitions: number;
  last_trained_on: string | null;
  active_in_planning: boolean;
  content_type: string | null;
  summary_es: string | null;
};

export default async function TecnicasPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; grade?: string; category?: string; status?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("techniques")
    .select("legacy_id,grade,name,category,content_type,summary_es,active,active_in_planning,repetitions,last_trained_on")
    .order("name", { ascending: true })
    .limit(900)
    .returns<Tecnica[]>();

  if (error) throw error;

  const techniques = (data ?? []).sort(compareTechniques);
  const visibleTechniques = techniques.filter((tecnica) => matchesFilters(tecnica, params));
  const categories = [...new Set(techniques.map((tecnica) => tecnica.category).filter(Boolean))].sort();
  const grades = adultGrades.filter((grade) => techniques.some((tecnica) => normalize(tecnica.grade) === normalize(grade)));
  const activeCount = techniques.filter((tecnica) => tecnica.active).length;
  const planningCount = techniques.filter((tecnica) => tecnica.active_in_planning).length;
  const neverTrained = techniques.filter((tecnica) => !tecnica.last_trained_on || tecnica.repetitions === 0).length;
  const gradeStats = grades.map((grade) => {
    const rows = techniques.filter((tecnica) => normalize(tecnica.grade) === normalize(grade));
    const totalRepetitions = rows.reduce((sum, tecnica) => sum + (tecnica.repetitions ?? 0), 0);
    return {
      grade,
      total: rows.length,
      pending: rows.filter((tecnica) => !tecnica.last_trained_on || tecnica.repetitions === 0).length,
      average: rows.length ? Math.round(totalRepetitions / rows.length) : 0
    };
  });

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas" aria-current="page">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Programa tecnico adulto</p>
            <h1>Tecnicas</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid stats compact" aria-label="Resumen tecnicas">
          <article className="card">
            <BookOpenCheck aria-hidden="true" size={20} />
            <h2>Total tecnicas</h2>
            <div className="metric">{techniques.length}</div>
            <p className="muted">Programa adulto importado y disponible.</p>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Activas</h2>
            <div className="metric">{activeCount}</div>
            <p className="muted">{planningCount} entran en planes tecnicos.</p>
          </article>
          <article className="card">
            <RotateCcw aria-hidden="true" size={20} />
            <h2>Sin repeticiones</h2>
            <div className="metric">{neverTrained}</div>
            <p className="muted">Candidatas naturales para priorizar.</p>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Buscar programa</h2>
              <p className="muted">Filtra por grado, categoria, texto o estado de planificacion.</p>
            </div>
            <Filter aria-hidden="true" size={20} />
          </div>
          <form className="filters-form" action="/tecnicas">
            <input name="q" placeholder="Buscar tecnica" defaultValue={params.q ?? ""} />
            <select name="grade" defaultValue={params.grade ?? ""}>
              <option value="">Todos los grados</option>
              {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
            <select name="category" defaultValue={params.category ?? ""}>
              <option value="">Todas las categorias</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Todos los estados</option>
              <option value="planning">En plan tecnico</option>
              <option value="inactive">Inactivas</option>
              <option value="never">Sin repeticiones</option>
            </select>
            <button type="submit">Filtrar</button>
            <a className="secondary-link" href="/tecnicas">Limpiar</a>
          </form>
        </section>

        <h2 className="section-title">Resumen por grado</h2>
        <section className="grade-summary-grid">
          {gradeStats.map((item) => (
            <a className={`grade-summary-card grade-${slugGrade(item.grade)}`} href={`/tecnicas?grade=${encodeURIComponent(item.grade)}`} key={item.grade}>
              <strong>{item.grade}</strong>
              <span>{item.total} tecnicas</span>
              <small>{item.pending} sin repetir - media {item.average}</small>
            </a>
          ))}
        </section>

        <div className="section-heading-row">
          <h2 className="section-title">Listado tecnico</h2>
          <span className="pill">{visibleTechniques.length} visibles</span>
        </div>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Grado</th>
                <th>Tecnica</th>
                <th>Categoria</th>
                <th>Repeticiones</th>
                <th>Ultima vez</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibleTechniques.length ? visibleTechniques.map((tecnica) => (
                <tr key={tecnica.legacy_id ?? tecnica.name}>
                  <td data-label="ID">{tecnica.legacy_id}</td>
                  <td data-label="Grado"><span className={`grade-chip grade-${slugGrade(tecnica.grade)}`}>{tecnica.grade}</span></td>
                  <td data-label="Tecnica">
                    <strong>{tecnica.name}</strong>
                    {tecnica.summary_es ? <p className="technique-summary compact">{tecnica.summary_es}</p> : null}
                  </td>
                  <td data-label="Categoria">{tecnica.category}{tecnica.content_type ? ` - ${tecnica.content_type}` : ""}</td>
                  <td data-label="Repeticiones">{tecnica.repetitions}</td>
                  <td data-label="Ultima vez">{tecnica.last_trained_on ?? "-"}</td>
                  <td data-label="Estado">
                    <span className={`state-badge ${tecnica.active && tecnica.active_in_planning ? "state-completada" : tecnica.active ? "state-en-progreso" : "state-pendiente"}`}>
                      {tecnica.active && tecnica.active_in_planning ? "Plan" : tecnica.active ? "Activa" : "Inactiva"}
                    </span>
                  </td>
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

function matchesFilters(tecnica: Tecnica, params: { q?: string; grade?: string; category?: string; status?: string }) {
  const q = normalize(params.q);
  if (q && !normalize(`${tecnica.name} ${tecnica.legacy_id ?? ""} ${tecnica.category}`).includes(q)) return false;
  if (params.grade && normalize(tecnica.grade) !== normalize(params.grade)) return false;
  if (params.category && normalize(tecnica.category) !== normalize(params.category)) return false;
  if (params.status === "planning" && !tecnica.active_in_planning) return false;
  if (params.status === "inactive" && tecnica.active) return false;
  if (params.status === "never" && tecnica.last_trained_on && tecnica.repetitions > 0) return false;
  return true;
}

function compareTechniques(a: Tecnica, b: Tecnica) {
  return gradeOrder(a.grade) - gradeOrder(b.grade) || a.name.localeCompare(b.name);
}

function gradeOrder(grade: string) {
  const index = adultGrades.findIndex((item) => normalize(item) === normalize(grade));
  return index === -1 ? 999 : index;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function slugGrade(grade: string) {
  return normalize(grade).toLowerCase().replace(/\s+/g, "-");
}
