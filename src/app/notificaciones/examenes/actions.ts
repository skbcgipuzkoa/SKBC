"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  approveExamInvitationBatch,
  revokeExamInvitationApproval,
  respondExamInvitationFromFicha,
  createExamInvitationDraft,
  sendExamInvitationBatch,
  respondExamInvitation,
  updateExamInvitationEvent,
} from "@/lib/exam-invitations";
const field = (f: FormData, k: string) => String(f.get(k) ?? "");
const adminError =
  "/notificaciones/examenes?error=" +
  encodeURIComponent(
    "No se pudo completar la acción. Revisa la selección, los datos y el estado de los envíos antes de continuar.",
  );
export async function createExamInvitationDraftAction(f: FormData) {
  let id: string;
  try {
    id = await createExamInvitationDraft({
      memberIds: f.getAll("memberIds").map(String),
      callKey: field(f, "callKey"),
      examDate: field(f, "examDate"),
      instructions: field(f, "instructions"),
      subject: field(f, "subject"),
      body: field(f, "body"),
      title: field(f, "title"),
    });
  } catch {
    redirect(adminError);
  }
  redirect(`/notificaciones/examenes?batch=${encodeURIComponent(id)}`);
}
export async function sendExamInvitationBatchAction(f: FormData) {
  const id = field(f, "batchId");
  let r: Awaited<ReturnType<typeof sendExamInvitationBatch>>;
  try {
    r = await sendExamInvitationBatch(id, {
      retryFailed: field(f, "retryFailed") === "true",
    });
  } catch {
    redirect(adminError);
  }
  revalidatePath("/notificaciones/examenes");
  redirect(
    `/notificaciones/examenes?batch=${encodeURIComponent(id)}&sent=${r.sent}&failed=${r.failed}&unconfirmed=${r.unconfirmed}`,
  );
}
export async function respondExamInvitationAction(f: FormData) {
  const token = field(f, "token");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    redirect("/convocatoria/invalida?error=1");
  try {
    await respondExamInvitation(
      token,
      field(f, "response"),
      field(f, "message"),
    );
  } catch {
    redirect(`/convocatoria/${token}?error=1`);
  }
  revalidatePath("/notificaciones/examenes");
  redirect(`/convocatoria/${token}?responded=1`);
}
export async function updateExamInvitationEventAction(f: FormData) {
  const eventId = field(f, "eventId");
  try {
    await updateExamInvitationEvent({
      eventId,
      title: field(f, "title"),
      examDate: field(f, "examDate"),
      notes: f.has("notes") ? field(f, "notes") : undefined,
    });
  } catch {
    redirect(adminError);
  }
  revalidatePath(`/examenes/${eventId}`);
  revalidatePath("/notificaciones/examenes");
  revalidatePath("/examenes");
}

export async function approveExamInvitationBatchAction(f: FormData) {
  const id = field(f, "batchId");
  try {
    await approveExamInvitationBatch(id);
  } catch {
    redirect(adminError);
  }
  revalidatePath("/notificaciones/examenes");
  revalidatePath("/ficha/[token]", "page");
  redirect(
    "/notificaciones/examenes?batch=" + encodeURIComponent(id) + "&approved=1",
  );
}
export async function revokeExamInvitationApprovalAction(f: FormData) {
  try {
    await revokeExamInvitationApproval(field(f, "invitationId"));
  } catch {
    redirect(adminError);
  }
  revalidatePath("/notificaciones/examenes");
  revalidatePath("/ficha/[token]", "page");
}
export async function respondExamInvitationFromFichaAction(f: FormData) {
  const token = field(f, "fichaToken");
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(token))
    redirect("/ficha/invalida?examError=1");
  try {
    await respondExamInvitationFromFicha({
      fichaToken: token,
      invitationId: field(f, "invitationId"),
      response: field(f, "response"),
      message: field(f, "message"),
    });
  } catch {
    redirect("/ficha/" + encodeURIComponent(token) + "?examError=1");
  }
  revalidatePath("/notificaciones/examenes");
  revalidatePath("/examenes");
  revalidatePath("/ficha/" + token);
  redirect("/ficha/" + encodeURIComponent(token) + "?examResponded=1");
}
