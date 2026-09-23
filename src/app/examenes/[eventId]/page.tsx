import { LogOut } from "lucide-react";
import { createIntegratedExamItemAction, deleteIntegratedExamEventAction, deleteIntegratedExamItemAction, finalizeIntegratedExamEventAction, logoutAction, updateIntegratedExamItemAction } from "@/app/actions";
import { SidebarNav } from "@/app/components/SidebarNav";
import { hasInternalAccess } from "@/lib/auth";
import { getIntegratedExamAdmin } from "@/lib/integrated-exams";
import { redirect } from "next/navigation";

export default async function IntegratedExamPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ saved?: string; error?: string; detail?: string; registered?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const { eventId } = await params;
  const query = await searchParams;
  const { event, students, items, examiners, scores, summaries } = await getIntegratedExamAdmin(eventId);
  const publicBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://skbc.vercel.app";
  const scorableItems = items.filter((item) => item.source !== "cut");
  const isCompleted = event.status === "completed" || event.status === "archived";
  const submittedExaminers = examiners.filter((examiner) => examiner.submitted_at && !examiner.revoked_at).length;
  const passedSummaries = summaries.filter((summary) => summary.passed).length;

  return (
    <div className="shell">
      <SidebarNav current="/examenes" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Examen integrado</p>
            <h1>{event.title}</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {query.saved === "created" ? <p className="save-ok">Examen integrado creado. Copia los enlaces de examinador si los necesitas.</p> : null}
        {query.saved === "item" ? <p className="save-ok">Temario del examen actualizado.</p> : null}
        {query.saved === "finalized" ? <p className="save-ok">Examen cerrado. Aprobados registrados en fichas y documentos enviados a Drive: {query.registered ?? "0"}.</p> : null}
        {query.error ? <p className="form-error">Ha ocurrido un error{query.detail ? `: ${query.detail}` : "."}</p> : null}

        <section className="grid stats compact">
          <article className="card">
            <h2>Fecha</h2>
            <div className="metric">{event.exam_date}</div>
          </article>
          <article className="card">
            <h2>Tipo</h2>
            <div className="metric">{event.program_type === "kids_progressive" ? "Ninos" : "Adultos"}</div>
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

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Enlaces para examinadores</h2>
              <p className="muted">Estos enlaces solo muestran el examen asignado. No abren el panel interno.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Examinador</th><th>Estado</th><th>Enlace</th></tr>
              </thead>
              <tbody>
                {examiners.map((examiner) => {
                  const url = `${publicBaseUrl}/examinar/${examiner.access_token}`;
                  return (
                    <tr key={examiner.id}>
                      <td data-label="Examinador"><strong>{examiner.name}</strong></td>
                      <td data-label="Estado">{examiner.submitted_at ? <span className="state-badge state-completada">Enviado</span> : <span className="state-badge">Pendiente</span>}</td>
                      <td data-label="Enlace"><a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{url}</a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Resultados provisionales</h2>
              <p className="muted">
                Se recalcula con las puntuaciones enviadas por los examinadores. En adultos cada kenshi cuenta solo su grado objetivo; en ninos progresivo cuenta hasta su corte.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Kenshi</th><th>Grado actual</th><th>Objetivo</th><th>Items puntuados</th><th>Resultado</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const summary = summaries.find((item) => item.studentId === student.id);
                  return (
                    <tr key={student.id}>
                      <td data-label="Kenshi"><strong>{student.members?.display_name ?? "-"}</strong></td>
                      <td data-label="Actual">{student.current_grade ?? "-"}</td>
                      <td data-label="Objetivo">{student.target_grade ?? "-"}</td>
                      <td data-label="Items">{summary?.scoredItems ?? 0}/{(summary?.totalItems ?? scorableItems.length) * Math.max(examiners.length, 1)}</td>
                      <td data-label="Resultado">{summary?.percentage ?? 0}%</td>
                      <td data-label="Estado">{summary?.passed ? <span className="state-badge state-completada">Aprobado provisional</span> : <span className="state-badge state-pendiente">Revisar</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Cierre oficial</h2>
              <p className="muted">
                Al cerrar, los aprobados se registran como examenes reales del sistema nuevo, se actualiza su grado y se recalculan fichas, rankings y semaforos.
              </p>
            </div>
            <span className={isCompleted ? "state-badge state-completada" : "state-badge state-pendiente"}>
              {isCompleted ? "Cerrado" : "Pendiente"}
            </span>
          </div>
          <div className="grid stats compact">
            <article className="metric-panel">
              <h2>Evaluadores enviados</h2>
              <div className="metric">{submittedExaminers}/{examiners.length}</div>
            </article>
            <article className="metric-panel">
              <h2>Aprobados provisionales</h2>
              <div className="metric">{passedSummaries}/{students.length}</div>
            </article>
          </div>
          {isCompleted ? (
            <p className="muted">Este examen ya esta cerrado. Los informes y diplomas quedan guardados en Google Drive y enlazados en el historial de examenes.</p>
          ) : (
            <form action={finalizeIntegratedExamEventAction} className="form-actions">
              <input type="hidden" name="eventId" value={event.id} />
              <button type="submit" disabled={!submittedExaminers}>Cerrar examen y registrar aprobados</button>
            </form>
          )}
        </section>

        <details className="card foldable-admin-section">
          <summary>
            <span>
              <strong>Configurar temario del examen</strong>
              <small>{scorableItems.filter((item) => item.active).length} activos de {scorableItems.length} puntos evaluables. Puedes quitar, editar o anadir puntos antes de evaluar.</small>
            </span>
          </summary>

          <form action={createIntegratedExamItemAction} className="exam-item-add-form">
            <input type="hidden" name="eventId" value={event.id} />
            <h3>Anadir punto manual</h3>
            <div className="form-grid">
              <label>Nombre<input name="name" placeholder="Ej. Atar el cinturon, Embu, Howa..." required /></label>
              <label>
                Grado objetivo que evalua este punto
                <input name="grade" placeholder={event.program_type === "kids_progressive" || event.program_type === "kids" ? "Ej. 5 KYU, 4 KYU..." : "Ej. 3 KYU"} />
              </label>
              <p className="form-help">
                En examenes infantiles progresivos, este grado indica hasta que objetivo continua el alumno. No es el grado actual.
              </p>
              <label>Seccion<input name="section" placeholder="Gakka, tecnica, kihon..." /></label>
              <label>Peso<input name="weight" inputMode="decimal" defaultValue="1" /></label>
            </div>
            <label>Resumen<textarea name="summary" rows={3} placeholder="Indicaciones para el examinador" /></label>
            <button type="submit">Anadir al examen</button>
          </form>

          <div className="exam-item-editor-list">
            {items.map((item) => (
              <article className={item.active ? "exam-item-editor" : "exam-item-editor inactive"} key={item.id}>
                <form action={updateIntegratedExamItemAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="exam-item-editor-head">
                    <label className="check-row">
                      <input name="active" type="checkbox" defaultChecked={item.active} disabled={isCompleted || item.source === "cut"} />
                      <span>{item.source === "cut" ? "Corte progresivo" : item.active ? "Entra en examen" : "Fuera del examen"}</span>
                    </label>
                    <span className="state-badge">{item.source === "cut" ? "Corte" : item.source}</span>
                  </div>
                  <div className="form-grid">
                    <label>Orden<input name="orderIndex" inputMode="numeric" defaultValue={item.order_index} disabled={isCompleted} /></label>
                    <label>{item.source === "cut" ? "Corte para objetivo" : "Grado objetivo"}<input name="grade" defaultValue={item.grade ?? ""} disabled={isCompleted || item.source === "cut"} /></label>
                    <label>Seccion<input name="section" defaultValue={item.section ?? item.category ?? ""} disabled={isCompleted || item.source === "cut"} /></label>
                    <label>Peso<input name="weight" inputMode="decimal" defaultValue={item.weight} disabled={isCompleted || item.source === "cut"} /></label>
                  </div>
                  <label>Item<input name="name" defaultValue={item.name} disabled={isCompleted || item.source === "cut"} /></label>
                  <label>Resumen<textarea name="summary" rows={3} defaultValue={item.summary ?? ""} disabled={isCompleted || item.source === "cut"} /></label>
                  <div className="form-actions">
                    <button type="submit" disabled={isCompleted || item.source === "cut"}>Guardar punto</button>
                  </div>
                </form>
                {item.source !== "cut" && !isCompleted ? (
                  <form action={deleteIntegratedExamItemAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="danger-button" type="submit">Eliminar punto</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </details>

        <section className="card">
          <h2>Siguiente paso</h2>
          <p className="muted">
            Despues del cierre, cada aprobado aparece en el historial normal de examenes con informe y diploma enlazados desde Google Drive.
          </p>
          <div className="form-actions">
            <a className="secondary-link" href="/examenes">Volver a examenes</a>
            <form action={deleteIntegratedExamEventAction}>
              <input type="hidden" name="eventId" value={event.id} />
              <button className="danger-button" type="submit">Eliminar examen integrado</button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
