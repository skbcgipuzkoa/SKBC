import {
  madridCallToday,
  examCallMonthEnd,
  formatExamCallMonth,
} from "@/lib/exam-call";
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
  additionalMessage?: string;
  dateConfirmed?: boolean;
  callMonth?: string;
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
  teacher_approved_at: string | null;
  teacher_approved_by: string | null;
  teacher_approved_exam_date: string | null;
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
      "id,snapshot,subject,body,response,message,exam_fee,belt_fee,expires_at,revoked_at,delivery_status,teacher_approved_at,teacher_approved_by,teacher_approved_exam_date,exam_events(exam_date,title,status,date_confirmed,call_month),members(grade,class,status)",
    )
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    data.revoked_at ||
    !["sending", "sent"].includes(data.delivery_status) ||
    !isExamInvitationApprovalValid(data as unknown as ApprovalScope)
  )
    return null;
  return {
    ...data,
    currentExamDate:
      (data.exam_events as unknown as { exam_date: string } | null)
        ?.exam_date ?? data.snapshot.examDate,
    expired: Date.parse(data.expires_at) <= Date.now(),
    dateConfirmed:
      (data.exam_events as unknown as { date_confirmed?: boolean } | null)
        ?.date_confirmed !== false,
    callMonth:
      (data.exam_events as unknown as { call_month?: string } | null)
        ?.call_month ??
      data.snapshot.callMonth ??
      data.snapshot.callKey.slice(0, 7),
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
  > & {
    expired: boolean;
    currentExamDate: string;
    dateConfirmed: boolean;
    callMonth: string;
  };
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
    .filter(
      (x) =>
        x.feasibility !== "impossible" &&
        (x.candidate || x.preparationCandidate),
    )
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
export async function createExamInvitationDraft(
  input: {
    memberIds: string[];
    callKey: string;
    examDate: string;
    instructions: string;
    subject?: string;
    body?: string;
    title?: string;
  },
  options: { fichaOnly?: boolean; dateConfirmed?: boolean } = {},
) {
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
    if (actual.feasibility === "impossible")
      throw new Error(
        "La preparación necesaria no cabe en las clases disponibles antes de la fecha real del examen.",
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
  const canonicalEvents = new Set<string>();
  const eventDates: Record<string, string> = {};
  const rows: Record<string, unknown>[] = [];
  try {
    for (const cls of ["kids", "adults"] as const) {
      const classMembers = selected.filter((x) => x!.memberClass === cls);
      for (const targetGrade of [
        ...new Set(classMembers.map((member) => member!.targetGrade)),
      ]) {
        let members = classMembers.filter(
          (member) => member!.targetGrade === targetGrade,
        );
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
          .update({
            call_date: input.callKey,
            target_grade: targetGrade,
            is_retake: false,
            date_confirmed: options.dateConfirmed !== false,
            ...(options.dateConfirmed === false
              ? { call_month: input.callKey.slice(0, 7) }
              : {}),
          })
          .eq("id", event.eventId);
        if (meta.error) throw meta.error;
        const claimed = await db.rpc("claim_prepared_exam_grade_group", {
          p_event_id: event.eventId,
          p_call_month: input.callKey.slice(0, 7),
          p_program: cls,
          p_target: targetGrade,
          p_exam_date: input.examDate,
          p_date_confirmed: options.dateConfirmed !== false,
        });
        if (claimed.error) throw claimed.error;
        const canonical = claimed.data as {
          eventId: string;
          examDate: string;
          dateConfirmed: boolean;
        };
        if (!canonical?.eventId)
          throw new Error(
            "No se pudo preparar el examen compartido del grado.",
          );
        if (canonical.eventId !== event.eventId) {
          const removed = await db.rpc("discard_unclaimed_exam_preparation", {
            p_event_id: event.eventId,
          });
          if (removed.error) throw removed.error;
        }
        canonicalEvents.add(canonical.eventId);
        event.eventId = canonical.eventId;
        eventDates[event.eventId] = canonical.examDate;
        if (canonical.examDate !== input.examDate) {
          const actual = await loadExamOutlooks({
            memberIds: members.map((member) => member!.memberId),
            examDateOverride: canonical.examDate,
          });
          members = members.map((member) => {
            const outlook = actual.get(member!.memberId);
            if (
              !outlook?.callDate ||
              outlook.callDate !== canonical.examDate ||
              outlook.feasibility === "impossible" ||
              outlook.targetGrade !== targetGrade ||
              outlook.currentGrade !== member!.currentGrade
            )
              throw new Error(
                "La preparación no permite incorporarse al día del examen compartido; revisa la convocatoria.",
              );
            return { ...outlook, email: member!.email };
          });
        }

        for (const m of members) {
          const emails = (m!.email ?? "").split(/[;,\s]+/).filter(Boolean);
          const validEmail =
            emails.length === 1 && isBareInvitationEmail(emails[0]);
          if (!options.fichaOnly && !validEmail)
            throw new Error(`Revisa el email único de ${m!.name}.`);
          const snapshot: InvitationSnapshot = {
            dateConfirmed: canonical.dateConfirmed,
            additionalMessage: input.body ?? "",
            callMonth: input.callKey.slice(0, 7),
            name: m!.name,
            memberClass: cls,
            currentGrade: m!.currentGrade,
            targetGrade: m!.targetGrade,
            callKey: input.callKey,
            examDate: canonical.examDate,
            email: validEmail ? emails[0] : "",
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
          const body = invitationBody(snapshot, fee);
          rows.push({
            batch_id: batch.id,
            call_key: input.callKey,
            member_id: m!.memberId,
            exam_event_id: event.eventId,
            snapshot,
            subject:
              input.subject?.trim() ||
              `Invitación al examen · ${snapshot.name}`,
            body,
            exam_fee: fee,
            expires_at: new Date(
              Date.parse(canonical.examDate + "T00:00:00Z") -
                2 * 60 * 60 * 1000,
            ).toISOString(),
          });
        }
      }
    }
    const saved = await db.rpc(
      options.fichaOnly
        ? "replace_and_approve_exam_invitation_drafts"
        : "replace_exam_invitation_drafts",
      {
        p_call: input.callKey,
        p_member_ids: ids,
        p_rows: rows,
        ...(options.fichaOnly
          ? {
              p_actor: "Profesor · WEB SKBC",
              p_event_dates: eventDates,
            }
          : {}),
      },
    );
    if (saved.error) throw saved.error;
    return batch.id as string;
  } catch (e) {
    await db.from("exam_invitation_batches").delete().eq("id", batch.id);
    for (const id of events)
      if (!canonicalEvents.has(id))
        await db.rpc("discard_unclaimed_exam_preparation", { p_event_id: id });
    throw e;
  }
}
/** Explicit teacher action from planning: reuse scoped approval, never dispatch mail. */
export async function approveExamCallFromPlanning(input: {
  memberIds: string[];
  callKey: string;
  examDate: string;
}) {
  await requireInvitationAdmin();
  if (!validDate(input.callKey)) throw new Error("Convocatoria inválida.");
  const existing = await listPlanningExamApprovals();
  if (
    existing.some(
      (event) =>
        event.callMonth === input.callKey.slice(0, 7) &&
        event.participants.some((person) =>
          input.memberIds.includes(person.memberId),
        ),
    )
  )
    throw new Error(
      "Algún alumno ya está convocado para este mes. Consulta sus respuestas o confirma el día en la convocatoria existente.",
    );
  const dateConfirmed = Boolean(input.examDate.trim());
  const callMonth = input.callKey.slice(0, 7);
  const examDate = dateConfirmed
    ? input.examDate
    : planningMonthCutoff(callMonth);
  return createExamInvitationDraft(
    {
      ...input,
      examDate,
      instructions: "",
      title: `Examen SKBC · ${dateConfirmed ? examDate : callMonth}`,
    },
    { fichaOnly: true, dateConfirmed },
  );
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
    ? await db
        .from("exam_events")
        .select("id,exam_date,status,date_confirmed,call_month")
        .in("id", eventIds)
    : { data: [], error: null };
  if (events.error) throw events.error;
  const eventDates = new Map(
    (events.data ?? []).map((event) => [event.id, event.exam_date]),
  );
  const sendable = batch.invitations.filter(
    (x) =>
      x.delivery_status === (options.retryFailed ? "failed" : "draft") &&
      x.response !== "deferred",
  );
  const actualOutlooks = new Map<
    string,
    { callDate: string | null; feasibility: string }
  >();
  for (const date of [
    ...new Set(sendable.map((inv) => inv.snapshot.examDate)),
  ]) {
    const actual = await loadExamOutlooks({
      memberIds: [
        ...new Set(
          sendable
            .filter((inv) => inv.snapshot.examDate === date)
            .map((inv) => inv.member_id),
        ),
      ],
      examDateOverride: date,
    });
    for (const [id, outlook] of actual) actualOutlooks.set(id, outlook);
  }
  const eventStates = new Map(
    (events.data ?? []).map((event) => [event.id, event.status]),
  );
  const eventConfirmed = new Map(
    (events.data ?? []).map((event) => [
      event.id,
      event.date_confirmed !== false,
    ]),
  );
  for (const inv of sendable) {
    if (!eventConfirmed.get(inv.exam_event_id))
      throw new Error(
        "Confirma el día real del examen antes de enviar emails.",
      );
    if (!["active", "draft"].includes(eventStates.get(inv.exam_event_id) ?? ""))
      throw new Error("El examen ya no está abierto.");
    const actual = actualOutlooks.get(inv.member_id);
    if (!actual || !actual.callDate || actual.feasibility === "impossible")
      throw new Error(
        "La preparación ya no cabe en las clases disponibles para la fecha real; revisa la convocatoria antes de enviar.",
      );
    if (
      !inv.teacher_approved_at ||
      !inv.teacher_approved_by?.trim() ||
      !inv.teacher_approved_exam_date ||
      inv.teacher_approved_exam_date !== eventDates.get(inv.exam_event_id) ||
      inv.revoked_at ||
      inv.teacher_approved_exam_date <= madridCallToday()
    )
      throw new Error(
        "La convocatoria requiere autorización expresa y vigente del profesor antes de enviar.",
      );
    if (eventDates.get(inv.exam_event_id) !== inv.snapshot.examDate)
      throw new Error(
        "La fecha del examen ha cambiado; prepara un borrador actualizado antes de enviar.",
      );
    const m = candidates.find((x) => x.memberId === inv.member_id);
    if (
      !m ||
      m.callDate !== batch.call_key ||
      m.memberClass !== inv.snapshot.memberClass ||
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
    if (
      inv.response === "deferred" ||
      inv.delivery_status !== (options.retryFailed ? "failed" : "draft")
    )
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

export type StudentExamInvitation = {
  invitationId: string;
  memberId: string;
  currentExamDate: string;
  targetGrade: string;
  currentGrade: string | null;
  callKey: string;
  eventTitle: string;
  response: "accepted" | "deferred" | null;
  message: string | null;
  examFee: number;
  beltFee: number;
  teacherApprovedAt: string;
  teacherApprovedBy: string;
  registrationClosed: boolean;
  dateConfirmed: boolean;
  callMonth: string;
};
type ApprovalScope = ExamInvitation & {
  exam_events: {
    exam_date: string;
    status: string;
    title: string;
    date_confirmed?: boolean;
    call_month?: string | null;
  } | null;
  members: { grade: string | null; class: string; status: string } | null;
};
export function isExamInvitationApprovalValid(
  inv: ApprovalScope,
  now = new Date(),
) {
  const event = inv.exam_events,
    member = inv.members;
  return Boolean(
    inv.teacher_approved_at &&
    inv.teacher_approved_by?.trim() &&
    !inv.revoked_at &&
    event &&
    member &&
    event.exam_date >= madridCallToday(now) &&
    ["active", "draft"].includes(event.status) &&
    event.exam_date === inv.teacher_approved_exam_date &&
    member.status === "active" &&
    member.grade === inv.snapshot.currentGrade &&
    member.class === inv.snapshot.memberClass,
  );
}
export function isExamInvitationRegistrationOpen(
  inv: ApprovalScope,
  now = new Date(),
) {
  return (
    isExamInvitationApprovalValid(inv, now) &&
    Date.parse(inv.expires_at) > now.getTime() &&
    inv.exam_events!.exam_date > madridCallToday(now)
  );
}
/** Trusted server lookup after the ficha has resolved its own member. Never returns bearer secrets. */
export async function getStudentExamInvitation(
  memberId: string,
): Promise<StudentExamInvitation | null> {
  const { data, error } = await createAdminClient()
    .from("exam_invitations")
    .select(
      "*,exam_events(exam_date,status,title,date_confirmed,call_month),members(grade,class,status)",
    )
    .eq("member_id", memberId)
    .order("teacher_approved_exam_date", { ascending: true });
  if (error) throw error;
  const valid =
    (data as ApprovalScope[] | null)?.filter(
      (row) => row.member_id === memberId && isExamInvitationApprovalValid(row),
    ) ?? [];
  const inv = valid.find((row) => row.response !== "deferred") ?? valid[0];
  if (!inv) return null;
  return {
    invitationId: inv.id,
    memberId: inv.member_id,
    currentExamDate: inv.exam_events!.exam_date,
    targetGrade: inv.snapshot.targetGrade,
    currentGrade: inv.snapshot.currentGrade,
    callKey: inv.snapshot.callKey,
    eventTitle: inv.exam_events!.title,
    response: inv.response,
    message: inv.message,
    examFee: inv.exam_fee,
    beltFee: inv.belt_fee,
    teacherApprovedAt: inv.teacher_approved_at!,
    teacherApprovedBy: inv.teacher_approved_by!,
    registrationClosed: !isExamInvitationRegistrationOpen(inv),
    dateConfirmed: inv.exam_events!.date_confirmed !== false,
    callMonth:
      inv.exam_events!.call_month ??
      inv.snapshot.callMonth ??
      inv.snapshot.callKey.slice(0, 7),
  };
}
export async function approveExamInvitationBatch(batchId: string) {
  await requireInvitationAdmin();
  const batch = await getExamInvitationBatch(batchId);
  if (!batch?.invitations.length) throw new Error("Convocatoria vacía.");
  const db = createAdminClient();
  const events = await db
    .from("exam_events")
    .select("id,exam_date,status")
    .in("id", [...new Set(batch.invitations.map((inv) => inv.exam_event_id))]);
  if (events.error) throw events.error;
  const dates = new Map(
    (events.data ?? []).map((event) => [event.id, event.exam_date as string]),
  );
  const grouped = new Map<string, string[]>();
  for (const inv of batch.invitations) {
    const date = dates.get(inv.exam_event_id);
    if (
      !date ||
      date <= madridCallToday() ||
      inv.revoked_at ||
      Date.parse(inv.expires_at) <= Date.now()
    )
      throw new Error("Convocatoria no autorizable.");
    grouped.set(date, [...(grouped.get(date) ?? []), inv.member_id]);
  }
  for (const [date, memberIds] of grouped) {
    const actual = await loadExamOutlooks({
      memberIds: [...new Set(memberIds)],
      examDateOverride: date,
    });
    for (const inv of batch.invitations.filter(
      (row) => dates.get(row.exam_event_id) === date,
    )) {
      const outlook = actual.get(inv.member_id);
      if (
        !outlook?.callDate ||
        outlook.callDate !== date ||
        outlook.feasibility === "impossible" ||
        outlook.currentGrade !== inv.snapshot.currentGrade ||
        outlook.targetGrade !== inv.snapshot.targetGrade
      )
        throw new Error(
          "La preparación o los datos actuales no permiten autorizar esta convocatoria.",
        );
    }
  }
  const hashes = Object.fromEntries(
    batch.invitations.map((inv) => [
      inv.id,
      hashInvitationToken(createInvitationToken()),
    ]),
  );
  const { error } = await db.rpc("approve_exam_invitation_batch", {
    p_batch_id: batchId,
    p_actor: "Profesor · WEB SKBC",
    p_hashes: hashes,
    p_event_dates: Object.fromEntries(dates),
  });
  if (error) throw error;
}
export async function revokeExamInvitationApproval(invitationId: string) {
  await requireInvitationAdmin();
  const { error } = await createAdminClient()
    .from("exam_invitations")
    .update({
      teacher_approved_at: null,
      teacher_approved_by: null,
      teacher_approved_exam_date: null,
    })
    .eq("id", invitationId);
  if (error) throw error;
}
export async function respondExamInvitationFromFicha(input: {
  fichaToken: string;
  invitationId: string;
  response: string;
  message: string;
}) {
  if (
    !/^[A-Za-z0-9_-]{16,256}$/.test(input.fichaToken) ||
    !["accepted", "deferred"].includes(input.response) ||
    input.message.length > 2000
  )
    throw new Error("Respuesta inválida.");
  const db = createAdminClient();
  const member = await db
    .from("members")
    .select("id")
    .eq("ficha_token", input.fichaToken)
    .eq("status", "active")
    .maybeSingle();
  if (member.error || !member.data) throw new Error("Ficha no disponible.");
  const inv = await db
    .from("exam_invitations")
    .select("id,member_id")
    .eq("id", input.invitationId)
    .eq("member_id", member.data.id)
    .maybeSingle();
  if (inv.error || !inv.data || inv.data.member_id !== member.data.id)
    throw new Error("Invitación no disponible.");
  const result = await db.rpc("respond_exam_invitation_from_ficha", {
    p_ficha_token: input.fichaToken,
    p_invitation_id: input.invitationId,
    p_response: input.response,
    p_message: input.message.trim(),
  });
  if (result.error)
    throw new Error(
      "La autorización no está vigente o la respuesta ya está registrada.",
    );
}

function planningMonthCutoff(month: string) {
  const date = examCallMonthEnd(month);
  if (!date) throw new Error("Mes de convocatoria inválido.");
  return date;
}
function invitationBody(snapshot: InvitationSnapshot, fee: number) {
  const date =
    snapshot.dateConfirmed === false
      ? "día pendiente de confirmar"
      : "el " + snapshot.examDate;
  return `Hola ${snapshot.name},\n\nTe invitamos voluntariamente al examen de ${snapshot.targetGrade}, convocatoria ${formatExamCallMonth(snapshot.callMonth ?? snapshot.callKey)}, ${date}.\n${snapshot.reason}\nPendiente de revisión final del profesor; esta invitación no garantiza la aptitud.\n${snapshot.deficits.join("\n")}\nPuedes aceptar o aplazar esta convocatoria y dejar un mensaje. No es una obligación.\nPago anticipado: examen ${fee} EUR + cinturón 5 EUR = ${fee + 5} EUR. Aceptar reserva plaza; el pago anticipado en mano completa la inscripción; el club lo controla por su procedimiento habitual.\n${snapshot.instructions}\n${snapshot.additionalMessage ?? ""}`;
}
export async function confirmPlanningExamDate(input: {
  eventId: string;
  examDate: string;
}) {
  await requireInvitationAdmin();
  if (!validDate(input.examDate) || input.examDate < madridCallToday())
    throw new Error("Indica un día vigente del mes de convocatoria.");
  const db = createAdminClient();
  const event = await db
    .from("exam_events")
    .select("id,exam_date,call_month,date_confirmed,status")
    .eq("id", input.eventId)
    .single();
  if (event.error) throw event.error;
  if (!event.data || !["active", "draft"].includes(event.data.status))
    throw new Error(
      "Esta convocatoria no tiene un día pendiente de confirmar.",
    );
  const month = event.data.call_month ?? event.data.exam_date.slice(0, 7);
  if (input.examDate.slice(0, 7) !== month)
    throw new Error("El día debe pertenecer al mes autorizado.");
  const invitations = await db
    .from("exam_invitations")
    .select("*")
    .eq("exam_event_id", input.eventId);
  if (invitations.error) throw invitations.error;
  const rows = (invitations.data ?? []) as ExamInvitation[];
  if (!rows.length) throw new Error("Convocatoria sin participantes.");
  const actual = await loadExamOutlooks({
    memberIds: [
      ...new Set(
        rows
          .filter((inv) => inv.response !== "deferred")
          .map((inv) => inv.member_id),
      ),
    ],
    examDateOverride: input.examDate,
  });
  const updates: Record<
    string,
    { reason: string; deficits: string[]; body: string }
  > = {};
  for (const inv of rows) {
    if (inv.response === "deferred") {
      const reason = inv.snapshot.reason,
        deficits = inv.snapshot.deficits;
      updates[inv.id] = {
        reason,
        deficits,
        body: invitationBody(
          { ...inv.snapshot, examDate: input.examDate, dateConfirmed: true },
          inv.exam_fee,
        ),
      };
      continue;
    }
    const outlook = actual.get(inv.member_id);
    if (
      !outlook?.callDate ||
      outlook.callDate !== input.examDate ||
      outlook.feasibility === "impossible" ||
      outlook.currentGrade !== inv.snapshot.currentGrade ||
      outlook.targetGrade !== inv.snapshot.targetGrade
    )
      throw new Error(
        "La preparación actual no cabe antes del día elegido; revisa la convocatoria.",
      );
    const reason = outlook.currentReady
      ? "Los requisitos actuales constan cubiertos, pendientes de revisión final del profesor."
      : outlook.classification === "projected"
        ? "Proyección favorable para la fecha real elegida si se mantiene la trayectoria de preparación, pendiente de revisión final del profesor."
        : "La preparación necesita refuerzo antes de esta convocatoria.";
    updates[inv.id] = {
      reason,
      deficits: outlook.deficits,
      body: invitationBody(
        {
          ...inv.snapshot,
          examDate: input.examDate,
          dateConfirmed: true,
          reason,
          deficits: outlook.deficits,
        },
        inv.exam_fee,
      ),
    };
  }
  const result = await db.rpc("confirm_planning_exam_date", {
    p_event_id: input.eventId,
    p_exam_date: input.examDate,
    p_expected_date: event.data.exam_date,
    p_expected_month: month,
    p_updates: updates,
  });
  if (result.error) throw result.error;
}
export type PlanningExamApproval = {
  eventId: string;
  targetGrade?: string | null;
  programType?: string;
  title: string;
  callMonth: string;
  dateConfirmed: boolean;
  examDate: string | null;
  participants: Array<{
    invitationId: string;
    memberId: string;
    name: string;
    response: "accepted" | "deferred" | null;
  }>;
  acceptedCount: number;
  deferredCount: number;
  pendingCount: number;
};
export async function listPlanningExamApprovals(): Promise<
  PlanningExamApproval[]
> {
  await requireInvitationAdmin();
  const result = await createAdminClient()
    .from("exam_invitations")
    .select(
      "id,member_id,exam_event_id,response,snapshot,revoked_at,teacher_approved_at,exam_events(id,title,exam_date,call_month,date_confirmed,status,target_grade,program_type)",
    )
    .order("teacher_approved_at", { ascending: false });
  if (result.error) throw result.error;
  const groups = new Map<string, PlanningExamApproval>();
  for (const row of result.data ?? []) {
    const event = row.exam_events as unknown as {
      id: string;
      title: string;
      exam_date: string;
      call_month: string | null;
      date_confirmed?: boolean;
      status: string;
      target_grade?: string | null;
      program_type?: string;
    } | null;
    if (
      !row.teacher_approved_at ||
      row.revoked_at ||
      !event ||
      !["active", "draft"].includes(event.status) ||
      event.exam_date < madridCallToday()
    )
      continue;
    const group: PlanningExamApproval = groups.get(row.exam_event_id) ?? {
      eventId: row.exam_event_id,
      targetGrade: event.target_grade,
      programType: event.program_type,
      title: event.title,
      callMonth:
        event.call_month ??
        row.snapshot.callMonth ??
        row.snapshot.callKey.slice(0, 7),
      dateConfirmed: event.date_confirmed !== false,
      examDate: event.date_confirmed === false ? null : event.exam_date,
      participants: [],
      acceptedCount: 0,
      deferredCount: 0,
      pendingCount: 0,
    };
    group.participants.push({
      invitationId: row.id,
      memberId: row.member_id,
      name: row.snapshot.name,
      response: row.response,
    });
    if (row.response === "accepted") group.acceptedCount++;
    else if (row.response === "deferred") group.deferredCount++;
    else group.pendingCount++;
    groups.set(row.exam_event_id, group);
  }
  return [...groups.values()];
}
