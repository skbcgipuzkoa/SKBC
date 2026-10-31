import { identifyIntegratedExaminerAction } from "@/app/actions";
import { decodeScoreNotes } from "@/lib/integrated-exam-session";
import { driveImageUrl } from "@/lib/drive";
import {
  getExaminerExamByToken,
  isExamItemRelevantForStudent,
  isKidsProgressiveCutForStudent,
} from "@/lib/integrated-exams";
import {
  ExamStepNavigator,
  StudentPointControls,
  ExamScoreFeedback,
  StudentExamPhoto,
  type ExamNavigationStep,
} from "./ExamStepNavigator";
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
  const initialAdjustments = payload.existingScores.flatMap((score) =>
    decodeScoreNotes(score.notes).adjustments.map((adjustment) => ({
      ...adjustment,
      eventStudentId: score.event_student_id,
    })),
  );
  const submitted = Boolean(
    payload.examiner.submitted_at ||
    query.saved === "1" ||
    query.saved === "evaluation" ||
    (fields.grade && payload.completedGrades?.includes(fields.grade)) ||
    (payload.assignedGrades?.length &&
      payload.assignedGrades.every((grade) =>
        payload.completedGrades?.includes(grade),
      )) ||
    payload.event.status === "completed" ||
    payload.event.status === "archived",
  );
  const scorableItems = payload.items.filter(
    (item) => item.source !== "cut" && item.weight > 0,
  );
  const isKidsProgressive =
    payload.event.program_type === "kids" ||
    payload.event.program_type === "kids_progressive";
  const visibleItems = payload.items.filter(
    (item) => item.source === "cut" || item.weight > 0,
  );
  function continuingAfterCut(item: Payload["items"][number]) {
    return payload.students.filter(
      (student) =>
        !isKidsProgressive ||
        (!isKidsProgressiveCutForStudent(student, item) &&
          isExamItemRelevantForStudent(payload.event.program_type, student, {
            grade: item.cut_grade ?? item.grade,
          })),
    );
  }
  const steps: ExamNavigationStep[] = [
    ...visibleItems.map((item): ExamNavigationStep => ({
      id: item.id,
      title:
        !isKidsProgressive && item.grade
          ? `${item.grade} · ${item.name}`
          : item.name,
      kind: item.source === "cut" ? "cut" : "exercise",
      continueLabel:
        item.source === "cut"
          ? continuingAfterCut(item).length
            ? "Continuar con el resto de kenshis"
            : "Finalizar recorrido"
          : "Continuar",
    })),
    { id: "finish", title: "Enviar evaluacion", kind: "finish" },
  ];

  if (payload.needsExaminerName)
    return (
      <main className="public-exam-page">
        <section className="public-exam-hero">
          <p className="eyebrow">SKBC Gipuzkoa</p>
          <h1>{payload.event.title}</h1>
          <h2>Identificate antes de evaluar</h2>
          <p>
            Escribe tu nombre para atribuirte las valoraciones de{" "}
            {payload.routeGrades?.join(", ") || "este grupo"}.
          </p>
        </section>
        {query.error ? (
          <p className="form-error">
            {query.detail || "No se pudo guardar el nombre."}
          </p>
        ) : null}
        {fields.token ? (
          <form action={identifyIntegratedExaminerAction} className="card">
            <input type="hidden" name="token" value={fields.token} />
            {fields.grade ? (
              <input type="hidden" name="grade" value={fields.grade} />
            ) : null}
            <label>
              Nombre y apellidos
              <input
                name="examinerName"
                required
                maxLength={120}
                autoComplete="name"
              />
            </label>
            <button type="submit">Identificarme y abrir el grupo</button>
          </form>
        ) : (
          <section className="card">
            <p>
              Asigna el nombre del examinador desde el panel de grupos antes de
              abrir la evaluacion interna.
            </p>
            {backHref ? (
              <a className="secondary-link" href={backHref}>
                Volver al panel y asignar nombre
              </a>
            ) : null}
          </section>
        )}
      </main>
    );
  const remainingGrades =
    payload.assignedGrades?.filter(
      (grade) => !payload.completedGrades?.includes(grade),
    ) ?? [];
  const remainingHref = fields.token
    ? `/examinar/${fields.token}`
    : fields.eventId && fields.examinerId
      ? `/examenes/${fields.eventId}/evaluar?examiner=${encodeURIComponent(fields.examinerId)}`
      : backHref;
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

      {!isKidsProgressive && payload.assignedGrades?.length ? (
        <section className="card exam-assigned-grades">
          <h2>Tu recorrido por grados</h2>
          <p>
            Grados objetivo asignados:{" "}
            <strong>{payload.assignedGrades.join(", ")}</strong>.
          </p>
          <p>
            Este recorrido:{" "}
            <strong>
              {payload.routeGrades?.join(", ") || "Sin grados pendientes"}
            </strong>
            . Completados: {payload.completedGrades?.join(", ") || "Ninguno"}.
            Pendientes: {remainingGrades.join(", ") || "Ninguno"}.
          </p>
          <p className="muted">
            Evalua el temario completo de estos grados y sus alumnos. El
            profesor revisa al final todo el examen.
          </p>
        </section>
      ) : null}
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
          <h2>
            {fields.grade
              ? `Evaluacion de ${fields.grade} recibida`
              : "Evaluacion recibida"}
          </h2>
          {remainingGrades.length && remainingHref ? (
            <p>
              <a className="secondary-link" href={remainingHref}>
                Continuar con grados pendientes: {remainingGrades.join(", ")}
              </a>
            </p>
          ) : null}
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
          <details className="card exam-wizard-help">
            <summary>
              Como valorar: Bien 10 · Mejorable 5 · Necesita aprenderlo 0 ·
              Omitir
            </summary>
            <p className="muted">
              Valora cada tecnica o ejercicio para todos los alumnos que
              continuan: Bien (10), Mejorable (5), Necesita aprenderlo (0) u
              Omitir. Omitir no puntua ni cuenta como cero. La nota final es la
              media de las valoraciones de los examinadores, con revision final
              del profesor.
            </p>
          </details>

          <ExamStepNavigator
            steps={steps}
            initialAdjustments={initialAdjustments}
            students={payload.students.map((student) => ({
              id: student.id,
              name: student.members?.display_name ?? "Kenshi",
            }))}
          >
            {visibleItems.map((item) => {
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
                    {isKidsProgressive ? (
                      <div className="exam-continuing-list">
                        <strong>Continuan</strong>
                        <p>
                          {continuingAfterCut(item)
                            .map(
                              (student) =>
                                student.members?.display_name ?? "Kenshi",
                            )
                            .join(", ") ||
                            "Todos los kenshis han terminado su recorrido. Continua para revisar el envio."}
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
                  <div className="section-heading-row exam-activity-heading">
                    <div>
                      <p className="eyebrow">
                        {item.grade ?? "-"} -{" "}
                        {item.section ?? item.category ?? "Item"}
                      </p>
                      <h2>{item.name}</h2>
                    </div>
                    {isKidsProgressive ? (
                      <span className="state-badge">
                        {relevantStudents.length} continuan
                      </span>
                    ) : null}
                  </div>
                  {item.summary ? (
                    <p className="muted exam-activity-description">
                      {item.summary}
                    </p>
                  ) : null}
                  <div className="exam-score-grid exam-group-rows">
                    {relevantStudents.map((student) => {
                      const current = scoreMap.get(`${student.id}:${item.id}`);
                      const defaultValue = current?.skipped
                        ? "skip"
                        : String(current?.score ?? "");
                      return (
                        <div
                          className="exam-score-row"
                          key={`${student.id}-${item.id}`}
                        >
                          <div className="exam-group-student">
                            <div className="exam-student-identity">
                              <StudentExamPhoto
                                src={driveImageUrl(student.members?.photo_url)}
                                name={student.members?.display_name ?? "Kenshi"}
                              />
                              <div>
                                <strong>
                                  {student.members?.display_name ?? "Kenshi"}
                                </strong>
                                <small>
                                  {student.current_grade ?? "-"} para{" "}
                                  {student.target_grade ?? "-"}
                                </small>
                                <StudentPointControls
                                  studentId={student.id}
                                  name={
                                    student.members?.display_name ?? "Kenshi"
                                  }
                                />
                              </div>
                            </div>
                          </div>
                          <ExamScoreFeedback
                            initialScore={defaultValue}
                            initialNotes={decodeScoreNotes(current?.notes).text}
                            name={`notes:${student.id}:${item.id}`}
                            studentName={
                              student.members?.display_name ?? "Kenshi"
                            }
                            examinerName={payload.examiner.name}
                          >
                            <fieldset className="exam-rating-options">
                              <legend className="exam-rating-legend">
                                Valoracion de{" "}
                                {student.members?.display_name ?? "Kenshi"}
                              </legend>
                              {[
                                {
                                  value: "10",
                                  label: "Bien",
                                  detail: "10",
                                  tone: "good",
                                },
                                {
                                  value: "5",
                                  label: "Mejorable",
                                  detail: "5",
                                  tone: "improve",
                                },
                                {
                                  value: "0",
                                  label: "Necesita aprenderlo",
                                  detail: "0",
                                  tone: "learn",
                                },
                                {
                                  value: "skip",
                                  label: "Omitir",
                                  detail: "Sin nota",
                                  tone: "skip",
                                },
                              ].map((option) => (
                                <label
                                  className={`exam-rating-option exam-rating-${option.tone}`}
                                  key={option.value}
                                >
                                  <input
                                    type="radio"
                                    name={`score:${student.id}:${item.id}`}
                                    value={option.value}
                                    defaultChecked={
                                      defaultValue === option.value
                                    }
                                    required
                                  />
                                  <span>
                                    {option.label}
                                    <strong>{option.detail}</strong>
                                  </span>
                                </label>
                              ))}
                            </fieldset>
                          </ExamScoreFeedback>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <section className="card exam-finish-screen">
              <p className="muted">
                {payload.students.length} kenshis - {scorableItems.length}{" "}
                actividades del temario completo
              </p>
              <button type="submit">Enviar evaluacion</button>
            </section>
          </ExamStepNavigator>
        </form>
      )}
    </main>
  );
}
