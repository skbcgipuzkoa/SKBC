import { ExamEvaluationForm } from "@/app/examenes/components/ExamEvaluationForm";
import { submitIntegratedExamScoresAction } from "@/app/actions";
import { getExaminerExamByToken } from "@/lib/integrated-exams";
import { getExaminerGradeLinks } from "@/lib/examiner-grade-links";
import { formatExamCallMonth } from "@/lib/exam-call";
import { redirect } from "next/navigation";
import { ExamAccessNavigation } from "@/app/examinar/ExamAccessNavigation";
import { getExamAccessFeedback, reportExamAccessFailure } from "@/lib/exam-access-feedback";

function ExamAccessFailure({error,phase}:{error:unknown;phase:"alias"|"exam"}) {
  const feedback=getExamAccessFeedback(error);
  reportExamAccessFailure(error,phase);
  return <main className="public-exam-page"><section className="public-exam-hero"><p className="eyebrow">SKBC Gipuzkoa</p><h1>{feedback.title}</h1><p>{feedback.description}</p></section><section className="card"><h2>No se puede abrir este examen</h2><p className="muted">{feedback.hint}</p><ExamAccessNavigation /></section></main>;
}

export default async function ExaminerTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    grade?: string;
    saved?: string;
    error?: string;
    detail?: string;
  }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  let grouped: Awaited<ReturnType<typeof getExaminerGradeLinks>>;
  try {
    grouped = await getExaminerGradeLinks(token, query.grade);
  } catch (error) {
    return <ExamAccessFailure error={error} phase="alias" />;
  }
  if (grouped) {
    if (grouped.links.length === 1 && grouped.links[0].dateConfirmed) redirect(`/examinar/${encodeURIComponent(grouped.links[0].token)}`);
    return <main className="public-exam-page"><section className="public-exam-hero"><p className="eyebrow">SKBC Gipuzkoa</p><h1>Exámenes por grado</h1><p>Examinador: {grouped.examinerName}. Tu enlace sigue siendo válido; elige el grado que vas a valorar.</p></section><section className="card">
      {!grouped.links.length ? <p>No hay grados disponibles para este acceso. Consulta con el profesor.</p> : grouped.links.map((exam) => <article key={exam.eventId} style={{ padding: "16px 0", borderBottom: "1px solid #d9e3ef" }}><h2>{exam.targetGrade}</h2><p>{formatExamCallMonth(exam.callMonth)} · {exam.examDate ? exam.examDate.split("-").reverse().join("/") : "día pendiente de confirmar"}</p>{exam.dateConfirmed ? <a className="text-link" href={`/examinar/${encodeURIComponent(exam.token)}`} style={{ display: "inline-block", minHeight: 44 }}>Abrir examen de {exam.targetGrade}</a> : <p>El profesor confirmará el día antes de comenzar la evaluación.</p>}</article>)}
      <ExamAccessNavigation />
    </section></main>;
  }
  let payload: Awaited<ReturnType<typeof getExaminerExamByToken>>;
  try {
    payload = await getExaminerExamByToken(token, query.grade);
  } catch (error) {
    return <ExamAccessFailure error={error} phase="exam" />;
  }

  return (
    <ExamEvaluationForm
      payload={payload}
      action={submitIntegratedExamScoresAction}
      fields={{ token, ...(query.grade ? { grade: query.grade } : {}) }}
      query={query}
    />
  );
}
