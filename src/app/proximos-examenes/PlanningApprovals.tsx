import { formatExamCallMonth, examCallMonthEnd } from "@/lib/exam-call";
import type { listPlanningExamApprovals } from "@/lib/exam-invitations";
import { confirmPlanningExamDateAction } from "./actions";

export function PlanningApprovals({ approvals, minDate }: { approvals: Awaited<ReturnType<typeof listPlanningExamApprovals>>; minDate: string }) {
  return <section id="convocatorias-aprobadas" className="card">
    <h2>Convocados y respuestas</h2>
    {!approvals.length ? <p className="muted">No hay alumnos convocados para este mes con estos filtros.</p> : approvals.map((event) => {
      const dateForm = <form action={confirmPlanningExamDateAction} className="planning-date-form"><input type="hidden" name="eventId" value={event.eventId} /><label>Día del examen<input type="date" name="examDate" required min={[minDate, event.callMonth + "-01"].sort().at(-1)} max={examCallMonthEnd(event.callMonth) ?? undefined} defaultValue={event.examDate ?? ""} /></label><button type="submit">Confirmar día en las fichas</button></form>;
      return <article key={event.eventId} style={{ borderTop: "1px solid #d9e3ef", padding: "16px 0" }}>
        <h3>{formatExamCallMonth(event.callMonth)}</h3>
        <p>{event.dateConfirmed && event.examDate ? `Día confirmado: ${event.examDate.split("-").reverse().join("/")}` : "Día pendiente de confirmar"} · {event.acceptedCount} inscritos · {event.deferredCount} aplazan · {event.pendingCount} sin respuesta</p>
        <ul className="planning-participants">{event.participants.map((person) => <li key={person.invitationId}><strong>{person.name}</strong><span>{person.response === "accepted" ? "Inscrito · reserva añadida" : person.response === "deferred" ? "Lo deja para la siguiente" : "Sin respuesta"}</span></li>)}</ul>
        {event.dateConfirmed ? <details><summary>Cambiar el día confirmado</summary>{dateForm}<p className="muted">Se conservan las respuestas y reservas. La preparación se comprobará para el día elegido.</p></details> : <>{dateForm}<p className="muted">Puedes confirmar el día más adelante; las respuestas y reservas se conservan.</p></>}
      </article>;
    })}
  </section>;
}
