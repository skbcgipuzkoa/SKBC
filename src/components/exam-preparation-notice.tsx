import { examPreparationClosure, examPreparationDetail } from "@/lib/technical-progress-display";

export function ExamPreparationNotice({ focus }: { focus: string | null | undefined }) {
  const detail = examPreparationDetail(focus);
  if (detail === null) return null;
  const closure = examPreparationClosure(detail);
  const summary = detail.split(/(?<=\.)\s/)[0];
  const projectionIndex = detail.indexOf("Proyeccion para");
  const caveat = projectionIndex >= 0 ? detail.slice(projectionIndex) : "Proyección condicionada a asistir y completar las propuestas; no acredita aptitud ni registra progreso.";
  const additionalBenefit = detail
    .slice(summary.length, projectionIndex >= 0 ? projectionIndex : undefined)
    .replace(closure ?? "", "")
    .trim();
  return <div className="exam-preparation-notice">
    <strong>Preparación de examen · requisito técnico previsto</strong>
    <p>{summary}</p>
    {additionalBenefit ? <p>{additionalBenefit}</p> : null}
    {closure ? <p><strong>{closure}</strong></p> : null}
    <p>{caveat}</p>
  </div>;
}
