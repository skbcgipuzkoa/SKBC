"use server";
import { parseExamSubmissionExtras } from "@/lib/integrated-exam-session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import {
  saveIntegratedExamStudentReview,
  saveAdultGradeGroups,
  submitInternalIntegratedExamScores,
  retryIntegratedExamDocuments,
  type ScoreInput,
} from "@/lib/integrated-exams";
import type { ReviewEnvelope } from "@/lib/integrated-exam-review";
function message(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo guardar.";
}
function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
function parseScores(form: FormData): ScoreInput[] {
  const result: ScoreInput[] = [];
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("score:")) continue;
    const [, eventStudentId, eventItemId] = key.split(":");
    const raw = String(value).trim();
    if (!raw) continue;
    result.push({
      eventStudentId,
      eventItemId,
      score: raw === "skip" ? null : Number(raw.replace(",", ".")),
      skipped: raw === "skip",
      notes: text(form, `notes:${eventStudentId}:${eventItemId}`),
    });
  }
  return result;
}
export async function saveIntegratedExamReviewAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const eventId = text(form, "eventId"),
    studentId = text(form, "studentId");
  let errorText = "";
  try {
    const adjustments: ReviewEnvelope["adjustments"] = {};
    for (const [key, value] of form.entries())
      if (key.startsWith("adjustment:")) {
        const id = key.slice("adjustment:".length),
          raw = String(value).trim();
        if (raw)
          adjustments[id] = {
            score: Number(raw.replace(",", ".")),
            notes: text(form, `adjustmentNotes:${id}`),
          };
      }
    const decision = text(form, "decision");
    if (!["pass", "fail", "pending", ""].includes(decision))
      throw new Error("Decision no valida.");
    await saveIntegratedExamStudentReview({
      eventId,
      studentId,
      adjustments,
      decision: decision === "pass" || decision === "fail" ? decision : null,
      conclusion: text(form, "conclusion"),
      sourceSignature: text(form, "sourceSignature"),
    });
  } catch (error) {
    errorText = message(error);
  }
  revalidatePath(`/examenes/${eventId}`);
  redirect(
    `/examenes/${eventId}?${errorText ? `error=review&detail=${encodeURIComponent(errorText)}` : "saved=review"}`,
  );
}
export async function submitInternalExamScoresAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const eventId = text(form, "eventId"),
    examinerId = text(form, "examinerId");
  let errorText = "";
  try {
    await submitInternalIntegratedExamScores({
      eventId,
      examinerId,
      grade: text(form, "grade") || undefined,
      scores: parseScores(form),
      extras: parseExamSubmissionExtras(form),
    });
  } catch (error) {
    errorText = message(error);
  }
  revalidatePath(`/examenes/${eventId}`);
  redirect(
    errorText
      ? `/examenes/${eventId}/evaluar?examiner=${encodeURIComponent(examinerId)}&grade=${encodeURIComponent(text(form, "grade"))}&error=submit&detail=${encodeURIComponent(errorText)}`
      : `/examenes/${eventId}?saved=evaluation`,
  );
}
export async function retryIntegratedExamDocumentsAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const eventId = text(form, "eventId");
  let errorText = "";
  try {
    const errors = await retryIntegratedExamDocuments(
      eventId,
      text(form, "studentId"),
    );
    errorText = errors.join(" ");
  } catch (error) {
    errorText = message(error);
  }
  revalidatePath(`/examenes/${eventId}`);
  redirect(
    `/examenes/${eventId}?${errorText ? `error=documents&detail=${encodeURIComponent(errorText)}` : "saved=documents"}`,
  );
}

export async function saveIntegratedExamAssignmentsAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const eventId = text(form, "eventId");
  let errorText = "";
  try {
    const removed = new Set(form.getAll("removedExaminerIds").map(String));
    const examiners = [...new Set(form.getAll("examinerIds").map(String))].filter((id) => !removed.has(id)).map((id) => {
      return {
        id,
        name: text(form, `examinerName:${id}`),
        grades: form.getAll(`scope:${id}`).map(String),
      };
    });
    for (const key of new Set(form.getAll("newExaminerKeys").map(String))) {
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) throw new Error("Fila de examinador no válida.");
      const name = text(form, `examinerName:new:${key}`);
      const grades = form.getAll(`scope:new:${key}`).map(String);
      if (name || grades.length) examiners.push({ id: "", name, grades });
    }
    const name = text(form, "examinerName:new");
    if (name || form.getAll("scope:new").length)
      examiners.push({
        id: "",
        name,
        grades: form.getAll("scope:new").map(String),
      });
    await saveAdultGradeGroups({
      eventId,
      examiners: examiners.map((row) => ({ ...row, id: row.id || undefined })),
    });
  } catch (error) {
    errorText = message(error);
  }
  revalidatePath(`/examenes/${eventId}`);
  redirect(
    `/examenes/${eventId}?${errorText ? `error=assignments&detail=${encodeURIComponent(errorText)}` : "saved=assignments"}`,
  );
}
