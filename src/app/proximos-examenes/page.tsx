import { AlertTriangle, CheckCircle2, Clock, LogOut, Search, ShieldCheck } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { logoutAction, recalculateAllExamStatusesAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ExamCandidate = {
  legacy_id: string | null;
  ika_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
  next_exam_on: string | null;
  exam_notice: string | null;
  semaphore: string | null;
  attendance_count: number | null;
  attendance_percentage: number | null;
  minimum_attendance: number | null;
  total_cycle_sessions: number | null;
  missing_attendance: number | null;
};

const semaphoreOrder = ["VERDE", "ROJO", "GRIS", "AMARILLO", "AZUL", "INACTIVO", "SIN DATOS"];

export default async function ProximosExamenesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; semaforo?: string; class?: string; saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/admin");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  let query = supabase
    .from("members")
    .select(
      "legacy_id,ika_id,display_name,class,status,grade,joined_on,last_exam_on,next_exam_on,exam_notice,semaphore,attendance_count,attendance_percentage,minimum_attendance,total_cycle_sessions,missing_attendance"
    )
    .order("next_exam_on", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });

  if (params.class === "kids" || params.class === "adults") {
    query = query.eq("class", params.class);
  }

  const { data, error } = await query.returns<ExamCandidate[]>();
  if (error) throw error;

  const normalizedSemaphore = normalizeSemaphore(params.semaforo);
  const search = (params.q ?? "").trim().toLowerCase();
  const filtered = (data ?? [])
    .filter((item) => item.status === "active")
    .filter((item) => !normalizedSemaphore || normalizeSemaphore(item.semaphore) === normalizedSemaphore)
    .filter((item) =>
      search
        ? [item.legacy_id, item.ika_id, item.display_name, item.grade, item.exam_notice]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search)
        : true
    );

  const counters = semaphoreOrder.map((semaphore) => ({
    semaphore,
    total: (data ?? []).filter((item) => item.status === "active" && normalizeSemaphore(item.semaphore) === semaphore).length
  }));
  const ready = counters.find((item) => item.semaphore === "VERDE")?.total ?? 0;
  const blocked = ["ROJO", "GRIS"].reduce((sum, semaphore) => sum + (counters.find((item) => item.semaphore === semaphore)?.total ?? 0), 0);
  const upcoming = filtered.filter((item) => item.next_exam_on).length;

  return (
    <div className="shell">
      <SidebarNav current="/proximos-examenes" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Consulta calculada desde Supabase nuevo</p>
            <h1>Proximos examenes</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "recalculate" ? <p className="save-ok">Semaforos recalculados con implicacion, cursos y calendario.</p> : null}
        {params.error === "recalculate" ? <p className="form-error">No se pudieron recalcular los semaforos.</p> : null}

        <section className="grid stats compact" aria-label="Resumen proximos examenes">
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={19} />
            <h2>Verdes</h2>
            <div className="metric">{ready}</div>
          </article>
          <article className="card">
            <AlertTriangle aria-hidden="true" size={19} />
            <h2>Rojos / grises</h2>
            <div className="metric">{blocked}</div>
          </article>
          <article className="card">
            <Clock aria-hidden="true" size={19} />
            <h2>Con convocatoria</h2>
            <div className="metric">{upcoming}</div>
          </article>
          <article className="card">
            <ShieldCheck aria-hidden="true" size={19} />
            <h2>Mostrando</h2>
            <div className="metric">{filtered.length}</div>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Motor de convocatoria SKBC</h2>
              <p className="muted">
                Calcula martes/jueves reales, excluye verano, Navidad, cierres del calendario SKBC y bloquea adultos si falta progreso tecnico.
              </p>
            </div>
          </div>
          <div className="exam-rule-grid">
            <span>Convocatorias configurables: junio y diciembre</span>
            <span>Asistencia minima por defecto: 40%</span>
            <span>Adultos: tecnica necesaria para VERDE</span>
            <span>Cursos e implicacion reciente pueden bonificar convocatoria</span>
            <span>Busen: presente +2, ausencia -4, justificado 0</span>
            <span>Cierres editables: festivos, Semana Santa, carnavales</span>
          </div>
          <form action={recalculateAllExamStatusesAction} className="form-actions">
            <button type="submit">Recalcular semaforos</button>
          </form>
        </section>

        <section className="semaphore-strip" aria-label="Semaforos">
          {counters.map((item) => (
            <a
              className={`semaphore-card semaphore-${item.semaphore.toLowerCase().replace(/\s+/g, "-")}`}
              href={`/proximos-examenes?semaforo=${encodeURIComponent(item.semaphore)}${params.class ? `&class=${params.class}` : ""}`}
              key={item.semaphore}
            >
              <span>{item.semaphore}</span>
              <strong>{item.total}</strong>
            </a>
          ))}
        </section>

        <form className="filters exam-filters">
          <label>
            Buscar
            <input name="q" defaultValue={params.q ?? ""} placeholder="Nombre, ID SKBC, ID IKA, grado..." />
          </label>
          <label>
            Semaforo
            <select name="semaforo" defaultValue={params.semaforo ?? ""}>
              <option value="">Todos</option>
              {semaphoreOrder.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Clase
            <select name="class" defaultValue={params.class ?? ""}>
              <option value="">Todas</option>
              <option value="kids">Ninos</option>
              <option value="adults">Adultos</option>
            </select>
          </label>
          <button type="submit"><Search aria-hidden="true" size={16} /> Filtrar</button>
        </form>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kenshi</th>
                <th>ID SKBC</th>
                <th>ID IKA</th>
                <th>Clase</th>
                <th>Grado</th>
                <th>Semaforo</th>
                <th>Proximo examen</th>
                <th>Asistencia</th>
                <th>Aviso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((item) => {
                const semaphore = normalizeSemaphore(item.semaphore);
                return (
                  <tr key={item.legacy_id ?? item.display_name}>
                    <td data-label="Kenshi">
                      {item.legacy_id ? <a className="text-link" href={`/kenshis/${item.legacy_id}`}>{item.display_name}</a> : <strong>{item.display_name}</strong>}
                    </td>
                    <td data-label="ID SKBC">{item.legacy_id ?? "-"}</td>
                    <td data-label="ID IKA">{item.ika_id || <span className="muted">Pendiente</span>}</td>
                    <td data-label="Clase">{item.class === "kids" ? "Ninos" : "Adultos"}</td>
                    <td data-label="Grado">{item.grade ?? "-"}</td>
                    <td data-label="Semaforo"><span className={`semaphore-pill semaphore-${semaphore.toLowerCase().replace(/\s+/g, "-")}`}>{semaphore}</span></td>
                    <td data-label="Proximo examen">{item.next_exam_on ?? <span className="muted">Sin fecha</span>}</td>
                    <td data-label="Asistencia">
                      {formatAttendance(item)}
                    </td>
                    <td data-label="Aviso" className="notice-cell">{item.exam_notice ?? <span className="muted">Sin aviso calculado</span>}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="muted">No hay kenshis activos con esos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function normalizeSemaphore(value: string | null | undefined) {
  const text = String(value ?? "").trim().toUpperCase();
  return text || "SIN DATOS";
}

function formatAttendance(item: ExamCandidate) {
  if (item.attendance_count === null && item.minimum_attendance === null) {
    return <span className="muted">Sin datos</span>;
  }

  const percent = item.attendance_percentage === null ? "-" : `${item.attendance_percentage}%`;
  const minimum = item.minimum_attendance === null || item.total_cycle_sessions === null
    ? "-"
    : `min ${item.minimum_attendance}/${item.total_cycle_sessions}`;
  const missing = item.missing_attendance && item.missing_attendance > 0 ? `faltan ${item.missing_attendance}` : "ok";

  return (
    <span>
      {item.attendance_count ?? 0} asist. · {percent} · {minimum} · {missing}
    </span>
  );
}
