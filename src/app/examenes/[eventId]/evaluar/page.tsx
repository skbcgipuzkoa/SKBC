import { redirect } from "next/navigation";
import { hasInternalAccess } from "@/lib/auth";
import { getInternalExamEvaluation } from "@/lib/integrated-exams";
import { submitInternalExamScoresAction } from "@/app/examenes/review-actions";
import { ExamEvaluationForm } from "@/app/examenes/components/ExamEvaluationForm";
export default async function InternalExamEvaluationPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    examiner?: string;
    grade?: string;
    saved?: string;
    error?: string;
    detail?: string;
  }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");
  const { eventId } = await params;
  const query = await searchParams;
  if (!query.examiner) redirect(`/examenes/${eventId}`);
  const payload = await getInternalExamEvaluation(
    eventId,
    query.examiner,
    query.grade,
  );
  return (
    <ExamEvaluationForm
      payload={payload}
      action={submitInternalExamScoresAction}
      fields={{
        eventId,
        examinerId: query.examiner,
        ...(query.grade ? { grade: query.grade } : {}),
      }}
      query={query}
      backHref={`/examenes/${eventId}#revision`}
    />
  );
}
