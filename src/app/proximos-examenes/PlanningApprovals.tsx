import { formatExamCallMonth, examCallMonthEnd } from "@/lib/exam-call";
import type { listPlanningExamApprovals } from "@/lib/exam-invitations";
import { confirmPlanningExamDateAction } from "./actions";

export function PlanningApprovals({ approvals, minDate }: { approvals: Awaited<ReturnType<typeof listPlanningExamApprovals>>; minDate: string }) {
  return <section id="convocatorias-aprobadas" className="card" style={{ marginBottom: 18, scrollMarginTop: 180 }}>
    <h2>Convocados · confirmar día y ver respuestas</h2>
    {!approvals.length ? <p className="muted">Cuando apruebes una convocatoria, aquí podrás confirmar el día y consultar quién se ha inscrito.</p> : approvals.map((event) => <article key={event.eventId} style={{ borderTop: "1px solid #d9e3ef", padding: "16px 0" }}>
      <h3>{formatExamCallMonth(event.callMonth)} · {event.dateConfirmed ? "Día confirmado" : "Día pendiente de confirmar"}</h3>
      {event.dateConfirmed && event.examDate ? <p>Examen: <strong>{event.examDate.split("-").reverse().join("/")}</strong></p> : null}
      <p>{event.participants.length} convocados · {event.acceptedCount} inscritos · {event.deferredCount} aplazan · {event.pendingCount} sin respuesta.</p>
      <details><summary>Ver alumnos convocados</summary><ul>{event.participants.map((person) => <li key={person.invitationId}>{person.name} · {person.response === "accepted" ? "Inscrito" : person.response === "deferred" ? "Lo deja para la siguiente" : "Sin respuesta"}</li>)}</ul></details>
      <form action={confirmPlanningExamDateAction} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", marginTop: 12 }}>
        <input type="hidden" name="eventId" value={event.eventId} />
        <label>Confirmar día del examen<input type="date" name="examDate" required min={[minDate, event.callMonth + "-01"].sort().at(-1)} max={examCallMonthEnd(event.callMonth) ?? undefined} defaultValue={event.examDate ?? ""} /></label>
        <button type="submit" style={{ minHeight: 44 }}>Confirmar día en las fichas</button>
      </form>
      <p className="muted">Se conservan las respuestas y reservas. La preparación se comprobará para el día elegido.</p>
    </article>)}
  </section>;
}
