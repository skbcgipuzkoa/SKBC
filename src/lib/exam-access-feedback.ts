export function getExamAccessFeedback(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Enlace de examen no valido." || message === "Examen no encontrado.") return {
    kind:"invalid", title:"Enlace no valido",
    description:"Este enlace de examen no existe o ha sido desactivado.",
    hint:"Pide al responsable del examen que compruebe el acceso o te facilite un enlace nuevo.",
  };
  if (message.startsWith("Día pendiente de confirmar.")) return {
    kind:"pending-date", title:"Día del examen pendiente de confirmar",
    description:"El profesor debe confirmar el día del examen antes de comenzar la evaluación.",
    hint:"Consulta con el responsable de la convocatoria.",
  };
  if (message === "Grado ajeno a esta asignacion.") return {
    kind:"wrong-grade", title:"Grado no asignado a este acceso",
    description:"Este enlace no permite evaluar el grado seleccionado.",
    hint:"Abre el enlace personal del examinador o pide al profesor que revise los grados asignados.",
  };
  return {
    kind:"temporary", title:"No se puede abrir el examen ahora",
    description:"Se ha producido un problema al cargar el examen.",
    hint:"Vuelve a intentarlo. Si continúa, avisa al responsable para que compruebe el acceso.",
  };
}

/** Log only a bounded diagnostic code: never the credential, URL, raw error or personal data. */
export function reportExamAccessFailure(error: unknown, phase: "alias" | "exam") {
  if (getExamAccessFeedback(error).kind !== "temporary") return;
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  console.error("Exam access lookup failed", {phase, code:typeof code === "string" && /^(PGRST\d{3}|[0-9A-Z]{5})$/.test(code) ? code : "UNKNOWN"});
}
