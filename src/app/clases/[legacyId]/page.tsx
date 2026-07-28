import { ArrowLeft, Check, LogOut, Wand2, X } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  closeAdultClassAction,
  generateAdultPlanAction,
  logoutAction,
  updatePlanTechniqueAction
} from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  class_type: string | null;
  responsible: string | null;
  status: string;
  plan_generated: boolean;
  closed: boolean;
  notes: string | null;
};

type PlanRow = {
  id: string;
  legacy_id: string | null;
  group_grade: string | null;
  target_grade: string | null;
  technique_name: string;
  category: string | null;
  proposal_type: string | null;
  focus: string | null;
  completed: boolean;
  notes: string | null;
};

type AttendanceRow = {
  attended_on: string;
  members: { first_name: string; last_name: string | null } | null;
  official_grade: string | null;
  trained_grade: string | null;
};

export default async function ClaseDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const [{ legacyId }, query] = await Promise.all([params, searchParams]);
  const supabase = createAdminClient();

  const { data: clase, error } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,class_type,responsible,status,plan_generated,closed,notes")
    .eq("legacy_id", legacyId)
    .single<ClassRow>();

  if (error || !clase) notFound();

  const [{ data: plan }, { data: attendance }] = await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,legacy_id,group_grade,target_grade,technique_name,category,proposal_type,focus,completed,notes")
      .eq("class_id", clase.id)
      .order("group_grade")
      .order("suggested_order")
      .returns<PlanRow[]>(),
    supabase
      .from("attendance_logs")
      .select("attended_on,official_grade,trained_grade,members(first_name,last_name)")
      .eq("class_id", clase.id)
      .order("attended_on", { ascending: false })
      .returns<AttendanceRow[]>()
  ]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases" aria-current="page">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/clases"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>{clase.name}</h1>
          </div>
          <div className="top-actions">
            {clase.class_group === "adults" && !clase.plan_generated && !clase.closed ? (
              <form action={generateAdultPlanAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  Generar plan tecnico
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && clase.plan_generated && !clase.closed ? (
              <form action={closeAdultClassAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Check aria-hidden="true" size={16} />
                  Cerrar clase
                </button>
              </form>
            ) : null}
            <form action={logoutAction}>
              <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
                <LogOut aria-hidden="true" size={18} />
              </button>
            </form>
          </div>
        </div>

        {query.saved === "plan" ? <p className="save-ok">Plan tecnico generado.</p> : null}
        {query.saved === "plan-technique" ? <p className="save-ok">Tecnica actualizada.</p> : null}
        {query.saved === "close" ? <p className="save-ok">Clase cerrada y registros tecnicos generados.</p> : null}
        {query.error === "plan" ? (
          <p className="form-error">No se ha podido generar el plan tecnico para esta clase.</p>
        ) : null}
        {query.error === "plan-technique" ? (
          <p className="form-error">No se ha podido actualizar la tecnica.</p>
        ) : null}
        {query.error === "close" ? (
          <p className="form-error">No se ha podido cerrar la clase.</p>
        ) : null}

        <section className="grid stats compact" aria-label="Resumen">
          <article className="card"><h2>Fecha</h2><div className="metric small">{clase.class_date}</div></article>
          <article className="card"><h2>Tipo</h2><div className="metric small">{clase.class_type ?? "-"}</div></article>
          <article className="card"><h2>Estado</h2><div className="metric small">{clase.status}</div></article>
          <article className="card"><h2>Asistentes</h2><div className="metric">{attendance?.length ?? 0}</div></article>
        </section>

        <h2 className="section-title">Plan tecnico</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Grupo</th><th>Objetivo</th><th>Tecnica</th><th>Categoria</th><th>Tipo</th><th>Realizada</th></tr>
            </thead>
            <tbody>
              {(plan ?? []).length ? (plan ?? []).map((item) => (
                <tr key={item.legacy_id ?? item.technique_name}>
                  <td>{item.group_grade ?? "-"}</td>
                  <td>{item.target_grade ?? "-"}</td>
                  <td><strong>{item.technique_name}</strong></td>
                  <td>{item.category ?? "-"}</td>
                  <td>{item.proposal_type ?? item.focus ?? "-"}</td>
                  <td>
                    {clase.closed ? (
                      item.completed ? "Si" : "No"
                    ) : (
                      <form action={updatePlanTechniqueAction}>
                        <input type="hidden" name="planId" value={item.id} />
                        <input type="hidden" name="legacyId" value={legacyId} />
                        <input type="hidden" name="completed" value={item.completed ? "false" : "true"} />
                        <button
                          className={item.completed ? "mini-action selected" : "mini-action"}
                          type="submit"
                          title={item.completed ? "Marcar como no realizada" : "Marcar como realizada"}
                          aria-label={item.completed ? "Marcar como no realizada" : "Marcar como realizada"}
                        >
                          {item.completed ? <Check aria-hidden="true" size={15} /> : <X aria-hidden="true" size={15} />}
                          {item.completed ? "Si" : "No"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="muted">Esta clase todavia no tiene plan tecnico.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <h2 className="section-title">Asistencia</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Kenshi</th><th>Grado oficial</th><th>Grado entrenado</th></tr>
            </thead>
            <tbody>
              {(attendance ?? []).map((item) => (
                <tr key={`${item.members?.first_name}-${item.members?.last_name}-${item.trained_grade}`}>
                  <td><strong>{item.members?.first_name} {item.members?.last_name}</strong></td>
                  <td>{item.official_grade ?? "-"}</td>
                  <td>{item.trained_grade ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
