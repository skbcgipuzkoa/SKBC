import { getUpcomingExamCalls } from "@/lib/exam-calls-data";
import { resolveCallFilter, madridCallToday, formatExamCallMonth } from "@/lib/exam-call";
import { ApproveExamCall } from "./ApproveExamCall";
import { PlanningApprovals } from "./PlanningApprovals";
import { listPlanningExamApprovals } from "@/lib/exam-invitations";
import { loadAllPages } from "@/lib/load-all-pages";
import { loadExamOutlooks } from "@/lib/exam-outlook-data";
import { ExamOutlookPanel } from "@/app/components/exam-outlook-panel";
import { AlertTriangle, CheckCircle2, Clock, LogOut, Search, ShieldCheck } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { logoutAction, recalculateAllExamStatusesAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
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

const semaphoreOrder = ["VERDE", "ROJO", "GRIS", "AMARILLO", "AZUL", "INACTIVO"];

export default async function ProximosExamenesPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; semaforo?: string; class?: string; saved?: string; error?: string; call?: string; view?: string; approved?: string; examDate?: string; confirmed?: string }>;
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

  const members = await loadAllPages<ExamCandidate>((from, to) => query.order("id").range(from, to).returns<ExamCandidate[]>());
  const calls = await getUpcomingExamCalls();
  const approvals = await listPlanningExamApprovals();
  const minDate = new Date(Date.parse(madridCallToday() + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);
  const callFilter = resolveCallFilter(params.call, calls.map((call) => call.call_date));
  const candidateByMember = await loadExamOutlooks({ memberIds: members.map((member) => member.id) });
  const calledByMemberMonth = new Map(approvals.flatMap((event) => event.participants.map((person) => [`${person.memberId}:${event.callMonth}`, { eventId: event.eventId, response: person.response }] as const)));
  const existingCall = (id: string) => {
    const date = candidateByMember.get(id)?.callDate;
    return date ? calledByMemberMonth.get(`${id}:${date.slice(0, 7)}`) : undefined;
  };

  const normalizedSemaphore = params.semaforo ? normalizeSemaphore(params.semaforo) : "";
  const view = ["impossible", "followup", "all"].includes(params.view ?? "") ? params.view! : "candidates";
  const candidatesOnly = normalizedSemaphore === "POSIBLES" && view !== "impossible" && view !== "followup";
  const matchesView = (id: string) => {
    const outlook = candidateByMember.get(id);
    if (view === "all") return true;
    if (view === "impossible") return outlook?.feasibility === "impossible";
    if (view === "followup") return !outlook?.candidate && outlook?.feasibility !== "impossible";
    return Boolean(outlook?.candidate) && !existingCall(id);
  };
  const search = (params.q ?? "").trim().toLowerCase();
  const scoped = members
    .filter((item) => callFilter.all ? Boolean(candidateByMember.get(item.id)?.callDate) : Boolean(callFilter.callDate) && candidateByMember.get(item.id)?.callDate === callFilter.callDate)
    .filter((item) => item.status === "active")
    .filter((item) =>
      search
        ? [item.legacy_id, item.ika_id, item.display_name, item.grade, item.exam_notice]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(search)
        : true
    );

  const viewScoped = scoped.filter((item) => matchesView(item.id));
  const filtered = viewScoped.filter((item) => candidatesOnly ? candidateByMember.get(item.id)?.candidate : !normalizedSemaphore || normalizedSemaphore === "POSIBLES" || normalizeSemaphore(item.semaphore) === normalizedSemaphore);
  const counters = semaphoreOrder.map((semaphore) => ({
    semaphore,
    total: viewScoped.filter((item) => item.status === "active" && normalizeSemaphore(item.semaphore) === semaphore).length
  }));
  const candidateTotal = scoped.filter((item) => candidateByMember.get(item.id)?.candidate && !existingCall(item.id)).length;
  const calledTotal = scoped.filter((item) => existingCall(item.id)).length;
  const impossibleTotal = scoped.filter((item) => candidateByMember.get(item.id)?.feasibility === "impossible").length;
  const ready = viewScoped.filter((item) => candidateByMember.get(item.id)?.currentReady).length;
  const blocked = ["ROJO", "GRIS"].reduce((sum, semaphore) => sum + (counters.find((item) => item.semaphore === semaphore)?.total ?? 0), 0);

  const semaphoreHref = (semaphore: string) => {
    const query = new URLSearchParams({ semaforo: semaphore, call: callFilter.value, view: semaphore === "POSIBLES" ? "candidates" : view });
    if (params.class) query.set("class", params.class);
    if (params.q) query.set("q", params.q);
    return "/proximos-examenes?" + query;
  };

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
        <section className="card" aria-label="Acceso rápido a convocatorias" style={{ marginBottom: 18, border: "2px solid #005bbb", background: "#eef5ff" }}>
          <h2>Gestionar convocatoria · {formatExamCallMonth(callFilter.callDate ?? calls[0]?.call_date)}</h2>
          <p>{candidateTotal} pendientes de convocar · {calledTotal} ya convocados en esta vista. Confirma el día y consulta sus respuestas sin volver a convocarlos.</p>
          <div className="form-actions" style={{ flexWrap: "wrap" }}><a className="button" href={candidateTotal ? "#convocar-alumnos" : "#convocatorias-aprobadas"} style={{ background: "#005bbb", color: "white", padding: "14px 20px", borderRadius: 8, fontWeight: 700 }}>{candidateTotal ? "Convocar alumnos" : "Ver convocados y respuestas"}</a><a className="text-link" href="#convocatorias-aprobadas">Confirmar día y ver inscritos</a></div>
        </section>
        {params.approved ? <p className="save-ok" role="status">Convocatoria aprobada{params.examDate ? ` para el ${params.examDate}` : " · día pendiente de confirmar"}. Los alumnos seleccionados ya pueden inscribirse desde su ficha. No se han enviado correos.</p> : null}
        {params.confirmed ? <p className="save-ok" role="status">Día confirmado en las fichas. Se conservan las respuestas e inscripciones.</p> : null}
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

        {params.saved === "recalculate" ? <p className="save-ok">Semaforos recalculados con implicacion, cursos y calendario.</p> : null}
        {params.error === "recalculate" ? <p className="form-error">No se pudieron recalcular los semaforos.</p> : null}

        <section className="grid stats compact" aria-label="Resumen proximos examenes">
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={19} />
            <h2>Requisitos medidos completos</h2>
            <div className="metric">{ready}</div>
          </article>
          <article className="card">
            <AlertTriangle aria-hidden="true" size={19} />
            <h2>Rojos / grises</h2>
            <div className="metric">{blocked}</div>
          </article>
          <article className="card">
            <Clock aria-hidden="true" size={19} />
            <h2>Pendientes de convocar</h2>
            <div className="metric">{candidateTotal}</div>
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
            <span>Primer examen: minimo 6 meses desde el ingreso en el club</span>
            <span>Siguientes examenes: plazo del grado desde el ultimo examen</span>
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

        <p className="muted">Los semaforos y la asistencia mostrados son datos guardados. La prevision se calcula ahora con el historial y el calendario; no modifica la aptitud ni los requisitos academicos.</p>
        <section className="semaphore-strip" aria-label="Semaforos guardados">
          {counters.map((item) => (
            <a
              className={`semaphore-card semaphore-${item.semaphore.toLowerCase().replace(/\s+/g, "-")}`}
              href={semaphoreHref(item.semaphore)}
              key={item.semaphore}
            >
              <span>{item.semaphore}</span>
              <strong>{item.total}</strong>
            </a>
          ))}
          <a
            className="semaphore-card semaphore-posibles"
            href={semaphoreHref("POSIBLES")}
          >
            <span>PENDIENTES DE CONVOCAR</span>
            <strong>{candidateTotal}</strong>
          </a>
        </section>

        <p className="muted">La vista inicial muestra candidatos pendientes de convocar. Los ya convocados están en «Confirmar día y ver inscritos». <a className="text-link" href={(() => { const query = new URLSearchParams({ call: callFilter.value, view: "impossible" }); if (params.class) query.set("class", params.class); if (params.q) query.set("q", params.q); return "/proximos-examenes?" + query; })()}>No llegan con las clases previstas: {impossibleTotal}</a></p>
        <form className="filters exam-filters">
          <label>Vista
            <select name="view" defaultValue={view}>
              <option value="candidates">Pendientes de convocar</option>
              <option value="impossible">No llegan con las clases previstas</option>
              <option value="followup">Seguimiento pendiente</option>
              <option value="all">Todos (administracion)</option>
            </select>
          </label>
          <label>Convocatoria
            <select name="call" defaultValue={callFilter.value}>
              <option value="next">Proxima del club{calls[0] ? " · " + formatExamCallMonth(calls[0].call_date) : " · sin mes configurado"}</option>
              <option value="all">Todas las futuras</option>
              {calls.map((call) => <option key={call.id} value={call.call_date}>{formatExamCallMonth(call.call_date)}</option>)}
            </select>
          </label>
          <label>
            Buscar
            <input name="q" defaultValue={params.q ?? ""} placeholder="Nombre, ID SKBC, ID IKA, grado..." />
          </label>
          <label>
            Semaforo
            <select name="semaforo" defaultValue={!candidatesOnly && normalizedSemaphore === "POSIBLES" ? "" : params.semaforo ?? ""}>
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

        <PlanningApprovals approvals={approvals} minDate={minDate} />
        {view === "candidates" && !filtered.length ? <section id="convocar-alumnos" className="card"><h2>No quedan candidatos pendientes de convocar</h2><p>Consulta los ya convocados para confirmar el día o ver sus respuestas.</p><a className="text-link" href="#convocatorias-aprobadas">Ver convocados y respuestas</a></section> : <ApproveExamCall key={`${callFilter.value}:${params.q ?? ""}:${params.class ?? ""}:${view}:${normalizedSemaphore}:${params.approved ?? ""}`} callDate={callFilter.callDate} minDate={minDate}>
        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Seleccionar</th>
                <th>Kenshi</th>
                <th>ID SKBC</th>
                <th>ID IKA</th>
                <th>Clase</th>
                <th>Grado</th>
                <th>Semaforo guardado</th>
                <th>Proximo examen</th>
                <th>Asistencia guardada</th>
                <th>Aviso</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((item) => {
                const semaphore = normalizeSemaphore(item.semaphore);
                const candidate = candidateByMember.get(item.id);
                const called = existingCall(item.id);
                return (
                  <tr key={item.legacy_id ?? item.display_name}>
                    <td data-label="Seleccionar"><input type="checkbox" name="memberIds" value={item.id} aria-label={`Aprobar convocatoria de ${item.display_name}`} disabled={Boolean(called) || !callFilter.callDate || candidate?.feasibility === "impossible" || !(candidate?.candidate || candidate?.preparationCandidate)} style={{ width: 24, height: 24 }} />{called ? <a href="#convocatorias-aprobadas" className="text-link">{called.response === "accepted" ? "Ya convocado · inscrito" : called.response === "deferred" ? "Ya convocado · aplazado" : "Ya convocado · sin respuesta"}</a> : null}</td>
                    <td data-label="Kenshi">
                      {item.legacy_id ? <a className="text-link" href={`/kenshis/${item.legacy_id}`}>{item.display_name}</a> : <strong>{item.display_name}</strong>}
                    </td>
                    <td data-label="ID SKBC">{item.legacy_id ?? "-"}</td>
                    <td data-label="ID IKA">{item.ika_id || <span className="muted">Pendiente</span>}</td>
                    <td data-label="Clase">{item.class === "kids" ? "Ninos" : "Adultos"}</td>
                    <td data-label="Grado">{item.grade ?? "-"}</td>
                    <td data-label="Semaforo guardado"><span className={`semaphore-pill semaphore-${semaphore.toLowerCase().replace(/\s+/g, "-")}`}>{semaphore}</span></td>
                    <td data-label="Proximo examen">{candidate?.callDate ? formatExamCallMonth(candidate.callDate) : <span className="muted">Sin convocatoria futura</span>}</td>
                    <td data-label="Asistencia guardada">
                      {formatAttendance(item)}
                    </td>
                    <td data-label="Aviso" className="notice-cell">
                      <ExamOutlookPanel outlook={candidate} compact />
                      <details><summary>Ver aviso histórico guardado</summary><small>Aviso guardado: {item.exam_notice ?? "sin aviso calculado"}</small></details>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={10} className="muted">{view === "candidates" ? "No quedan candidatos pendientes de convocar con estos filtros. Consulta los ya convocados y sus respuestas arriba." : "No hay kenshis activos con esos filtros."}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        </ApproveExamCall>}
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
