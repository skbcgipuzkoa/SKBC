"use server";

import { hasInternalAccess } from "@/lib/auth";
import { manageAdultExaminerLink } from "@/lib/integrated-exams";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function manageAdultExaminerLinkAction(form: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const eventId = String(form.get("eventId") ?? "").trim();
  const examinerId = String(form.get("examinerId") ?? "").trim();
  const operation = String(form.get("operation") ?? "");
  if (!eventId) redirect("/examenes");
  const path = `/examenes/${encodeURIComponent(eventId)}`;
  try {
    if (!examinerId || (operation !== "disable" && operation !== "renew")) throw new Error("Selecciona el examinador y la operación.");
    await manageAdultExaminerLink({eventId,examinerId,operation});
  } catch (error) {
    redirect(`${path}?error=examiner-link&detail=${encodeURIComponent(error instanceof Error ? error.message : "No se pudo modificar el enlace.")}`);
  }
  revalidatePath(path);
  redirect(`${path}?saved=${operation === "disable" ? "examiner-link-disabled" : "examiner-link-renewed"}`);
}
