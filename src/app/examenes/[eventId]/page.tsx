import { StudentExamPhoto } from "@/app/examenes/components/ExamStepNavigator";
import { completeAdultExamCurriculumAction } from "@/app/examenes/curriculum-actions";
import { manageAdultExaminerLinkAction } from "@/app/examenes/examiner-link-actions";
import { driveImageUrl } from "@/lib/drive";
import { ExamGradeAssignmentForm } from "@/app/examenes/components/ExamGradeAssignmentForm";
import {
  saveIntegratedExamReviewAction,
  retryIntegratedExamDocumentsAction,
} from "@/app/examenes/review-actions";
import { isReviewCurrent } from "@/lib/integrated-exam-review";
import { decodeScoreNotes } from "@/lib/integrated-exam-session";
import { LogOut } from "lucide-react";
import {
  createIntegratedExamItemAction,
  deleteIntegratedExamEventAction,
  deleteIntegratedExamItemAction,
  finalizeIntegratedExamEventAction,
  logoutAction,
  updateIntegratedExamItemAction,
} from "@/app/actions";
import { SidebarNav } from "@/app/components/SidebarNav";
import { hasInternalAccess } from "@/lib/auth";
import { getIntegratedExamAdmin } from "@/lib/integrated-exams";
import { redirect } from "next/navigation";
import { listExamInvitationResponses } from "@/lib/exam-invitations";
import { InvitationResponses } from "@/app/notificaciones/examenes/responses";
import { updateExamInvitationEventAction } from "@/app/notificaciones/examenes/actions";
import "@/app/notificaciones/examenes/invitations.css";
import { ExamCallAttribution } from "@/app/examenes/components/ExamCallAttribution";
import { formatExamCallMonth } from "@/lib/exam-call";

