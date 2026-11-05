export function ExamCallAttribution({ event }: { event: { exam_date: string; call_month?: string | null; is_retake?: boolean | null } }) {
  if (!event.call_month) return null;
  return <small style={{ display: "block" }}>
    {event.is_retake ? `Recuperación · convocatoria ${event.call_month}` : `Convocatoria ${event.call_month}`}
  </small>;
}
