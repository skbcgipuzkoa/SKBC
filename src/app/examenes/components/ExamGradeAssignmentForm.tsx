import { saveIntegratedExamAssignmentsAction } from "@/app/examenes/review-actions";
export function ExamGradeAssignmentForm({
  eventId,
  examiners,
  grades,
  scopes,
  locked,
  pendingExaminerIds = [],
}: {
  eventId: string;
  examiners: { id: string; name: string; revoked_at: string | null }[];
  grades: string[];
  scopes: Record<string, string[]>;
  locked: boolean;
  pendingExaminerIds?: string[];
}) {
  return (
    <section className="card exam-grade-assignments">
      <h2>Examinadores y grupos de grado</h2>
      <p>
        Escribe el nombre de cada persona y asigna uno o varios grados. Los
        nombres iguales se combinan en un solo enlace personal para todos sus
        grados.
      </p>
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
          Asignaciones de consulta: ya hay puntuaciones o una evaluacion enviada
          o el examen esta cerrado. No se pueden cambiar los grados asignados.
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
                <input type="hidden" name="examinerIds" value={examiner.id} />
                <label>
                  Nombre del examinador
                  <input
                    name={`examinerName:${examiner.id}`}
                    defaultValue={
                      pendingExaminerIds.includes(examiner.id)
                        ? ""
                        : examiner.name
                    }
                    placeholder="Identificar al abrir o escribir nombre"
                  />
                </label>
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
            <div className="exam-grade-assignment-row">
              <h3>Anadir otra persona (opcional)</h3>
              <label>
                Nombre
                <input
                  name="examinerName:new"
                  placeholder="Nombre de otro examinador"
                />
              </label>
              <div>
                {grades.map((grade) => (
                  <label className="check-row" key={grade}>
                    <input name="scope:new" type="checkbox" value={grade} />
                    <span>{grade}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
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