export default async function IntegratedExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    detail?: string;
    registered?: string;
  }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const { eventId } = await params;
  const query = await searchParams;
  const invitationResponses = await listExamInvitationResponses(eventId);
  const {
    event,
    students,
    items,
    examiners,
    scores,
    summaries,
    reviews,
    examinerGradeScopes,
    adultTargetGrades,
    pendingExaminerIds,
    gradeGroupMode,
    hasSubmittedScores,
    completedGradesByExaminer,
  } = await getIntegratedExamAdmin(eventId);
  const publicBaseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://skbc.vercel.app";
  const scorableItems = items.filter((item) => item.source !== "cut");
  const isCompleted =
    event.status === "completed" || event.status === "archived";
  const isAdult =
    event.program_type === "adults" || event.program_type === "dan_tribunal";
  const hasTeacherReview = reviews.some(review => review.reviewed_at || review.final_passed != null || review.review_notes?.trim());
  const isExaminerComplete = (examiner: (typeof examiners)[number]) => {
    if (!isAdult) return Boolean(examiner.submitted_at);
    const assigned = examinerGradeScopes[examiner.id] ?? adultTargetGrades;
    return (
      !pendingExaminerIds.includes(examiner.id) &&
      assigned.length > 0 &&
      assigned.every((grade) =>
        completedGradesByExaminer[examiner.id]?.includes(grade),
      )
    );
  };
  const submittedExaminers = examiners.filter(
    (examiner) => !examiner.revoked_at && isExaminerComplete(examiner),
  ).length;
  const passedSummaries = summaries.filter(
    (summary) => summary.review?.decision === "pass",
  ).length;
  const failedSummaries = summaries.filter(
    (summary) => summary.review?.decision === "fail",
  ).length;
  const ready =
    students.length > 0 &&
    summaries.length === students.length &&
    summaries.every(
      (summary) =>
        summary.complete &&
        isReviewCurrent(summary.review, summary) &&
        summary.review?.decision,
    );
  const allSubmitted = examiners
    .filter((examiner) => !examiner.revoked_at)
    .every(isExaminerComplete);
  const documentFailures = summaries.some(
    (summary) => summary.review?.documentErrors?.length,
  );

  return (
    <div className="shell">
      <SidebarNav current="/examenes" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Examen integrado</p>
            <h1>{event.title}</h1>
            {event.target_grade ? <p>Grado objetivo: <strong>{event.target_grade}</strong></p> : null}
            <ExamCallAttribution event={event} />
          </div>
          <form action={logoutAction}>
            <button
              className="icon-button"
              type="submit"
              title="Salir"
              aria-label="Salir"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {query.saved === "created" ? (
          <p className="save-ok">
            Examen integrado creado. Copia los enlaces de examinador si los
            necesitas.
          </p>
        ) : null}
        {query.saved === "assignments" ? (
          <p className="save-ok">
            Grados asignados guardados. Los enlaces de cada examinador muestran
            su recorrido.
          </p>
        ) : null}
        {query.saved === "review" ? (
          <p className="save-ok">
            Revision guardada. Los grados se actualizan solo al registrar los
            resultados.
          </p>
        ) : null}
        {query.saved === "evaluation" ? (
          <p className="save-ok">
            Evaluacion enviada. Revisa ahora los resultados y decide por alumno.
          </p>
        ) : null}
        {query.saved === "documents" ? (
          <p className="save-ok">
            Documentos pendientes generados. Consulta los enlaces de cada
            alumno.
          </p>
        ) : null}
        {query.saved === "item" ? (
          <p className="save-ok">Temario del examen actualizado.</p>
        ) : null}
        {query.saved === "curriculum" ? <p className="notice">Kamoku completado. Se conservan los puntos editados y desactivados. Embu queda al final con peso 3; las demás materias tienen peso 1.</p> : null}
        {query.saved === "examiner-link-disabled" ? <p className="notice">Enlace eliminado. Las valoraciones enviadas se conservan. Puedes generar un enlace nuevo para esta misma persona.</p> : null}
        {query.saved === "examiner-link-renewed" ? <p className="notice">Enlace nuevo generado. Copia el enlace actualizado; el anterior ya no permite evaluar. Se conservan las valoraciones enviadas.</p> : null}
        {query.saved === "finalized" ? (
          <p className="save-ok">
            Resultados registrados. Consulta los informes y el estado de
            documentos de cada alumno.
          </p>
        ) : null}
        {query.error ? (
          <p className="form-error">
            Ha ocurrido un error{query.detail ? `: ${query.detail}` : "."}
          </p>
        ) : null}

        {invitationResponses.length ? <>
          <section className="card"><h2>Datos del examen convocado</h2><p className="muted">Los emails enviados conservan su copia original. Comunica a las familias cualquier cambio de fecha.</p>{event.date_confirmed === false ? <p>{formatExamCallMonth(event.exam_date)} · día pendiente de confirmar.</p> : <form action={updateExamInvitationEventAction} className="invitation-form"><input type="hidden" name="eventId" value={eventId} /><label>Título<input name="title" defaultValue={event.title} required /></label><label>Fecha real del examen<input name="examDate" type="date" defaultValue={event.exam_date} required /></label><button type="submit">Guardar datos del examen</button></form>}<a className="text-link" href="/proximos-examenes#convocatorias-aprobadas">Confirmar día y revisar inscritos</a></section>
          <InvitationResponses invitations={invitationResponses} />
        </> : null}

        <section className="grid stats compact">
          <article className="card">
            <h2>Fecha</h2>
            <div className="metric">{event.date_confirmed === false ? `${formatExamCallMonth(event.exam_date)} · día pendiente` : event.exam_date}</div>
          </article>
          <article className="card">
            <h2>Tipo</h2>
            <div className="metric">
              {event.program_type === "kids_progressive" ? "Ninos" : "Adultos"}
            </div>
          </article>
          <article className="card">
            <h2>Temario</h2>
            <div className="metric">{scorableItems.length}</div>
          </article>
          <article className="card">
            <h2>Aprobado</h2>
            <div className="metric">{event.pass_percentage}%</div>
          </article>
        </section>

        {event.program_type === "adults" ||
        event.program_type === "dan_tribunal" ? (
          <section className="card">
            <h2>Grupos por grado objetivo</h2>
            <p>
              {gradeGroupMode
                ? "Grupos creados con los alumnos seleccionados."
                : "Alumnos agrupados por el grado al que se presentan."}{" "}
              Cada enlace de grado abre solo su grupo; el enlace personal de
              cada examinador incluye todos sus grados pendientes.
            </p>
            <div className="exam-adult-grade-cards">
              {adultTargetGrades.map((grade) => (
                <article className="exam-adult-grade-card" key={grade}>
                  <h3>{grade}</h3>
                  <ul>
                    {students
                      .filter((student) => student.target_grade === grade)
                      .map((student) => (
                        <li key={student.id}>
                          <StudentExamPhoto
                            src={driveImageUrl(student.members?.photo_url)}
                            name={student.members?.display_name ?? "Kenshi"}
                          />
                          <strong>{student.members?.display_name}</strong>
                        </li>
                      ))}
                  </ul>
                  <div className="form-actions">
                    {examiners
                      .filter(
                        (examiner) =>
                          !examiner.revoked_at &&
                          !examiner.access_token?.startsWith("disabled_") &&
                          (
                            examinerGradeScopes[examiner.id] ??
                            adultTargetGrades
                          ).includes(grade),
                      )
                      .map((examiner) => (
                        <div key={examiner.id}>
                          <a
                            className="secondary-link"
                            href={`${publicBaseUrl}/examinar/${examiner.access_token}?grade=${encodeURIComponent(grade)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {pendingExaminerIds.includes(examiner.id)
                              ? "Identificar al abrir"
                              : examiner.name}{" "}
                            · {grade}
                          </a>
                          {!pendingExaminerIds.includes(examiner.id) &&
                          !isCompleted ? (
                            <a
                              className="text-link"
                              href={`/examenes/${eventId}/evaluar?examiner=${examiner.id}&grade=${encodeURIComponent(grade)}`}
                            >
                              Evaluar este grado en el panel
                            </a>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
        {event.program_type === "adults" ||
        event.program_type === "dan_tribunal" ? (
          <ExamGradeAssignmentForm
            key={`${event.id}:${event.updated_at}`}
            eventId={eventId}
            examiners={examiners}
            grades={adultTargetGrades}
            scopes={examinerGradeScopes}
            pendingExaminerIds={pendingExaminerIds}
            locked={
              isCompleted ||
              hasSubmittedScores ||
              hasTeacherReview ||
              examiners.some((examiner) => Boolean(examiner.submitted_at))
            }
          />
        ) : null}
        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Enlaces para examinadores</h2>
              <p className="muted">
                Estos enlaces solo muestran el examen asignado. No abren el
                panel interno.
              </p>
              {isAdult ? <p>Varios examinadores pueden valorar el mismo grado. Se hace la media de sus notas en cada ejercicio y se aplican los pesos del temario. El profesor revisa y decide el resultado final. Eliminar o renovar un enlace conserva las valoraciones ya enviadas.</p> : null}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Examinador</th>
                  <th>Estado</th>
                  <th>Enlace</th>
                </tr>
              </thead>
              <tbody>
                {examiners
                  .filter((examiner) => !examiner.revoked_at)
                  .map((examiner) => {
                    const url = `${publicBaseUrl}/examinar/${examiner.access_token}`;
                    const linkDisabled = isAdult && examiner.access_token?.startsWith("disabled_");
                    return (
                      <tr key={examiner.id}>
                        <td data-label="Examinador">
                          <strong>
                            {pendingExaminerIds.includes(examiner.id)
                              ? "Identificar al abrir"
                              : examiner.name}
                          </strong>
                          {event.program_type === "adults" ||
                          event.program_type === "dan_tribunal" ? (
                            <p className="muted">
                              Grados:{" "}
                              {(
                                examinerGradeScopes[examiner.id] ??
                                adultTargetGrades
                              ).join(", ")}
                            </p>
                          ) : null}
                        </td>
                        <td data-label="Estado">
                          {linkDisabled ? <p className="state-badge">Enlace eliminado</p> : null}
                          {isExaminerComplete(examiner) ? (
                            <span className="state-badge state-completada">
                              Enviado
                            </span>
                          ) : (
                            <span className="state-badge">Pendiente</span>
                          )}
                        </td>
                        <td data-label="Enlace">
                          {!isCompleted &&
                          !linkDisabled &&
                          !examiner.revoked_at &&
                          !isExaminerComplete(examiner) ? (
                            <p>
                              <a
                                className="secondary-link"
                                href={`/examenes/${eventId}/evaluar?examiner=${examiner.id}`}
                              >
                                Examinar como {examiner.name}
                              </a>
                            </p>
                          ) : (
                            <p>
                              <a href="#revision">Revisar evaluaciones</a>
                            </p>
                          )}
                          {!linkDisabled ? <a
                            className="text-link"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {url}
                          </a> : <p className="muted">Genera un enlace nuevo para volver a abrir este acceso.</p>}
                          {isAdult && !isCompleted ? <form action={manageAdultExaminerLinkAction} className="form-actions" style={{flexWrap:"wrap"}}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="examinerId" value={examiner.id}/><button type="submit" name="operation" value="renew" style={{minHeight:44}}>Generar enlace nuevo</button>{!linkDisabled ? <button type="submit" name="operation" value="disable" className="secondary-link" style={{minHeight:44}}>Eliminar enlace</button> : null}</form> : null}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card exam-review" id="revision">
          <p className="eyebrow">
            1 Evaluar · 2 Revisar y decidir · 3 Registrar
          </p>
          <h2>Revision de cada alumno</h2>
          <p className="muted">
            Guardar una revision no actualiza grados. Confirma la decision de
            cada alumno antes del registro final.
          </p>
          {students.map((student) => {
            const summary = summaries.find(
              (row) => row.studentId === student.id,
            );
            if (!summary)
              return (
                <p key={student.id}>
                  Pendiente de evaluacion: {student.members?.display_name}
                </p>
              );
            const review = summary.review;
            const current = isReviewCurrent(review, summary);
            const originals = scores.filter(
              (score) => score.event_student_id === student.id,
            );
            return (
              <details className="exam-student-review" key={student.id}>
                <summary>
                  <strong>{student.members?.display_name ?? "Kenshi"}</strong>
                  <span>
                    {student.current_grade} → {student.target_grade}
                  </span>
                  <span>
                    {summary.percentage}% · {summary.scoredItems}/
                    {summary.totalItems} puntos
                  </span>
                  <span className="state-badge">
                    {isCompleted
                      ? review?.registeredAt
                        ? "Registrado"
                        : "Cerrado · consulta"
                      : !summary.complete
                        ? "Pendiente de evaluar"
                        : current && review?.decision
                          ? "Revisado"
                          : "Pendiente de revision"}
                  </span>
                </summary>
                {!current && review?.decision ? (
                  <p className="form-error">
                    La evaluacion ha cambiado. Revisa las notas y confirma de
                    nuevo la decision.
                  </p>
                ) : null}
                <p>
                  Original: {summary.basePercentage}% · Efectivo:{" "}
                  <strong>{summary.percentage}%</strong> · Umbral:{" "}
                  {event.pass_percentage}%
                </p>
                {originals.some((score) => {
                  const session = decodeScoreNotes(score.notes);
                  return session.stop || session.adjustments.length;
                }) ? (
                  <section className="exam-review-item">
                    <h3>Puntos extra, penalizaciones y finalizacion</h3>
                    <p>
                      Los movimientos se aplican al total acumulado. Con varios
                      examinadores se usa la media de sus ajustes.
                    </p>
                    <ul>
                      {originals.flatMap((score) => {
                        const session = decodeScoreNotes(score.notes);
                        const name =
                          examiners.find(
                            (examiner) => examiner.id === score.examiner_id,
                          )?.name ?? "Examinador";
                        return [
                          ...session.adjustments.map((movement, index) => (
                            <li
                              key={`${score.examiner_id}:${score.event_item_id}:point:${index}`}
                            >
                              {name}: {movement.delta > 0 ? "+" : ""}
                              {movement.delta} punto. {movement.reason}
                            </li>
                          )),
                          ...(session.stop
                            ? [
                                <li
                                  key={`${score.examiner_id}:${score.event_item_id}:stop`}
                                >
                                  {name}: examen terminado despues de{" "}
                                  {items.find(
                                    (item) =>
                                      item.id === session.stop!.afterItemId,
                                  )?.name ?? "la ultima actividad completada"}
                                  . Motivo: {session.stop.reason}. El temario
                                  posterior no realizado queda fuera del
                                  calculo.
                                </li>,
                              ]
                            : []),
                        ];
                      })}
                    </ul>
                  </section>
                ) : null}
                <form
                  action={saveIntegratedExamReviewAction}
                  className="exam-review-form"
                >
                  <input type="hidden" name="eventId" value={eventId} />
                  <input type="hidden" name="studentId" value={student.id} />
                  <input
                    type="hidden"
                    name="sourceSignature"
                    value={summary.sourceSignature}
                  />
                  <fieldset disabled={isCompleted}>
                    <legend>
                      Revision de {student.members?.display_name ?? "Kenshi"}
                    </legend>
                    {summary.items.map((item) => (
                      <article className="exam-review-item" key={item.id}>
                        <h3>{item.name}</h3>
                        <p className="muted">
                          {item.section ?? item.category} · {item.grade}
                        </p>
                        <ul>
                          {originals
                            .filter((score) => score.event_item_id === item.id)
                            .map((score) => (
                              <li key={score.examiner_id}>
                                <strong>
                                  {
                                    examiners.find(
                                      (examiner) =>
                                        examiner.id === score.examiner_id,
                                    )?.name
                                  }
                                </strong>
                                :{" "}
                                {decodeScoreNotes(score.notes).outsideRoute
                                  ? "No realizado"
                                  : score.skipped
                                    ? "No evaluado"
                                    : score.score}
                                {decodeScoreNotes(score.notes).text ? (
                                  <p>{decodeScoreNotes(score.notes).text}</p>
                                ) : null}
                              </li>
                            ))}
                        </ul>
                        <p>
                          Media original: {item.originalScore ?? "No evaluado"}{" "}
                          · Nota efectiva:{" "}
                          <strong>{item.score ?? "No evaluado"}</strong>
                          {item.adjusted ? " (ajustada)" : ""}
                        </p>
                        {item.score !== null &&
                        item.score < event.pass_percentage / 10 ? (
                          <p className="exam-weak-point">
                            Punto a reforzar segun la puntuacion recibida:{" "}
                            {item.name} ({item.score}/10).
                          </p>
                        ) : null}
                        <div className="form-grid">
                          <label>
                            Ajuste final (vacio restaura la media)
                            <input
                              name={`adjustment:${item.id}`}
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              defaultValue={
                                review?.adjustments[item.id]?.score ?? ""
                              }
                            />
                          </label>
                          <label>
                            Motivo u observaciones del ajuste
                            <textarea
                              name={`adjustmentNotes:${item.id}`}
                              rows={2}
                              defaultValue={
                                review?.adjustments[item.id]?.notes ?? ""
                              }
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                    <label>
                      Conclusion y aspectos a mejorar
                      <textarea
                        name="conclusion"
                        rows={4}
                        defaultValue={review?.conclusion ?? ""}
                      />
                    </label>
                    <p className="form-help">
                      Si la decision contradice el porcentaje automatico,
                      explica el motivo en la conclusion.
                    </p>
                    <label>
                      Decision final
                      <select
                        name="decision"
                        defaultValue={review?.decision ?? "pending"}
                      >
                        <option value="pending">Pendiente de revision</option>
                        <option value="pass">Aprobar</option>
                        <option value="fail">Suspender</option>
                      </select>
                    </label>
                    {!isCompleted ? (
                      <button type="submit">Guardar revision y decision</button>
                    ) : null}
                  </fieldset>
                </form>
                <div className="form-actions">
                  {student.members?.legacy_id ? (
                    <a href={`/kenshis/${student.members.legacy_id}`}>
                      Ficha e historial del alumno
                    </a>
                  ) : null}
                  {review?.reportUrl ? (
                    <a
                      href={review.reportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Informe
                    </a>
                  ) : null}
                  {review?.diplomaUrl ? (
                    <a
                      href={review.diplomaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Diploma
                    </a>
                  ) : null}
                </div>
                {review?.documentErrors?.length ? (
                  <div className="form-error">
                    <strong>Resultado registrado; documentos pendientes</strong>
                    <ul>
                      {review.documentErrors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                    <form action={retryIntegratedExamDocumentsAction}>
                      <input type="hidden" name="eventId" value={eventId} />
                      <input
                        type="hidden"
                        name="studentId"
                        value={student.id}
                      />
                      <button type="submit">
                        Reintentar documentos de este alumno
                      </button>
                    </form>
                  </div>
                ) : null}
              </details>
            );
          })}
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Cierre oficial</h2>
              <p className="muted">
                Al cerrar, los aprobados se registran como examenes reales del
                sistema nuevo, se actualiza su grado y se recalculan fichas,
                rankings y semaforos.
              </p>
            </div>
            <span
              className={
                isCompleted
                  ? "state-badge state-completada"
                  : "state-badge state-pendiente"
              }
            >
              {isCompleted ? "Cerrado" : "Pendiente"}
            </span>
          </div>
          <div className="grid stats compact">
            <article className="metric-panel">
              <h2>Evaluadores enviados</h2>
              <div className="metric">
                {submittedExaminers}/{examiners.length}
              </div>
            </article>
            <article className="metric-panel">
              <h2>Decisiones de aprobado</h2>
              <div className="metric">
                {passedSummaries}/{students.length}
              </div>
            </article>
          </div>
          <p>
            {passedSummaries} aprobados · {failedSummaries} suspensos ·{" "}
            {students.length - passedSummaries - failedSummaries} pendientes.
          </p>
          {documentFailures ? (
            <p className="form-error">
              Resultado registrado; hay documentos pendientes. Abre cada alumno
              para consultar el error y reintentar sus documentos.
            </p>
          ) : null}
          {isCompleted ? (
            <p className="muted">
              Registro cerrado. Consulta el estado de documentos de cada alumno.
            </p>
          ) : (
            <form
              action={finalizeIntegratedExamEventAction}
              className="form-actions"
            >
              <input type="hidden" name="eventId" value={event.id} />
              {!ready || !allSubmitted ? (
                <p className="form-help">
                  Completa las evaluaciones y confirma una decision actual para
                  cada alumno.
                </p>
              ) : null}
              <button type="submit" disabled={!ready || !allSubmitted}>
                Registrar resultados y actualizar fichas
              </button>
            </form>
          )}
        </section>

        {isAdult && !isCompleted && !hasSubmittedScores && !hasTeacherReview && !examiners.some(examiner => examiner.submitted_at) ? <section className="card"><h2>Programa completo del grado</h2><p>Los exámenes nuevos incluyen el Kamoku BSKF 2024. Para actualizar este examen, añade las materias que falten sin reactivar puntos desactivados. Embu se valora al final con peso 3; cada otra materia, con peso 1.</p><form action={completeAdultExamCurriculumAction}><input type="hidden" name="eventId" value={event.id}/><button type="submit">Completar con Kamoku</button></form></section> : null}
        <details className="card foldable-admin-section">
          <summary>
            <span>
              <strong>Configurar temario del examen</strong>
              <small>
                {scorableItems.filter((item) => item.active).length} activos de{" "}
                {scorableItems.length} puntos evaluables. Puedes quitar, editar
                o anadir puntos antes de evaluar.
              </small>
            </span>
          </summary>

          <form
            action={createIntegratedExamItemAction}
            className="exam-item-add-form"
          >
            <input type="hidden" name="eventId" value={event.id} />
            <h3>Anadir punto manual</h3>
            <div className="form-grid">
              <label>
                Nombre
                <input
                  name="name"
                  placeholder="Ej. Atar el cinturon, Embu, Howa..."
                  required
                />
              </label>
              <label>
                Grado objetivo que evalua este punto
                <input
                  name="grade"
                  placeholder={
                    event.program_type === "kids_progressive" ||
                    event.program_type === "kids"
                      ? "Ej. 5 KYU, 4 KYU..."
                      : "Ej. 3 KYU"
                  }
                />
              </label>
              <p className="form-help">
                En examenes infantiles progresivos, este grado indica hasta que
                objetivo continua el alumno. No es el grado actual.
              </p>
              <label>
                Seccion
                <input name="section" placeholder="Gakka, tecnica, kihon..." />
              </label>
              <label>
                Peso
                <input name="weight" inputMode="decimal" defaultValue="1" />
              </label>
            </div>
            <label>
              Resumen
              <textarea
                name="summary"
                rows={3}
                placeholder="Indicaciones para el examinador"
              />
            </label>
            <button type="submit" disabled={isCompleted}>
              Anadir al examen
            </button>
          </form>

          <div className="exam-item-editor-list">
            {items.map((item) => (
              <article
                className={
                  item.active ? "exam-item-editor" : "exam-item-editor inactive"
                }
                key={item.id}
              >
                <form action={updateIntegratedExamItemAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="exam-item-editor-head">
                    <label className="check-row">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={item.active}
                        disabled={isCompleted || item.source === "cut"}
                      />
                      <span>
                        {item.source === "cut"
                          ? "Corte progresivo"
                          : item.active
                            ? "Entra en examen"
                            : "Fuera del examen"}
                      </span>
                    </label>
                    <span className="state-badge">
                      {item.source === "cut" ? "Corte" : item.source}
                    </span>
                  </div>
                  <div className="form-grid">
                    <label>
                      Orden
                      <input
                        name="orderIndex"
                        inputMode="numeric"
                        defaultValue={item.order_index}
                        disabled={isCompleted}
                      />
                    </label>
                    <label>
                      {item.source === "cut"
                        ? "Corte para objetivo"
                        : "Grado objetivo"}
                      <input
                        name="grade"
                        defaultValue={item.grade ?? ""}
                        disabled={isCompleted || item.source === "cut"}
                      />
                    </label>
                    <label>
                      Seccion
                      <input
                        name="section"
                        defaultValue={item.section ?? item.category ?? ""}
                        disabled={isCompleted || item.source === "cut"}
                      />
                    </label>
                    <label>
                      Peso
                      <input
                        name="weight"
                        inputMode="decimal"
                        defaultValue={item.weight}
                        disabled={isCompleted || item.source === "cut"}
                      />
                    </label>
                  </div>
                  <label>
                    Item
                    <input
                      name="name"
                      defaultValue={item.name}
                      disabled={isCompleted || item.source === "cut"}
                    />
                  </label>
                  <label>
                    Resumen
                    <textarea
                      name="summary"
                      rows={3}
                      defaultValue={item.summary ?? ""}
                      disabled={isCompleted || item.source === "cut"}
                    />
                  </label>
                  <div className="form-actions">
                    <button
                      type="submit"
                      disabled={isCompleted || item.source === "cut"}
                    >
                      Guardar punto
                    </button>
                  </div>
                </form>
                {item.source !== "cut" && !isCompleted ? (
                  <form action={deleteIntegratedExamItemAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="danger-button" type="submit">
                      Eliminar punto
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </details>

        <section className="card">
          <h2>Siguiente paso</h2>
          <p className="muted">
            Despues del cierre, cada aprobado aparece en el historial normal de
            examenes con informe y diploma enlazados desde Google Drive.
          </p>
          <div className="form-actions">
            <a className="secondary-link" href="/examenes">
              Volver a examenes
            </a>
            <form action={deleteIntegratedExamEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <button
                className="danger-button"
                type="submit"
                disabled={isCompleted}
              >
                Eliminar examen integrado
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
