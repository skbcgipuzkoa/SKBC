import { getPublicExamInvitation } from "@/lib/exam-invitations";
import { respondExamInvitationAction } from "@/app/notificaciones/examenes/actions";
import { formatExamCallMonth } from "@/lib/exam-call";
import "@/app/notificaciones/examenes/invitations.css";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function PublicInvitationPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ responded?: string; error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const invitation = await getPublicExamInvitation(token);
  if (!invitation) return <main className="invitation-public"><section className="card"><h1>Invitación no disponible</h1><p>El enlace no es válido o ha sido revocado. Consulta con el club.</p></section></main>;
  return <main className="invitation-public"><section className="card"><p className="eyebrow">SKBC · invitación personal</p><h1>{invitation.snapshot.name}, tu convocatoria de examen</h1>
    {query.responded ? <p className="save-ok">Tu respuesta se ha registrado.</p> : null}
    {query.error ? <p className="form-error" role="alert">No se pudo registrar tu respuesta. Revisa si ya está registrada o consulta con el club antes de volver a intentarlo.</p> : null}
    <p><strong>{invitation.dateConfirmed === false ? `Convocatoria: ${formatExamCallMonth(invitation.callMonth)} · día pendiente de confirmar` : `Fecha actual del examen: ${invitation.currentExamDate}`}</strong> · grado {invitation.snapshot.targetGrade}</p>
    <p className="invitation-preview-body">{invitation.body}</p>
    <p><strong>Examen {invitation.exam_fee} € + cinturón {invitation.belt_fee} € = {invitation.exam_fee + invitation.belt_fee} €.</strong></p>
    <p>Presentarte es un derecho voluntario, no una obligación. Aceptar añade tu reserva al examen y no acredita el pago. La inscripción requiere el abono anticipado en mano. El profesor debe confirmar la preparación final.</p>
    {invitation.response ? <p className="invitation-status">{invitation.response === "accepted" ? "Has aceptado · reserva añadida al examen" : "Has aplazado esta convocatoria"}</p> : invitation.expired ? <p className="form-error">Esta invitación ha caducado. Consulta con el club.</p> : <form action={respondExamInvitationAction}>
      <input type="hidden" name="token" value={token} />
      <label>Mensaje opcional para la administración<textarea name="message" rows={4} maxLength={2000} placeholder="Puedes dejar aquí una consulta o comentario" /></label>
      <button name="response" value="accepted" type="submit">Sí, me inscribo</button>
      <button name="response" value="deferred" type="submit" className="secondary-button">Lo dejo para la siguiente convocatoria</button>
    </form>}
    {invitation.message ? <p className="invitation-preview-body">Tu mensaje: {invitation.message}</p> : null}
  </section></main>;
}
