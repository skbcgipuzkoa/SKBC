import {
  getExaminerExamByToken,
  isExamItemRelevantForStudent,
  isKidsProgressiveCutForStudent,
} from "@/lib/integrated-exams";
type Payload = Awaited<ReturnType<typeof getExaminerExamByToken>>;
export function ExamEvaluationForm({
  payload,
  action,
  fields,
  query = {},
  backHref,
}: {
  payload: Payload;
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  query?: { saved?: string; error?: string; detail?: string };
  backHref?: string;
}) {
  const scoreMap = new Map(
    payload.existingScores.map((score) => [
      `${score.event_student_id}:${score.event_item_id}`,
      score,
    ]),
  );
  const submitted = Boolean(
    payload.examiner.submitted_at ||
    query.saved ||
    payload.event.status === "completed" ||
    payload.event.status === "archived",
  );
  const scorableItems = payload.items.filter(
    (item) => item.source !== "cut" && item.weight > 0,
  );
  const isKidsProgressive =
    payload.event.program_type === "kids" ||
    payload.event.program_type === "kids_progressive";

  return (
    <main className="public-exam-page">
      <section className="public-exam-hero">
        <p className="eyebrow">SKBC Gipuzkoa</p>
        <h1>{payload.event.title}</h1>
        <p>
          {payload.event.exam_date} - Examinador:{" "}
          <strong>{payload.examiner.name}</strong>
        </p>
      </section>

      {backHref ? (
        <p>
          <a className="text-link" href={backHref}>
            Volver a revisar evaluaciones
          </a>
        </p>
      ) : null}
      {query.saved ? (
        <p className="save-ok">Evaluacion enviada correctamente. Gracias.</p>
      ) : null}
      {query.error ? (
        <p className="form-error">
          No se pudo enviar la evaluacion
          {query.detail ? `: ${query.detail}` : "."}
        </p>
      ) : null}
      {submitted ? (
        <section className="card">
          <h2>Evaluacion recibida</h2>
          <p className="muted">
            {backHref
              ? "Evaluacion recibida. Vuelve a la revision para consultar las notas y decidir los resultados."
              : "Este enlace ya ha enviado puntuaciones. Si necesitas corregir algo, contacta con el administrador del examen."}
          </p>
        </section>
      ) : (
        <form action={action} className="public-exam-form">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <section className="card">
            <h2>Como puntuar</h2>
            <p className="muted">
              Puntua de 0 a 10 en pasos de 0,5. Usa No evaluado si ese punto no
              se ha evaluado para ese kenshi.
            </p>
          </section>

          {payload.items
            .filter((item) => item.source === "cut" || item.weight > 0)
            .map((item) => {
              if (item.source === "cut") {
                const seatedStudents = isKidsProgressive
                  ? payload.students.filter((student) =>
                      isKidsProgressiveCutForStudent(student, item),
                    )
                  : [];
                return (
                  <section className="card exam-cut-marker" key={item.id}>
                    <p className="eyebrow">Corte progresivo</p>
                    <h2>{item.name}</h2>
                    <p className="muted">{item.summary}</p>
                    {seatedStudents.length ? (
                      <div className="exam-seated-list">
                        <strong>Se sientan aqui</strong>
                        <p>
                          {seatedStudents
                            .map(
                              (student) =>
                                student.members?.display_name ?? "Kenshi",
                            )
                            .join(", ")}
                        </p>
                      </div>
                    ) : null}
                  </section>
                );
              }

              const relevantStudents = payload.students.filter((student) =>
                isExamItemRelevantForStudent(
                  payload.event.program_type,
                  student,
                  item,
                ),
              );

              return (
                <section className="card exam-score-card" key={item.id}>
                  <div className="section-heading-row">
                    <div>
                      <p className="eyebrow">
                        {item.grade ?? "-"} -{" "}
                        {item.section ?? item.category ?? "Item"}
                      </p>
                      <h2>{item.name}</h2>
                      {item.summary ? (
                        <p className="muted">{item.summary}</p>
                      ) : null}
                    </div>
                    {isKidsProgressive ? (
                      <span className="state-badge">
                        {relevantStudents.length} continuan
                      </span>
                    ) : null}
                  </div>
                  <div className="exam-score-grid">
                    {relevantStudents.map((student) => {
                      const current = scoreMap.get(`${student.id}:${item.id}`);
                      const defaultValue = current?.skipped
                        ? "skip"
                        : String(current?.score ?? "");
                      return (
                        <fieldset
                          className="exam-score-row"
                          key={`${student.id}-${item.id}`}
                        >
                          <legend>
                            <strong>
                              {student.members?.display_name ?? "Kenshi"}
                            </strong>
                            <small>
                              {student.current_grade ?? "-"} para{" "}
                              {student.target_grade ?? "-"}
                            </small>
                          </legend>
                          <label>
                            Puntuacion
                            <select
                              name={`score:${student.id}:${item.id}`}
                              defaultValue={defaultValue}
                              required
                            >
                              <option value="" disabled>
                                Seleccionar
                              </option>
                              {Array.from(
                                { length: 21 },
                                (_, index) => index / 2,
                              ).map((score) => (
                                <option key={score} value={score}>
                                  {score}
                                </option>
                              ))}
                              <option value="skip">No evaluado</option>
                            </select>
                          </label>
                          <label className="exam-score-notes">
                            Observaciones
                            <textarea
                              name={`notes:${student.id}:${item.id}`}
                              rows={2}
                              defaultValue={current?.notes ?? ""}
                            />
                          </label>
                        </fieldset>
                      );
                    })}
                  </div>
                </section>
              );
            })}

          <section className="card sticky-submit-card">
            <p className="muted">
              {payload.students.length} kenshis - {scorableItems.length} puntos
              evaluables
            </p>
            <button type="submit">Enviar evaluacion</button>
          </section>
        </form>
      )}
    </main>
  );
}
