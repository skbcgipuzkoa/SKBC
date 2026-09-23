import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions";
import { SidebarNav } from "@/app/components/SidebarNav";
import { hasInternalAccess } from "@/lib/auth";
import { getIntegratedExamAdmin } from "@/lib/integrated-exams";
import { redirect } from "next/navigation";

export default async function IntegratedExamPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const { eventId } = await params;
  const query = await searchParams;
  const { event, students, items, examiners, scores, summaries } = await getIntegratedExamAdmin(eventId);
  const publicBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://skbc.vercel.app";
  const scorableItems = items.filter((item) => item.source !== "cut");

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
              <p className="muted">Se recalcula con las puntuaciones enviadas por los examinadores.</p>
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

        <details className="card foldable-admin-section">
          <summary>
            <span>
              <strong>Temario del examen</strong>
              <small>{items.length} lineas, incluidos cortes progresivos si existen</small>
            </span>
          </summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>#</th><th>Grado</th><th>Seccion</th><th>Item</th><th>Resumen</th></tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="#">{item.order_index}</td>
                    <td data-label="Grado">{item.grade ?? "-"}</td>
                    <td data-label="Seccion">{item.section ?? item.category ?? "-"}</td>
                    <td data-label="Item"><strong>{item.name}</strong>{item.source === "cut" ? <span className="state-badge">Corte</span> : null}</td>
                    <td data-label="Resumen">{item.summary ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <section className="card">
          <h2>Siguiente paso</h2>
          <p className="muted">
            Esta es la primera capa integrada: creacion, enlaces, evaluacion y calculo provisional. La fase siguiente sera convertir aprobados revisados en examenes reales con informe y diploma.
          </p>
          <a className="secondary-link" href="/examenes">Volver a examenes</a>
        </section>
      </main>
    </div>
  );
}
