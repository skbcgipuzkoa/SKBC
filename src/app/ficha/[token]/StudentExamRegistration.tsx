import { ExamContinuityNotice } from "@/components/exam-continuity-notice";
import type { StudentExamInvitation } from "@/lib/exam-invitations";
import { respondExamInvitationFromFichaAction } from "@/app/notificaciones/examenes/actions";
import { resolveStudentExamCall, studentExamCallLabel } from "@/lib/student-exam-call";

export function StudentExamRegistration({ invitation, fichaToken, error, responded }: { invitation: StudentExamInvitation | null; fichaToken: string; error?: string; responded?: string }) {
  if (!invitation?.teacherApprovedAt || !invitation.teacherApprovedBy || !resolveStudentExamCall({ approvedExamOn: invitation.currentExamDate }).approved) return null;
  const pending = !invitation.continuity.allowed;
  const tone = pending ? "#a66a00" : "#178644";
  return <section className="ficha-section" id="inscripcion-examen" style={{ borderTop: `4px solid ${tone}` }}>
    <h2 style={{ color: tone }}>{invitation.response === "deferred" ? "Convocatoria aplazada" : pending ? "Convocatoria pendiente de revalidación" : invitation.dateConfirmed === false ? "Convocado · día pendiente de confirmar" : "Apto para presentarse"}</h2>
    <p>{studentExamCallLabel(invitation.currentExamDate, true, { dateConfirmed: invitation.dateConfirmed, callMonth: invitation.callMonth })} · {invitation.targetGrade}</p>
    <ExamContinuityNotice continuity={invitation.continuity} approved={invitation.response !== "deferred"} />
    <p>{pending ? "La participación necesita revalidación del profesor o recuperar la constancia." : "El profesor ha autorizado tu participación."} Presentarte es un derecho voluntario, no una obligación.</p>
    <p>Examen {invitation.examFee} € + cinturón {invitation.beltFee} € = <strong>{invitation.examFee + invitation.beltFee} €</strong>. Abono anticipado en mano; la aceptación añade una reserva al examen y no acredita el pago.</p>
    {error ? <p className="form-error" role="alert">No se pudo registrar tu respuesta. Comprueba si ya está registrada o consulta con el club.</p> : null}
    {responded ? <p className="save-ok">Tu respuesta se ha registrado.</p> : null}
    {invitation.response ? <p><strong>{invitation.response === "accepted" ? pending ? "Reserva aceptada · pendiente de revalidación" : "Has aceptado · reserva añadida al examen" : "Lo dejas para la siguiente convocatoria"}</strong></p> : invitation.registrationClosed ? <p>Plazo de inscripción cerrado; consulta con el profesor.</p> : <form action={respondExamInvitationFromFichaAction} style={{ display: "grid", gap: 12, maxWidth: "100%" }}>
      <input type="hidden" name="fichaToken" value={fichaToken} />
      <input type="hidden" name="invitationId" value={invitation.invitationId} />
      <label>Mensaje opcional para el club<textarea name="message" rows={3} maxLength={2000} style={{ width: "100%", boxSizing: "border-box" }} /></label>
      <button name="response" value="accepted" disabled={pending} type="submit" style={{ minHeight: 44, whiteSpace: "normal" }}>Sí, me inscribo</button>
      <button name="response" value="deferred" type="submit" style={{ minHeight: 44, whiteSpace: "normal" }}>Lo dejo para la siguiente convocatoria</button>
    </form>}
    {invitation.message ? <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>Tu mensaje: {invitation.message}</p> : null}
  </section>;
}
