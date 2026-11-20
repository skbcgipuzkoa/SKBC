"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { approveExamCallFromPlanning, confirmPlanningExamDate, setExamContinuityException } from "@/lib/exam-invitations";

export async function setExamContinuityExceptionAction(form: FormData) {
  try {
    await setExamContinuityException(String(form.get("invitationId") ?? ""), form.get("authorize") === "true", String(form.get("reason") ?? ""));
  } catch {
    redirect("/proximos-examenes?view=called&call=all&error=" + encodeURIComponent("No se pudo cambiar la excepción. Indica un motivo y comprueba que la convocatoria siga vigente."));
  }
  for (const path of ["/proximos-examenes", "/notificaciones/examenes"]) revalidatePath(path);
  revalidatePath("/ficha/[token]", "page");
  revalidatePath("/convocatoria/[token]", "page");
  redirect("/proximos-examenes?view=called&call=all&saved=continuity");
}

export async function approvePlanningExamCallAction(form: FormData) {
  const callKey = String(form.get("callKey") ?? "");
  const examDate = String(form.get("examDate") ?? "");
  try {
    await approveExamCallFromPlanning({ memberIds: form.getAll("memberIds").map(String), callKey, examDate });
  } catch {
    redirect("/proximos-examenes?error=" + encodeURIComponent("No se pudo aprobar. Comprueba que los seleccionados no estén ya convocados y que puedan completar los requisitos. Para los ya convocados, utiliza «Confirmar día y ver inscritos»."));
  }
  revalidatePath("/proximos-examenes");
  revalidatePath("/ficha/[token]", "page");
  revalidatePath("/notificaciones/examenes");
  revalidatePath("/examenes");
  redirect("/proximos-examenes?" + new URLSearchParams({ call: callKey, approved: "1" }));
}

export async function confirmPlanningExamDateAction(form: FormData) {
  try {
    await confirmPlanningExamDate({ eventId: String(form.get("eventId") ?? ""), examDate: String(form.get("examDate") ?? "") });
  } catch {
    redirect("/proximos-examenes?error=" + encodeURIComponent("No se pudo confirmar el día. Debe ser una fecha futura del mes convocado y permitir cumplir los requisitos. Se conservan las respuestas y reservas anteriores."));
  }
  for (const path of ["/proximos-examenes", "/notificaciones/examenes", "/examenes"]) revalidatePath(path);
  revalidatePath("/ficha/[token]", "page");
  redirect("/proximos-examenes?confirmed=1");
}
