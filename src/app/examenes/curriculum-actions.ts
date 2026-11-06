"use server";

import { hasInternalAccess } from "@/lib/auth";
import { completeAdultExamCurriculum } from "@/lib/integrated-exams";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function completeAdultExamCurriculumAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const eventId = String(form.get("eventId") ?? "").trim();
  if (!eventId) redirect("/examenes");
  const path = `/examenes/${encodeURIComponent(eventId)}`;
  try {
    await completeAdultExamCurriculum(eventId);
  } catch (error) {
    redirect(`${path}?error=curriculum&detail=${encodeURIComponent(error instanceof Error ? error.message : "No se pudo completar el temario.")}`);
  }
  revalidatePath(path);
  revalidatePath("/examenes");
  redirect(`${path}?saved=curriculum`);
}
