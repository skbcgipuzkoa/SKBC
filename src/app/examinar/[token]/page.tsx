import { submitIntegratedExamScoresAction } from "@/app/actions";
import { getExaminerExamByToken } from "@/lib/integrated-exams";

export default async function ExaminerTokenPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  let payload: Awaited<ReturnType<typeof getExaminerExamByToken>>;
  try {
    payload = await getExaminerExamByToken(token);
  } catch {
    return (
      <main className="public-exam-page">
        <section className="public-exam-hero">
          <p className="eyebrow">SKBC Gipuzkoa</p>
          <h1>Enlace no valido</h1>
          <p>Este enlace de examen no existe, ha caducado o ha sido desactivado.</p>
        </section>
        <section className="card">
          <h2>No se puede abrir este examen</h2>
          <p className="muted">Si crees que es un error, pide al responsable del examen que te envie un enlace nuevo.</p>
        </section>
      </main>
    );
  }
  const scoreMap = new Map(payload.existingScores.map((score) => [`${score.event_student_id}:${score.event_item_id}`, score]));
  const submitted = Boolean(payload.examiner.submitted_at || query.saved);
  const scorableItems = payload.items.filter((item) => item.source !== "cut");

  return (
    <main className="public-exam-page">
      <section className="public-exam-hero">
        <p className="eyebrow">SKBC Gipuzkoa</p>
        <h1>{payload.event.title}</h1>
        <p>{payload.event.exam_date} · Examinador: <strong>{payload.examiner.name}</strong></p>
      </section>

      {query.saved ? <p className="save-ok">Evaluacion enviada correctamente. Gracias.</p> : null}
      {query.error ? <p className="form-error">No se pudo enviar la evaluacion{query.detail ? `: ${query.detail}` : "."}</p> : null}
      {submitted ? (
        <section className="card">
          <h2>Evaluacion recibida</h2>
          <p className="muted">Este enlace ya ha enviado puntuaciones. Si necesitas corregir algo, contacta con el administrador del examen.</p>
        </section>
      ) : (
        <form action={submitIntegratedExamScoresAction} className="public-exam-form">
          <input type="hidden" name="token" value={token} />
          <section className="card">
            <h2>Como puntuar</h2>
            <p className="muted">10 correcto, 5 mejorable, 0 no superado. Usa Omitir si ese punto no se ha evaluado para ese kenshi.</p>
          </section>

          {payload.items.map((item) => {
            if (item.source === "cut") {
              return (
                <section className="card exam-cut-marker" key={item.id}>
                  <p className="eyebrow">Corte progresivo</p>
                  <h2>{item.name}</h2>
                  <p className="muted">{item.summary}</p>
                </section>
              );
            }

            return (
              <section className="card exam-score-card" key={item.id}>
                <div className="section-heading-row">
                  <div>
                    <p className="eyebrow">{item.grade ?? "-"} · {item.section ?? item.category ?? "Item"}</p>
                    <h2>{item.name}</h2>
                    {item.summary ? <p className="muted">{item.summary}</p> : null}
                  </div>
                </div>
                <div className="exam-score-grid">
                  {payload.students.map((student) => {
                    const current = scoreMap.get(`${student.id}:${item.id}`);
                    const defaultValue = current?.skipped ? "skip" : String(current?.score ?? "");
                    return (
                      <fieldset className="exam-score-row" key={`${student.id}-${item.id}`}>
                        <legend>
                          <strong>{student.members?.display_name ?? "Kenshi"}</strong>
                          <small>{student.current_grade ?? "-"} para {student.target_grade ?? "-"}</small>
                        </legend>
                        <label><input name={`score:${student.id}:${item.id}`} type="radio" value="10" defaultChecked={defaultValue === "10"} required />10</label>
                        <label><input name={`score:${student.id}:${item.id}`} type="radio" value="5" defaultChecked={defaultValue === "5"} />5</label>
                        <label><input name={`score:${student.id}:${item.id}`} type="radio" value="0" defaultChecked={defaultValue === "0"} />0</label>
                        <label><input name={`score:${student.id}:${item.id}`} type="radio" value="skip" defaultChecked={defaultValue === "skip"} />Omitir</label>
                      </fieldset>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="card sticky-submit-card">
            <p className="muted">{payload.students.length} kenshis · {scorableItems.length} puntos evaluables</p>
            <button type="submit">Enviar evaluacion</button>
          </section>
        </form>
      )}
    </main>
  );
}
