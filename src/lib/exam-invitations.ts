import {
  decodeExamAssignments,
  encodeExamAssignments,
} from "@/lib/integrated-exam-assignments";
import { createHash, randomBytes } from "node:crypto";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadExamOutlooks } from "@/lib/exam-outlook-data";
import { createIntegratedExamEvent } from "@/lib/integrated-exams";
import { createTransporter } from "@/lib/email-notifications";
export type InvitationSnapshot = {
  name: string;
  memberClass: "kids" | "adults";
  currentGrade: string | null;
  targetGrade: string;
  callKey: string;
  examDate: string;
  email: string;
  reason: string;
  deficits: string[];
  instructions: string;
};
export type ExamInvitation = {
  id: string;
  batch_id: string;
  member_id: string;
  exam_event_id: string;
  snapshot: InvitationSnapshot;
  subject: string;
  body: string;
  delivery_status: string;
  delivery_error: string | null;
  response: "accepted" | "deferred" | null;
  responded_at: string | null;
  message: string | null;
  exam_fee: number;
  belt_fee: number;
  expires_at: string;
  revoked_at: string | null;
};
export type ExamInvitationBatch = {
  id: string;
  call_key: string;
  exam_date: string;
  instructions: string;
  created_at: string;
  invitations: ExamInvitation[];
};
export async function requireInvitationAdmin() {
  if (!(await hasInternalAccess()))
    throw new Error("Acceso interno requerido.");
}
export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}
export async function listExamInvitationBatches() {
  await requireInvitationAdmin();
  const { data, error } = await createAdminClient()
    .from("exam_invitation_batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Omit<ExamInvitationBatch, "invitations">[];
}
export async function getExamInvitationBatch(id: string) {
  await requireInvitationAdmin();
  const db = createAdminClient();
  const { data, error } = await db
    .from("exam_invitation_batches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: rows, error: e } = await db
    .from("exam_invitations")
    .select("*")
    .eq("batch_id", id);
  if (e) throw e;
  return { ...data, invitations: rows ?? [] } as ExamInvitationBatch;
}
export async function listExamInvitationResponses(eventId?: string) {
  await requireInvitationAdmin();
  let q = createAdminClient()
    .from("exam_invitations")
    .select("*")
    .order("responded_at", { ascending: false });
  if (eventId) q = q.eq("exam_event_id", eventId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ExamInvitation[];
}
export async function getPublicExamInvitation(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await createAdminClient()
    .from("exam_invitations")
    .select(
      "id,snapshot,subject,body,response,message,exam_fee,belt_fee,expires_at,revoked_at,delivery_status,exam_events(exam_date,title)",
    )
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    data.revoked_at ||
    !["sending", "sent"].includes(data.delivery_status)
  )
    return null;
  return {
    ...data,
    currentExamDate:
      (data.exam_events as unknown as { exam_date: string } | null)
        ?.exam_date ?? data.snapshot.examDate,
    expired: Date.parse(data.expires_at) <= Date.now(),
  } as Pick<
    ExamInvitation,
    | "id"
    | "snapshot"
    | "subject"
    | "body"
    | "response"
    | "message"
    | "exam_fee"
    | "belt_fee"
    | "expires_at"
  > & { expired: boolean; currentExamDate: string };
}
export async function loadExamInvitationCandidates() {
  await requireInvitationAdmin();
  const outlooks = await loadExamOutlooks();
  const { data, error } = await createAdminClient()
    .from("members")
    .select("id,family_email")
    .eq("status", "active");
  if (error) throw error;
  const emails = new Map(
    (data ?? []).map((x) => [x.id, x.family_email as string | null]),
  );
  return [...outlooks.values()]
    .filter((x) => x.candidate || x.preparationCandidate)
    .map((x) => ({ ...x, email: emails.get(x.memberId) ?? null }));
}
export function isBareInvitationEmail(value: string) {
  return (
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
      value,
    ) && value.split("@").length === 2
  );
}
function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export async function createExamInvitationDraft(input: {
  memberIds: string[];
  callKey: string;
  examDate: string;
  instructions: string;
  subject?: string;
  body?: string;
  title?: string;
}) {
  await requireInvitationAdmin();
  if (
    !validDate(input.examDate) ||
    Date.parse(input.examDate + "T00:00:00Z") <= Date.now()
  )
    throw new Error("Indica una fecha futura real de examen.");
  if (
    !validDate(input.callKey) ||
    input.instructions.length > 5000 ||
    (input.body?.length ?? 0) > 10000 ||
    (input.subject?.length ?? 0) > 200
  )
    throw new Error("Revisa los datos de la convocatoria.");
  const ids = [...new Set(input.memberIds)];
  const all = await loadExamInvitationCandidates();
  const canonical = ids.map((id) => all.find((x) => x.memberId === id));
  if (!ids.length || canonical.some((x) => !x || x.callDate !== input.callKey))
    throw new Error("La selección ha cambiado; revisa los candidatos.");
  const actualOutlooks = await loadExamOutlooks({
    memberIds: ids,
    examDateOverride: input.examDate,
  });
  const selected = canonical.map((member) => {
    const actual = actualOutlooks.get(member!.memberId);
    if (!actual?.callDate || actual.callDate !== input.examDate)
      throw new Error(
        "La fecha real no permite cumplir el tiempo mínimo o requiere revisar los datos del ciclo.",
      );
    return { ...actual, email: member!.email };
  });
  const db = createAdminClient();
  const { data: batch, error } = await db
    .from("exam_invitation_batches")
    .insert({
      call_key: input.callKey,
      exam_date: input.examDate,
      instructions: input.instructions,
    })
    .select("id")
    .single();
  if (error) throw error;
  const events: string[] = [];
  const rows: Record<string, unknown>[] = [];
  try {
    for (const cls of ["kids", "adults"] as const) {
      const members = selected.filter((x) => x!.memberClass === cls);
      if (!members.length) continue;
      const event = await createIntegratedExamEvent({
        title: input.title || `Convocatoria ${input.callKey} · ${cls}`,
        examDate: input.examDate,
        programType: cls,
        memberIds: members.map((x) => x!.memberId),
        examinerNames: [],
        enrollStudents: false,
        passPercentage: 70,
      });
      events.push(event.eventId);
      const meta = await db
        .from("exam_events")
        .update({ call_date: input.callKey, is_retake: false })
        .eq("id", event.eventId);
      if (meta.error) throw meta.error;
      for (const m of members) {
        const emails = (m!.email ?? "").split(/[;,\s]+/).filter(Boolean);
        if (emails.length !== 1 || !isBareInvitationEmail(emails[0]))
          throw new Error(`Revisa el email único de ${m!.name}.`);
        const snapshot: InvitationSnapshot = {
          name: m!.name,
          memberClass: cls,
          currentGrade: m!.currentGrade,
          targetGrade: m!.targetGrade,
          callKey: input.callKey,
          examDate: input.examDate,
          email: emails[0],
          reason:
            m!.classification === "projected" || m!.currentReady
              ? m!.currentReady
                ? "Los requisitos actuales constan cubiertos, pendientes de revisión final del profesor."
                : "Proyección favorable para la fecha real elegida si se mantiene la trayectoria de preparación, pendiente de revisión final del profesor."
              : "La preparación necesita refuerzo antes de esta convocatoria.",
          deficits: m!.deficits,
          instructions: input.instructions,
        };
        const fee = cls === "kids" ? 10 : 15;
        const body = `Hola ${snapshot.name},\n\nTe invitamos voluntariamente al examen de ${snapshot.targetGrade}, convocatoria ${input.callKey}, el ${input.examDate}.\n${snapshot.reason}\nPendiente de revisión final del profesor; esta invitación no garantiza la aptitud.\n${snapshot.deficits.join("\n")}\nPuedes aceptar o aplazar esta convocatoria y dejar un mensaje. No es una obligación.\nPago anticipado: examen ${fee} EUR + cinturón 5 EUR = ${fee + 5} EUR. Aceptar reserva plaza; el pago anticipado en mano completa la inscripción; el club lo controla por su procedimiento habitual.\n${input.instructions}\n${input.body ?? ""}`;
        rows.push({
          batch_id: batch.id,
          call_key: input.callKey,
          member_id: m!.memberId,
          exam_event_id: event.eventId,
          snapshot,
          subject:
            input.subject?.trim() || `Invitación al examen · ${snapshot.name}`,
          body,
          exam_fee: fee,
          expires_at: new Date(
            Date.parse(input.examDate + "T00:00:00Z") - 2 * 60 * 60 * 1000,
          ).toISOString(),
        });
      }
    }
    const saved = await db.rpc("replace_exam_invitation_drafts", {
      p_call: input.callKey,
      p_member_ids: ids,
      p_rows: rows,
    });
    if (saved.error) throw saved.error;
    return batch.id as string;
  } catch (e) {
    await db.from("exam_invitation_batches").delete().eq("id", batch.id);
    for (const id of events) await db.from("exam_events").delete().eq("id", id);
    throw e;
  }
}
export async function sendExamInvitationBatch(
  batchId: string,
  options: { retryFailed?: boolean } = {},
) {
  await requireInvitationAdmin();
  const batch = await getExamInvitationBatch(batchId);
  if (!batch) throw new Error("Convocatoria no encontrada.");
  const candidates = await loadExamInvitationCandidates();
  const db = createAdminClient();
  const transport = createTransporter();
  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://skbc.vercel.app"
  ).replace(/\/$/, "");
  if (!/^https:\/\//.test(origin))
    throw new Error("Configura NEXT_PUBLIC_SITE_URL con la URL pública HTTPS.");
  const eventIds = [
    ...new Set(batch.invitations.map((inv) => inv.exam_event_id)),
  ];
  const events = eventIds.length
    ? await db.from("exam_events").select("id,exam_date").in("id", eventIds)
    : { data: [], error: null };
  if (events.error) throw events.error;
  const eventDates = new Map(
    (events.data ?? []).map((event) => [event.id, event.exam_date]),
  );
  for (const inv of batch.invitations.filter(
    (x) => x.delivery_status === (options.retryFailed ? "failed" : "draft"),
  )) {
    if (eventDates.get(inv.exam_event_id) !== inv.snapshot.examDate)
      throw new Error(
        "La fecha del examen ha cambiado; prepara un borrador actualizado antes de enviar.",
      );
    const m = candidates.find((x) => x.memberId === inv.member_id);
    if (
      !m ||
      m.callDate !== batch.call_key ||
      m.targetGrade !== inv.snapshot.targetGrade ||
      m.currentGrade !== inv.snapshot.currentGrade ||
      m.email?.trim() !== inv.snapshot.email ||
      Date.parse(inv.expires_at) <= Date.now()
    )
      throw new Error(
        "La selección ha cambiado o ha caducado; prepara otro borrador.",
      );
  }
  let sent = 0,
    failed = 0,
    unconfirmed = 0;
  for (const inv of batch.invitations) {
    if (inv.delivery_status !== (options.retryFailed ? "failed" : "draft"))
      continue;
    const member = candidates.find((x) => x.memberId === inv.member_id);
    if (
      !member ||
      member.targetGrade !== inv.snapshot.targetGrade ||
      member.currentGrade !== inv.snapshot.currentGrade ||
      member.email?.trim() !== inv.snapshot.email
    )
      throw new Error("Los candidatos han cambiado; prepara otro borrador.");
    if (!isBareInvitationEmail(inv.snapshot.email))
      throw new Error("Email de invitación inválido.");
    const token = createInvitationToken();
    const { data, error } = await db
      .from("exam_invitations")
      .update({
        delivery_status: "sending",
        token_hash: hashInvitationToken(token),
      })
      .eq("id", inv.id)
      .eq("delivery_status", inv.delivery_status)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) continue;
    const link = `${origin}/convocatoria/${token}`;
    let delivered = false;
    try {
      await transport.sendMail({
        from: process.env.SKBC_EMAIL_USER ?? "skbcgipuzkoa@gmail.com",
        to: { address: inv.snapshot.email, name: inv.snapshot.name },
        subject: inv.subject,
        text: inv.body + "\n\nAceptar o aplazar: " + link,
        html: `<div style="white-space:pre-wrap">${escapeHtml(inv.body)}</div><p><a href="${link}">Aceptar o aplazar y enviar un mensaje</a></p>`,
      });
      delivered = true;
      const r = await db
        .from("exam_invitations")
        .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("delivery_status", "sending");
      if (r.error) throw r.error;
      sent++;
    } catch (e) {
      const definitive = !delivered && isDefinitiveInvitationSmtpFailure(e);
      if (definitive) failed++;
      else unconfirmed++;
      const r = await db
        .from("exam_invitations")
        .update({
          delivery_status: definitive ? "failed" : "sending",
          delivery_error: definitive
            ? "El servidor rechazó el envío. Se permite reintentar tras corregir la causa."
            : "Entrega sin confirmar; el correo puede haberse enviado. Revisar manualmente; no reenviar.",
        })
        .eq("id", inv.id)
        .eq("delivery_status", "sending");
      if (r.error) throw r.error;
    }
  }
  return { sent, failed, unconfirmed };
}
export function isDefinitiveInvitationSmtpFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    code?: string;
    responseCode?: number;
    command?: string;
  };
  if (value.code === "EAUTH") return true;
  return (
    typeof value.responseCode === "number" &&
    value.responseCode >= 400 &&
    value.responseCode < 600 &&
    ["RCPT TO", "DATA", "AUTH"].includes(value.command ?? "")
  );
}
function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function respondExamInvitation(
  token: string,
  response: string,
  message: string,
) {
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    !["accepted", "deferred"].includes(response) ||
    message.length > 2000
  )
    throw new Error("Respuesta inválida.");
  const { error } = await createAdminClient().rpc("respond_exam_invitation", {
    p_hash: hashInvitationToken(token),
    p_response: response,
    p_message: message.trim(),
  });
  if (error)
    throw new Error(
      "La invitación no está disponible o ya tiene otra respuesta.",
    );
}
export async function updateExamInvitationEvent(input: {
  eventId: string;
  title: string;
  examDate: string;
  notes?: string;
}) {
  await requireInvitationAdmin();
  if (!validDate(input.examDate) || !input.title.trim())
    throw new Error("Revisa fecha y título.");
  const db = createAdminClient();
  const existing = await db
    .from("exam_events")
    .select("notes")
    .eq("id", input.eventId)
    .single();
  if (existing.error) throw existing.error;
  const assignments = decodeExamAssignments(existing.data.notes);
  const { error } = await db.rpc("update_exam_invitation_event", {
    p_id: input.eventId,
    p_title: input.title.trim(),
    p_date: input.examDate,
    p_notes: encodeExamAssignments(
      input.notes ?? assignments.text,
      assignments.scopes ?? {},
      assignments,
    ),
    p_expiry: new Date(
      Date.parse(input.examDate + "T00:00:00Z") - 2 * 60 * 60 * 1000,
    ).toISOString(),
  });
  if (error) throw error;
}
