import { getUpcomingExamCalls } from "@/lib/exam-calls-data";
import { resolveCallFilter, madridCallToday, formatExamCallMonth } from "@/lib/exam-call";
import { ApproveExamCall } from "./ApproveExamCall";
import { PlanningApprovals } from "./PlanningApprovals";
import { listPlanningExamApprovals } from "@/lib/exam-invitations";
import { loadAllPages } from "@/lib/load-all-pages";
import { loadExamOutlooks } from "@/lib/exam-outlook-data";
import { ExamOutlookPanel } from "@/app/components/exam-outlook-panel";
import { LogOut } from "lucide-react";
import "./planning.css";
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
  const selectedMonth = callFilter.callDate?.slice(0, 7);
  const search = (params.q ?? "").trim().toLocaleLowerCase("es");
  const matchesMember = (id: string, name: string) => {
    const member = members.find((item) => item.id === id);
    return (!params.class || member?.class === params.class) && (!search || `${name} ${member?.legacy_id ?? ""} ${member?.ika_id ?? ""} ${member?.grade ?? ""}`.toLocaleLowerCase("es").includes(search));
  };
  const scopedApprovals = approvals.filter((event) => callFilter.all || event.callMonth === selectedMonth).map((event) => {
    const participants = event.participants.filter((person) => matchesMember(person.memberId, person.name));
    return { ...event, participants, acceptedCount: participants.filter((person) => person.response === "accepted").length, deferredCount: participants.filter((person) => person.response === "deferred").length, pendingCount: participants.filter((person) => !person.response).length };
  }).filter((event) => event.participants.length);
  const calledByMemberMonth = new Map(approvals.flatMap((event) => event.participants.map((person) => [`${person.memberId}:${event.callMonth}`, person.response] as const)));
  const existingCall = (id: string) => {
    const date = candidateByMember.get(id)?.callDate;
    return Boolean(date && calledByMemberMonth.has(`${id}:${date.slice(0, 7)}`));
  };
  const normalizedSemaphore = params.semaforo ? normalizeSemaphore(params.semaforo) : "";
  const view = ["called", "impossible", "followup", "all"].includes(params.view ?? "") ? params.view! : "candidates";
  const scoped = members.filter((item) => item.status === "active" && matchesMember(item.id, item.display_name)).filter((item) => {
    const date = candidateByMember.get(item.id)?.callDate;
    return callFilter.all ? Boolean(date) : Boolean(date && selectedMonth && date.slice(0, 7) === selectedMonth);
  });
  const pending = scoped.filter((item) => candidateByMember.get(item.id)?.candidate && !existingCall(item.id));
  const followup = scoped.filter((item) => !candidateByMember.get(item.id)?.candidate && !existingCall(item.id));
  const approvedMemberIds = new Set(scopedApprovals.flatMap((event) => event.participants.map((person) => person.memberId)));
  const summaryScoped = members.filter((item) => item.status === "active" && matchesMember(item.id, item.display_name) && (scoped.some((member) => member.id === item.id) || approvedMemberIds.has(item.id)));
  const calledTotal = scopedApprovals.reduce((total, event) => total + event.participants.length, 0);
  const deferred = scopedApprovals.flatMap((event) => event.participants).filter((person) => person.response === "deferred");
  const deferredTargets = [...new Set(deferred.map((person) => candidateByMember.get(person.memberId)?.callDate).filter((date): date is string => Boolean(date)))];
  const visible = (view === "candidates" ? pending : view === "followup" ? followup : view === "impossible" ? scoped.filter((item) => candidateByMember.get(item.id)?.feasibility === "impossible") : summaryScoped).filter((item) => !normalizedSemaphore || normalizedSemaphore === "POSIBLES" || normalizeSemaphore(item.semaphore) === normalizedSemaphore);
  const href = (nextView: string, semaphore?: string, call = callFilter.value) => {
    const query = new URLSearchParams({ call, view: nextView });
    if (params.q) query.set("q", params.q);
    if (params.class) query.set("class", params.class);
    if (semaphore) query.set("semaforo", semaphore);
    return "/proximos-examenes?" + query;
  };
  const rows = <div className="planning-students">{visible.map((item) => {
    const outlook = candidateByMember.get(item.id);
    const called = existingCall(item.id) || approvedMemberIds.has(item.id);
    const selectable = view === "candidates" && !called && Boolean(callFilter.callDate) && outlook?.feasibility !== "impossible" && Boolean(outlook?.candidate || outlook?.preparationCandidate);
    return <article className="planning-student" key={item.id}>
      <div className="planning-student-heading">
        {view === "candidates" ? <input type="checkbox" name="memberIds" value={item.id} disabled={!selectable} aria-label={`Aprobar convocatoria de ${item.display_name}`} /> : null}
        <div><h3>{item.legacy_id ? <a className="text-link" href={`/kenshis/${item.legacy_id}`}>{item.display_name}</a> : item.display_name}</h3><p>{item.class === "kids" ? "Niños" : "Adultos"} · {item.grade ?? "Sin grado"} → {outlook?.targetGrade ?? "Por definir"}</p></div>
        <span className="planning-state">{called ? "Ya convocado" : outlook?.feasibility === "impossible" ? "Necesita más tiempo" : outlook?.currentReady ? "Requisitos medidos completos" : outlook?.classification === "projected" ? "Previsión favorable" : "Preparación con refuerzo"}</span>
      </div>
      <details><summary>Ver preparación y evidencias</summary><ExamOutlookPanel outlook={outlook} compact /></details>
    </article>;
  })}{!visible.length ? <p className="muted">No hay alumnos con estos filtros.</p> : null}</div>;
  return <div className="shell"><SidebarNav current="/proximos-examenes" /><main className="main exam-planning-main">
    <div className="topbar"><div><p className="eyebrow">Planificación y respuestas</p><h1>Próximos exámenes</h1></div><form action={logoutAction}><button className="icon-button" type="submit" aria-label="Salir"><LogOut size={18} /></button></form></div>
    {params.approved ? <p className="save-ok" role="status">Convocatoria aprobada. Consulta en «Convocados y respuestas» el día confirmado o pendiente de cada grado. Los alumnos ya pueden responder desde su ficha. No se han enviado correos.</p> : null}
    {params.confirmed ? <p className="save-ok">Día confirmado. Se conservan las respuestas e inscripciones.</p> : null}
    {params.error ? <p className="form-error" role="alert">{params.error === "recalculate" ? "No se pudieron recalcular los semáforos." : params.error}</p> : null}
    {params.saved === "recalculate" ? <p className="save-ok">Semáforos recalculados.</p> : null}
    <form className="planning-filters card"><input type="hidden" name="view" value={view} /><label>Convocatoria<select name="call" defaultValue={callFilter.value}><option value="next">Próxima · {formatExamCallMonth(calls[0]?.call_date)}</option>{calls.map((call) => <option value={call.call_date} key={call.id}>{formatExamCallMonth(call.call_date)}</option>)}<option value="all">Todas las futuras</option></select></label><label>Buscar<input name="q" defaultValue={params.q ?? ""} placeholder="Nombre o identificador" /></label><label>Grupo<select name="class" defaultValue={params.class ?? ""}><option value="">Todos</option><option value="kids">Niños</option><option value="adults">Adultos</option></select></label><button type="submit">Aplicar</button></form>
    <nav className="planning-tabs" aria-label="Estado de convocatoria"><a aria-current={view === "candidates" ? "page" : undefined} href={href("candidates")}>Por convocar <strong>{pending.length}</strong></a><a aria-current={view === "called" ? "page" : undefined} href={href("called")}>Convocados y respuestas <strong>{calledTotal}</strong></a><a aria-current={["followup", "impossible", "all"].includes(view) ? "page" : undefined} href={href("followup")}>Seguimiento <strong>{followup.length}</strong></a></nav>
    <p className="muted">{callFilter.all ? "Todas las convocatorias futuras" : formatExamCallMonth(callFilter.callDate)} · La aprobación del profesor es independiente de los indicadores de preparación.</p>
    {deferred.length ? <p className="planning-deferred">{deferred.length === 1 ? "1 alumno lo deja para la próxima convocatoria." : `${deferred.length} alumnos lo dejan para la próxima convocatoria.`}{deferredTargets.map((date) => <a key={date} className="text-link" href={href("candidates", undefined, date)}> Ver {formatExamCallMonth(date)}</a>)}</p> : null}
    {view === "called" ? <PlanningApprovals approvals={scopedApprovals} minDate={minDate} /> : view === "candidates" ? visible.length ? <ApproveExamCall key={`${callFilter.value}:${params.q ?? ""}:${params.class ?? ""}:${params.approved ?? ""}`} callDate={callFilter.callDate} minDate={minDate}>{rows}</ApproveExamCall> : <section className="card"><h2>No quedan candidatos pendientes de convocar</h2><p>Consulta los convocados y sus respuestas para este mes.</p><a className="text-link" href={href("called")}>Ver convocados y respuestas</a></section> : <section className="card"><h2>{view === "impossible" ? "Necesitan más tiempo" : view === "all" ? "Todos los alumnos del mes" : "Seguimiento"}</h2><p className="muted">Mostrando {visible.length} alumnos. Abre la preparación para revisar las evidencias.</p>{rows}</section>}
    <details className="card planning-advanced"><summary>Opciones avanzadas · semáforos y reglas</summary><p className="muted">Los semáforos guardados incluyen a todos los alumnos del mes y los filtros de búsqueda/grupo, también a los ya convocados. La prevision se calcula ahora y no modifica los requisitos académicos.</p><div className="planning-legacy-colors">{semaphoreOrder.map((color) => <a key={color} href={href("all", color)} className={`semaphore-pill semaphore-${color.toLowerCase()}`}>{color} <strong>{summaryScoped.filter((item) => normalizeSemaphore(item.semaphore) === color).length}</strong></a>)}</div><p><a className="text-link" href={href("all")}>Todos los alumnos del mes</a> · <a className="text-link" href={href("impossible")}>No llegan con las clases previstas</a> · <a className="text-link" href={href("followup")}>Seguimiento pendiente</a></p><h3>Motor de convocatoria SKBC</h3><p>Calcula martes y jueves reales, cierres del calendario, tiempo, asistencia y progreso técnico. La valoración final corresponde al profesor.</p><form action={recalculateAllExamStatusesAction}><button type="submit" className="secondary-button">Recalcular semáforos</button></form></details>
  </main></div>;
}
function normalizeSemaphore(value: string | null | undefined) { return String(value ?? "").trim().toUpperCase() || "SIN DATOS"; }
