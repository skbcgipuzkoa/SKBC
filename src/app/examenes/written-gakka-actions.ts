"use server";

import { hasInternalAccess } from "@/lib/auth";
import { saveAdultWrittenGakkaSelection } from "@/lib/integrated-exams";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveAdultWrittenGakkaSelectionAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const eventId = String(form.get("eventId") ?? "").trim();
  if (!eventId) redirect("/examenes");
  const path = `/examenes/${encodeURIComponent(eventId)}`;
  try {
    await saveAdultWrittenGakkaSelection({ eventId, grade: String(form.get("grade") ?? "").trim(), topicKeys: form.getAll("topicKeys").map(String) });
  } catch {
    redirect(`${path}?error=written-gakka`);
  }
  revalidatePath(path);
  redirect(`${path}?saved=written-gakka`);
}
