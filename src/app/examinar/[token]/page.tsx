import { ExamEvaluationForm } from "@/app/examenes/components/ExamEvaluationForm";
import { submitIntegratedExamScoresAction } from "@/app/actions";
import { getExaminerExamByToken } from "@/lib/integrated-exams";

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
  let payload: Awaited<ReturnType<typeof getExaminerExamByToken>>;
  try {
    payload = await getExaminerExamByToken(token, query.grade);
  } catch {
    return (
      <main className="public-exam-page">
        <section className="public-exam-hero">
          <p className="eyebrow">SKBC Gipuzkoa</p>
          <h1>Enlace no valido</h1>
          <p>
            Este enlace de examen no existe, ha caducado o ha sido desactivado.
          </p>
        </section>
        <section className="card">
          <h2>No se puede abrir este examen</h2>
          <p className="muted">
            Si crees que es un error, pide al responsable del examen que te
            envie un enlace nuevo.
          </p>
        </section>
      </main>
    );
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
