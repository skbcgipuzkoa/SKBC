"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { approveExamCallFromPlanning } from "@/lib/exam-invitations";

export async function approvePlanningExamCallAction(form: FormData) {
  const callKey = String(form.get("callKey") ?? "");
  const examDate = String(form.get("examDate") ?? "");
  try {
    await approveExamCallFromPlanning({ memberIds: form.getAll("memberIds").map(String), callKey, examDate });
  } catch {
    redirect("/proximos-examenes?error=" + encodeURIComponent("No se pudo aprobar. Revisa la selección y la fecha real: debe permitir cumplir el tiempo y la preparación. Si ya hay inscripciones, modifica el examen existente desde Exámenes."));
  }
  revalidatePath("/proximos-examenes");
  revalidatePath("/ficha/[token]", "page");
  revalidatePath("/notificaciones/examenes");
  revalidatePath("/examenes");
  redirect("/proximos-examenes?" + new URLSearchParams({ call: callKey, approved: "1", examDate }));
}
