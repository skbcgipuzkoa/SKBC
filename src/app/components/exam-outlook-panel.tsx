import type { ExamOutlook } from "@/lib/exam-outlook";

const labels = {
  ready: "Requisitos medidos completos",
  projected: "Posible candidato proyectado",
  notyet: "Todavia faltan requisitos",
  unknown: "Prevision incierta"
};

export function ExamOutlookPanel({ outlook, compact = false }: { outlook?: ExamOutlook; compact?: boolean }) {
  if (!outlook) return <p className="muted">Sin prevision de examen disponible.</p>;
  const content = <>
    <strong className={`state-badge ${outlook.currentReady ? "state-completada" : "state-en-progreso"}`}>{labels[outlook.classification]}</strong>
    <p>Convocatoria: {outlook.callDate ?? "sin fecha futura"} · Objetivo: {outlook.targetGrade || "por revisar"}</p>
    <p>Fecha estimada: {outlook.estimatedReadyOn ?? "sin estimacion fiable"} · Margen: {outlook.marginDays === null ? "sin estimacion" : `${outlook.marginDays} dias${outlook.marginDays >= 0 && outlook.marginDays < 30 ? " (margen corto)" : ""}`}</p>
    {outlook.deficits.length ? <p>Pendiente: {outlook.deficits.join(" · ")}</p> : null}
    {outlook.uncertainty.length ? <p>{outlook.uncertainty.join(" · ")}</p> : null}
    {!compact ? <p className="muted">Observacion: {outlook.evidence.windowStart} a {outlook.evidence.windowEnd} · {outlook.evidence.attendanceDays} dias de asistencia registrados.</p> : null}
    <small>Prevision orientativa, sujeta a revision del profesor. No concede aptitud ni aprueba el examen.</small>
  </>;
  return compact ? <div className="exam-candidate-summary">{content}</div> : <section className="card exam-outlook-panel" aria-label="Preparacion y prevision de examen">{content}</section>;
}
