import type { ExamInvitation } from "@/lib/exam-invitations";
import { revokeExamInvitationApprovalAction } from "./actions";
import { formatExamCallMonth } from "@/lib/exam-call";

export function InvitationResponses({ invitations }: { invitations: ExamInvitation[] }) {
  return <section className="card invitation-responses"><h2>Respuestas e inscripción</h2>
    <p className="muted">La aceptación añade la reserva al examen y no acredita el pago. El abono anticipado se realiza en mano. Aplazar se refiere solo a esta convocatoria.</p>
    {invitations.map((invitation) => <article key={invitation.id} className="invitation-response">
      <h3>{invitation.snapshot.name} · {invitation.snapshot.targetGrade}</h3>
      <p>{invitation.teacher_approved_at ? "Aprobación del profesor registrada" : "Pendiente de aprobación del profesor"}</p>
      {invitation.teacher_approved_at ? <form action={revokeExamInvitationApprovalAction}><input type="hidden" name="invitationId" value={invitation.id} /><button className="secondary-button" type="submit" style={{ minHeight: 44 }}>Retirar autorización de convocatoria</button></form> : null}
      <p>Convocatoria {formatExamCallMonth(invitation.snapshot.callKey)} · {invitation.snapshot.dateConfirmed === false ? "día pendiente de confirmar" : `examen ${invitation.snapshot.examDate}`} · <a className="text-link" href={`/examenes/${invitation.exam_event_id}`}>Abrir examen</a></p>
      <p><span className="invitation-status">{invitation.response === "accepted" ? "Acepta · reserva añadida al examen" : invitation.response === "deferred" ? "Aplazada" : "Sin respuesta"}</span> · Entrega: {invitation.delivery_status === "sending" ? "Sin confirmar · revisar manualmente, no reenviar" : invitation.delivery_status === "failed" ? "Fallida" : invitation.delivery_status === "sent" ? "Enviada" : "Borrador"}</p>
      {invitation.responded_at ? <p className="muted">Respuesta recibida: {new Date(invitation.responded_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p> : null}
      {invitation.message ? <p className="invitation-preview-body">Mensaje: {invitation.message}</p> : null}
      <p>Examen {invitation.exam_fee} € + cinturón {invitation.belt_fee} € = <strong>{invitation.exam_fee + invitation.belt_fee} €</strong>. Abono anticipado en mano.</p>
    </article>)}
    {!invitations.length ? <p className="muted">Todavía no hay respuestas ni reservas.</p> : null}
  </section>;
}
