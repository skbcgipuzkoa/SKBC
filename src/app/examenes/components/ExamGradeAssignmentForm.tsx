import { saveIntegratedExamAssignmentsAction } from "@/app/examenes/review-actions";
export function ExamGradeAssignmentForm({
  eventId,
  examiners,
  grades,
  scopes,
  locked,
}: {
  eventId: string;
  examiners: { id: string; name: string; revoked_at: string | null }[];
  grades: string[];
  scopes: Record<string, string[]>;
  locked: boolean;
}) {
  return (
    <section className="card exam-grade-assignments">
      <h2>Grados de cada examinador</h2>
      <p>
        Selecciona uno o varios grados objetivo para cada examinador. Recibira
        todos los alumnos y el temario completo de esos grados. El profesor
        revisa el resultado final de todo el examen.
      </p>
      <p className="muted">
        El grado objetivo es el grado al que se presenta el alumno. Varios
        examinadores pueden compartir un grado; todos los grados deben quedar
        cubiertos. Los examenes anteriores incluyen todos los grados por
        defecto.
      </p>
      {locked ? (
        <p className="info-banner">
          Asignaciones de consulta: ya hay una evaluacion enviada o el examen
          esta cerrado. No se pueden cambiar los grados asignados.
        </p>
      ) : null}
      <form action={saveIntegratedExamAssignmentsAction}>
        <input type="hidden" name="eventId" value={eventId} />
        <fieldset disabled={locked}>
          <legend>Asignacion por grado objetivo</legend>
          {examiners
            .filter((examiner) => !examiner.revoked_at)
            .map((examiner) => (
              <div className="exam-grade-assignment-row" key={examiner.id}>
                <strong>{examiner.name}</strong>
                <div>
                  {grades.map((grade) => (
                    <label className="check-row" key={grade}>
                      <input
                        type="checkbox"
                        name={`scope:${examiner.id}`}
                        value={grade}
                        defaultChecked={
                          scopes[examiner.id]?.includes(grade) ?? true
                        }
                      />
                      <span>{grade}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          {!locked ? (
            <button type="submit">
              Guardar grados de todos los examinadores
            </button>
          ) : null}
        </fieldset>
      </form>
    </section>
  );
}
