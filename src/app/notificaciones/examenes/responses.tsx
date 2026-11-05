import type { ExamInvitation } from "@/lib/exam-invitations";

export function InvitationResponses({ invitations }: { invitations: ExamInvitation[] }) {
  return <section className="card invitation-responses"><h2>Respuestas e inscripción</h2>
    <p className="muted">La aceptación añade la reserva al examen y no acredita el pago. El abono anticipado se realiza en mano. Aplazar se refiere solo a esta convocatoria.</p>
    {invitations.map((invitation) => <article key={invitation.id} className="invitation-response">
      <h3>{invitation.snapshot.name} · {invitation.snapshot.targetGrade}</h3>
      <p>Convocatoria {invitation.snapshot.callKey} · examen {invitation.snapshot.examDate} · <a className="text-link" href={`/examenes/${invitation.exam_event_id}`}>Abrir examen</a></p>
      <p><span className="invitation-status">{invitation.response === "accepted" ? "Acepta · reserva añadida al examen" : invitation.response === "deferred" ? "Aplazada" : "Sin respuesta"}</span> · Entrega: {invitation.delivery_status === "sending" ? "Sin confirmar · revisar manualmente, no reenviar" : invitation.delivery_status === "failed" ? "Fallida" : invitation.delivery_status === "sent" ? "Enviada" : "Borrador"}</p>
      {invitation.responded_at ? <p className="muted">Respuesta recibida: {new Date(invitation.responded_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p> : null}
      {invitation.message ? <p className="invitation-preview-body">Mensaje: {invitation.message}</p> : null}
      <p>Examen {invitation.exam_fee} € + cinturón {invitation.belt_fee} € = <strong>{invitation.exam_fee + invitation.belt_fee} €</strong>. Abono anticipado en mano.</p>
    </article>)}
    {!invitations.length ? <p className="muted">Todavía no hay respuestas ni reservas.</p> : null}
  </section>;
}
