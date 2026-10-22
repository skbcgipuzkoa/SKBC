import { AlertTriangle, CheckCircle2, Clock, LogOut, Search, ShieldCheck } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { logoutAction, recalculateAllExamStatusesAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { evaluateExamCandidate, type ExamCandidateEvaluation } from "@/lib/exam-candidate";
import { loadAllPages } from "@/lib/load-all-pages";
import { createAdminClient } from "@/lib/supabase/admin";

type ExamCandidate = {
  id: string;
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

type RecentAttendance = {
  member_id: string;
  attended_on: string;
};

type TechnicalHistory = {
  member_id: string;
  technique_id: string | null;
  technique_name: string;
};

type Technique = {
  id: string;
  name: string;
  grade: string;
  category: string | null;
};

type ExamRequirement = {
  member_class: "kids" | "adults";
  grade_pattern: string;
  adult_required_repetitions: number;
};

const semaphoreOrder = ["VERDE", "ROJO", "GRIS", "AMARILLO", "AZUL", "INACTIVO"];
const ADULT_GRADES = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN", "6 DAN", "7 DAN", "8 DAN", "9 DAN"];

export default async function ProximosExamenesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; semaforo?: string; class?: string; saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  let query = supabase
    .from("members")
    .select(
      "id,legacy_id,ika_id,display_name,class,status,grade,joined_on,last_exam_on,next_exam_on,exam_notice,semaphore,attendance_count,attendance_percentage,minimum_attendance,total_cycle_sessions,missing_attendance"
    )
    .order("next_exam_on", { ascending: true, nullsFirst: false })
    .order("display_name", { ascending: true });

  if (params.class === "kids" || params.class === "adults") {
    query = query.eq("class", params.class);
  }

  const { data, error } = await query.returns<ExamCandidate[]>();
  if (error) throw error;

  const members = data ?? [];
  const activeMemberIds = members.filter((item) => item.status === "active").map((item) => item.id);
  const adultMemberIds = members.filter((item) => item.status === "active" && item.class === "adults").map((item) => item.id);
  const today = formatLocalDate(new Date());
  const sixtyDaysAgo = formatLocalDate(addDays(new Date(), -60));
  const [recentAttendance, techniquesResult, technicalHistory, requirementsResult] = await Promise.all([
    activeMemberIds.length
      ? loadAllPages<RecentAttendance>((from, to) => supabase
          .from("attendance_logs")
          .select("member_id,attended_on")
          .in("member_id", activeMemberIds)
          .gte("attended_on", sixtyDaysAgo)
          .lte("attended_on", today)
          .order("attended_on", { ascending: true })
          .range(from, to)
          .returns<RecentAttendance[]>())
      : Promise.resolve([]),
    supabase.from("techniques").select("id,name,grade,category").returns<Technique[]>(),
    adultMemberIds.length
      ? loadAllPages<TechnicalHistory>((from, to) => supabase
          .from("member_technical_history")
          .select("member_id,technique_id,technique_name")
          .in("member_id", adultMemberIds)
          .eq("completed", true)
          .eq("counts_as_progression", true)
          .order("class_date", { ascending: true })
          .range(from, to)
          .returns<TechnicalHistory[]>())
      : Promise.resolve([]),
    supabase
      .from("skbc_exam_requirements")
      .select("member_class,grade_pattern,adult_required_repetitions")
      .eq("active", true)
      .returns<ExamRequirement[]>()
  ]);

  if (techniquesResult.error) throw techniquesResult.error;
  if (requirementsResult.error) throw requirementsResult.error;

  const recentByMember = summarizeRecentAttendance(recentAttendance, today);
  const technicalByMember = summarizeTechnicalProgress(
    members,
    techniquesResult.data ?? [],
    technicalHistory,
    requirementsResult.data ?? []
  );
  const candidateByMember = new Map<string, ExamCandidateEvaluation>();
  for (const member of members) {
    const recent = recentByMember.get(member.id) ?? { total60: 0, total21: 0 };
    const technical = technicalByMember.get(member.id);
    candidateByMember.set(member.id, evaluateExamCandidate({
      status: member.status,
      semaphore: member.semaphore,
      memberClass: member.class,
      nextExamOn: member.next_exam_on,
      today,
      attendanceCount: member.attendance_count,
      minimumAttendance: member.minimum_attendance,
      recentAttendance60: recent.total60,
      recentAttendance21: recent.total21,
      technicalWorked: technical?.worked ?? null,
      technicalTotal: technical?.total ?? null,
      repetitionCount: technical?.repetitions ?? null,
      repetitionGoal: technical?.repetitionGoal ?? null
    }));
  }

  const normalizedSemaphore = normalizeSemaphore(params.semaforo);
  const candidatesOnly = normalizedSemaphore === "POSIBLES";
  const search = (params.q ?? "").trim().toLowerCase();
  const filtered = members
    .filter((item) => item.status === "active")
    .filter((item) => candidatesOnly
      ? candidateByMember.get(item.id)?.isCandidate
      : !normalizedSemaphore || normalizeSemaphore(item.semaphore) === normalizedSemaphore)
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
    total: members.filter((item) => item.status === "active" && normalizeSemaphore(item.semaphore) === semaphore).length
  }));
  const candidateTotal = Array.from(candidateByMember.values()).filter((item) => item.isCandidate).length;
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
          <a
            className="semaphore-card semaphore-posibles"
            href={`/proximos-examenes?semaforo=POSIBLES${params.class ? `&class=${params.class}` : ""}`}
          >
            <span>POSIBLES CANDIDATOS</span>
            <strong>{candidateTotal}</strong>
          </a>
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
              <option value="POSIBLES">Posibles candidatos</option>
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
                const candidate = candidateByMember.get(item.id);
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
                    <td data-label="Aviso" className="notice-cell">
                      {candidate?.isCandidate ? (
                        <div className="exam-candidate-summary">
                          <strong>Posible candidato</strong>
                          <span>{candidate.reasons.join(" · ")}</span>
                          <small>{candidate.details.join(" · ")}</small>
                        </div>
                      ) : null}
                      <span>{item.exam_notice ?? <span className="muted">Sin aviso calculado</span>}</span>
                    </td>
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

