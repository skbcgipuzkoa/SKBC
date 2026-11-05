import type { ExamOutlook } from "@/lib/exam-outlook";
import { formatExamCallMonth } from "@/lib/exam-call";

const labels = {
  ready: "Requisitos medidos completos",
  projected: "Posible candidato proyectado",
  notyet: "No se preve llegar al ritmo actual",
  unknown: "Sin estimacion fiable"
};

export function ExamOutlookPanel({ outlook, compact = false }: { outlook?: ExamOutlook; compact?: boolean }) {
  if (!outlook) return <p className="muted">Sin prevision de examen disponible.</p>;
  const impossible = outlook.feasibility === "impossible";
  const preparing = !impossible && outlook.preparationCandidate && outlook.classification !== "ready" && outlook.classification !== "projected";
  const content = <>
    <strong className={`state-badge ${outlook.currentReady ? "state-completada" : "state-en-progreso"}`}>{impossible ? "No llega con las clases previstas" : preparing ? "Candidato para preparar" : labels[outlook.classification]}</strong>
    {impossible ? <p>{outlook.impossibilityReasons.join(" · ")} · {outlook.evidence.remainingSessions} clases previstas restantes.</p> : null}
    {preparing ? <p>Prevision: {labels[outlook.classification]}</p> : null}
    {outlook.planningReasons?.length ? <p>Preparacion: {outlook.planningReasons.join(" · ")}</p> : null}
    <p>Convocatoria orientativa: {formatExamCallMonth(outlook.callDate)} · día pendiente de confirmar · Objetivo: {outlook.targetGrade || "por revisar"}</p>
    <p>Fecha estimada: {!impossible && outlook.estimatedReadyOn ? outlook.estimatedReadyOn : "sin estimacion fiable"} · Margen: {impossible || outlook.marginDays === null ? "sin estimacion" : `${outlook.marginDays} dias${outlook.marginDays >= 0 && outlook.marginDays < 30 ? " (margen corto)" : ""}`}</p>
    {outlook.deficits.length ? <p>Pendiente: {outlook.deficits.join(" · ")}</p> : null}
    {outlook.uncertainty.length ? <p>{outlook.uncertainty.join(" · ")}</p> : null}
    {!compact ? <p className="muted">Observacion: {outlook.evidence.windowStart} a {outlook.evidence.windowEnd} · {outlook.evidence.attendanceDays} dias de asistencia registrados.</p> : null}
    <small>Prevision orientativa, sujeta a revision del profesor. No concede aptitud ni aprueba el examen.</small>
    <small>El margen es orientativo hasta final del mes; se revisará al fijar el día.</small>
  </>;
  return compact ? <div className="exam-candidate-summary">{content}</div> : <section className="card exam-outlook-panel" aria-label="Preparacion y prevision de examen">{content}</section>;
}
