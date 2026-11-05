import { redirect } from "next/navigation";
import { SidebarNav } from "@/app/components/SidebarNav";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadExamOutlooks } from "@/lib/exam-outlook-data";
import { getUpcomingExamCalls } from "@/lib/exam-calls-data";
import { resolveCallFilter, formatExamCallMonth } from "@/lib/exam-call";
import { CandidatePicker } from "./CandidatePicker";
import { getExamInvitationBatch, listExamInvitationBatches, listExamInvitationResponses } from "@/lib/exam-invitations";
import { InvitationResponses } from "./responses";
import { approveExamInvitationBatchAction, createExamInvitationDraftAction, sendExamInvitationBatchAction } from "./actions";
import "./invitations.css";

export default async function ExamInvitationsPage({ searchParams }: { searchParams: Promise<{ call?: string; batch?: string; saved?: string; error?: string; detail?: string; sent?: string; failed?: string; unconfirmed?: string }> }) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const params = await searchParams;
  const [batch, batches, responses] = await Promise.all([params.batch ? getExamInvitationBatch(params.batch) : Promise.resolve(null), listExamInvitationBatches(), listExamInvitationResponses()]);
  const [calls, outlooks, membersResult] = await Promise.all([
    getUpcomingExamCalls(), loadExamOutlooks(),
    createAdminClient().from("members").select("id,family_email").eq("status", "active").returns<Array<{ id: string; family_email: string | null }>>(),
  ]);
  if (membersResult.error) throw membersResult.error;
  const filter = resolveCallFilter(params.call, calls.map((call) => call.call_date));
  const emails = new Map((membersResult.data ?? []).map((member) => [member.id, member.family_email]));
  const candidates = [...outlooks.values()].filter((outlook) => (outlook.candidate || outlook.preparationCandidate) && (filter.all || outlook.callDate === filter.callDate)).map((outlook) => ({
    id: outlook.memberId, name: outlook.name, email: emails.get(outlook.memberId) ?? null,
    group: outlook.memberClass === "kids" ? "Niños" : "Adultos", grade: outlook.targetGrade,
    callKey: outlook.callDate ?? "", reason: `${outlook.currentReady || outlook.classification === "projected" ? "Previsión favorable" : "Preparación con refuerzo necesario"}${outlook.deficits.length ? ` · ${outlook.deficits.join("; ")}` : ""}`,
  }));
  const allApproved = Boolean(batch?.invitations.length) && batch!.invitations.every((invitation) => Boolean(invitation.teacher_approved_at) && !invitation.revoked_at && invitation.teacher_approved_exam_date === invitation.snapshot.examDate && Date.parse(invitation.expires_at) > Date.now());
  return <div className="shell"><SidebarNav current="/notificaciones" /><main className="main exam-invitations-main">
    <div className="topbar"><div><p className="eyebrow">Convocatoria voluntaria</p><h1>Invitaciones de examen</h1></div></div>
    {params.saved ? <p className="save-ok">Operación registrada.</p> : null}
    {params.sent !== undefined ? <p className={Number(params.failed) || Number(params.unconfirmed) ? "form-error" : "save-ok"}>Enviados confirmados: {params.sent}. Fallidos: {params.failed ?? "0"}. Entregas sin confirmar: {params.unconfirmed ?? "0"}. Consulta el estado individual abajo; revisa manualmente las entregas sin confirmar antes de cualquier reenvío.</p> : null}
    {params.error ? <p className="form-error">No se pudo completar la operación{params.detail ? `: ${params.detail}` : "."}</p> : null}
    <section className="card"><h2>1. Elegir convocatoria y candidatos</h2>
      <form className="filters"><label>Convocatoria<select name="call" defaultValue={filter.value}><option value="next">Próxima convocatoria{calls[0] ? ` · ${formatExamCallMonth(calls[0].call_date)}` : " · sin configurar"}</option>{calls.map((call) => <option key={call.id} value={call.call_date}>{formatExamCallMonth(call.call_date)}</option>)}<option value="all">Todas las convocatorias futuras</option></select></label><button type="submit">Mostrar candidatos</button></form>
      <p className="muted">Cada invitación es individual. Presentarse es un derecho voluntario, no una obligación. Una previsión no garantiza superar los requisitos ni el examen.</p>
      <form action={createExamInvitationDraftAction} className="invitation-form">
        <label>Fecha real del examen (obligatoria antes de preparar)<input type="date" name="examDate" required /></label>
        <label>Título del examen<input name="title" placeholder="Examen de convocatoria SKBC" maxLength={200} /></label>
        <label>Instrucciones opcionales<textarea name="instructions" rows={3} maxLength={4000} placeholder="Horario, lugar o instrucciones confirmadas por el club" /></label>
        <label>Asunto editable<input name="subject" placeholder="Vacío: asunto personalizado con el nombre de cada kenshi" maxLength={200} /></label>
        <label>Mensaje personalizado adicional<textarea name="body" rows={4} maxLength={6000} placeholder="Texto opcional que se añadirá a cada email. La información personal de preparación, importe y respuesta se conserva." /></label>
        <CandidatePicker key={filter.value} candidates={candidates} calls={calls} initialCall={filter.callDate ?? calls[0]?.call_date ?? ""} />
      </form>
    </section>
    {batch ? <section className="card"><h2>2. Vista previa guardada · {batch.invitations[0]?.snapshot.dateConfirmed === false ? `${formatExamCallMonth(batch.call_key)} · día pendiente` : batch.exam_date}</h2><p className="muted">Estos textos son la copia guardada para cada destinatario. Para cambiarlos, prepara otro borrador. Abrir esta página no envía emails.</p>
      <form action={approveExamInvitationBatchAction}><input type="hidden" name="batchId" value={batch.id} /><button type="submit" style={{ minHeight: 44 }}>Aprobar convocatoria y activar inscripción en las fichas</button></form>
      <p className="muted">Solo esta aprobación expresa autoriza la convocatoria en la ficha del alumno. Sus cuatro bloques de progreso se conservan. Autorizar la convocatoria no aprueba el examen ni acredita el pago.</p>
      {batch.invitations.map((invitation) => <article key={invitation.id} className="invitation-response"><h3>{invitation.snapshot.name} · {invitation.snapshot.email}</h3><p><strong>{invitation.subject}</strong></p><p className="invitation-preview-body">{invitation.body}</p><p>Al enviar se añade un enlace privado para aceptar, aplazar y dejar un mensaje.</p><span className="invitation-status">{invitation.delivery_status === "sending" ? "Entrega sin confirmar · revisar manualmente, no reenviar" : invitation.delivery_status === "failed" ? "Envío fallido · se puede reintentar" : invitation.delivery_status === "sent" ? "Enviado" : "Borrador sin enviar"}</span>{invitation.delivery_error ? <p className="form-error">{invitation.delivery_error}</p> : null}</article>)}
      {batch.invitations.some((invitation) => invitation.delivery_status === "draft") ? <form action={sendExamInvitationBatchAction}><input type="hidden" name="batchId" value={batch.id} /><button type="submit" disabled={!allApproved} style={{ minHeight: 44 }}>Enviar ahora los emails de este borrador</button></form> : <p className="muted">No quedan invitaciones pendientes de envío en este borrador.</p>}
      {batch.invitations.some((invitation) => invitation.delivery_status === "failed") ? <form action={sendExamInvitationBatchAction}><input type="hidden" name="batchId" value={batch.id} /><input type="hidden" name="retryFailed" value="true" /><button type="submit" disabled={!allApproved} className="secondary-button" style={{ minHeight: 44 }}>Reintentar solo los envíos fallidos</button></form> : null}
    </section> : null}
    <section className="card"><h2>Borradores y envíos</h2>{batches.map((item) => <p key={item.id}><a className="text-link" href={`/notificaciones/examenes?batch=${item.id}`}>{formatExamCallMonth(item.call_key)} · {new Date(item.created_at).toLocaleDateString("es-ES")}</a></p>)}{!batches.length ? <p className="muted">Todavía no hay invitaciones preparadas.</p> : null}</section>
    <InvitationResponses invitations={responses} />
    <p><a className="secondary-link" href="/notificaciones">Volver a notificaciones</a> · <a className="secondary-link" href="/examenes">Ver exámenes</a></p>
  </main></div>;
}