function summarizeRecentAttendance(rows: RecentAttendance[], today: string) {
  const result = new Map<string, { total60: number; total21: number }>();
  const todayDate = parseIsoDate(today);
  if (!todayDate) return result;

  for (const row of rows) {
    const date = parseIsoDate(row.attended_on);
    if (!date) continue;
    const days = Math.floor((todayDate.getTime() - date.getTime()) / 86400000);
    const current = result.get(row.member_id) ?? { total60: 0, total21: 0 };
    if (days <= 60) current.total60 += 1;
    if (days <= 21) current.total21 += 1;
    result.set(row.member_id, current);
  }

  return result;
}

function summarizeTechnicalProgress(
  members: ExamCandidate[],
  techniques: Technique[],
  history: TechnicalHistory[],
  requirements: ExamRequirement[]
) {
  const historyByMember = new Map<string, Map<string, number>>();
  for (const row of history) {
    const repetitions = historyByMember.get(row.member_id) ?? new Map<string, number>();
    const key = row.technique_id ?? normalizeText(row.technique_name);
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1);
    historyByMember.set(row.member_id, repetitions);
  }

  const result = new Map<string, { worked: number; total: number; repetitions: number; repetitionGoal: number }>();
  for (const member of members) {
    if (member.class !== "adults" || member.status !== "active") continue;
    const targetGrade = nextAdultGrade(member.grade);
    const curriculum = techniques.filter((item) => normalizeText(item.grade) === targetGrade && isFundamental(item.category));
    if (!curriculum.length) continue;
    const repetitions = historyByMember.get(member.id) ?? new Map<string, number>();
    const counts = curriculum.map((item) => repetitions.get(item.id) ?? repetitions.get(normalizeText(item.name)) ?? 0);
    const required = requirementFor(member, requirements)?.adult_required_repetitions ?? 2;
    result.set(member.id, {
      worked: counts.filter((count) => count > 0).length,
      total: counts.length,
      repetitions: counts.reduce((sum, count) => sum + Math.min(count, required), 0),
      repetitionGoal: counts.length * required
    });
  }
  return result;
}

function requirementFor(member: ExamCandidate, requirements: ExamRequirement[]) {
  return requirements.find((row) => row.member_class === member.class && gradeMatches(member.grade, row.grade_pattern));
}

function gradeMatches(grade: string | null, pattern: string) {
  const value = normalizeText(grade);
  const normalizedPattern = normalizeText(pattern);
  if (normalizedPattern === "*" || normalizedPattern === value) return true;
  if (normalizedPattern === "* KYU") return value.endsWith(" KYU");
  if (normalizedPattern === "* DAN") return value.endsWith(" DAN");
  return false;
}

function nextAdultGrade(grade: string | null) {
  const normalized = normalizeText(grade);
  const index = ADULT_GRADES.indexOf(normalized);
  if (index === -1) return normalized;
  return ADULT_GRADES[Math.min(index + 1, ADULT_GRADES.length - 1)];
}

function isFundamental(category: string | null) {
  const normalized = normalizeText(category);
  return normalized === "GOHO" || normalized === "JUHO";
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
