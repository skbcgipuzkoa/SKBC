import { ArrowLeft, Check, LogOut, Wand2, X } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  closeAdultClassAction,
  addAttendanceAction,
  addBulkAttendanceAction,
  generateAdultGroupsAction,
  generateAdultPlanAction,
  logoutAction,
  prepareAdultClassAction,
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
  score_at_that_moment: number | null;
  techniques: {
    repetitions: number | null;
    last_trained_on: string | null;
    score: number | null;
  } | null;
};

type GroupRow = {
  id: string;
  legacy_id: string | null;
  grade: string;
  active: boolean;
};

type AttendanceRow = {
  attended_on: string;
  member_id: string;
  members: { first_name: string; last_name: string | null } | null;
  official_grade: string | null;
  trained_grade: string | null;
};

type MemberOption = {
  id: string;
  display_name: string;
  grade: string | null;
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

  const [{ data: plan }, { data: attendance }, { data: groups }, { data: adultMembers }] = await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,legacy_id,group_grade,target_grade,technique_name,category,proposal_type,focus,completed,notes,score_at_that_moment,techniques(repetitions,last_trained_on,score)")
      .eq("class_id", clase.id)
      .order("group_grade")
      .order("suggested_order")
      .returns<PlanRow[]>(),
    supabase
      .from("attendance_logs")
      .select("attended_on,member_id,official_grade,trained_grade,members(first_name,last_name)")
      .eq("class_id", clase.id)
      .order("attended_on", { ascending: false })
      .returns<AttendanceRow[]>(),
    supabase
      .from("class_technical_groups")
      .select("id,legacy_id,grade,active")
      .eq("class_id", clase.id)
      .order("grade")
      .returns<GroupRow[]>(),
    supabase
      .from("members")
      .select("id,display_name,grade")
      .eq("class", "adults")
      .eq("status", "active")
      .order("display_name")
      .returns<MemberOption[]>()
  ]);

  const attendanceMemberIds = new Set((attendance ?? []).map((item) => item.member_id));
  const pendingAdultMembers = (adultMembers ?? []).filter((member) => !attendanceMemberIds.has(member.id));
  const completedPlan = (plan ?? []).filter((item) => item.completed).length;
  const groupedPlan = groupPlanByGrade(plan ?? []);
  const readyToClose = clase.class_group === "adults" && clase.plan_generated && !clase.closed;
  const attendanceQuickPanel = (
    <article className="card">
      <h2>Asistencia final</h2>
      {!clase.closed && clase.class_group === "adults" ? (
        <>
          <form action={addBulkAttendanceAction} className="quick-form">
            <input type="hidden" name="classId" value={clase.id} />
            <input type="hidden" name="legacyId" value={legacyId} />
            <div className="attendance-checklist">
              {pendingAdultMembers.length ? pendingAdultMembers.map((member) => (
                <label className="check-row" key={member.id}>
                  <input name="memberIds" type="checkbox" value={member.id} />
                  <span>
                    <strong>{member.display_name}</strong>
                    <small>{member.grade ?? "Sin grado"}</small>
                  </span>
                </label>
              )) : <p className="muted">Todos los adultos activos estan ya en asistencia.</p>}
            </div>
            <button type="submit" disabled={!pendingAdultMembers.length}>Anadir seleccionados</button>
          </form>
          <details className="advanced-details">
            <summary>Anadir uno con grado entrenado manual</summary>
            <form action={addAttendanceAction} className="quick-form">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <label>
                Kenshi
                <select name="memberId" required>
                  <option value="">Seleccionar</option>
                  {pendingAdultMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.display_name} - {member.grade ?? "Sin grado"}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Grado oficial
                <select name="officialGrade">
                  <option value="">Usar ficha</option>
                  {(groups ?? []).map((group) => <option key={group.id} value={group.grade}>{group.grade}</option>)}
                </select>
              </label>
              <label>
                Grado entrenado
                <select name="trainedGrade">
                  <option value="">Automatico</option>
                  {(groups ?? []).map((group) => <option key={group.id} value={group.grade}>{group.grade}</option>)}
                </select>
              </label>
              <button type="submit">Anadir uno</button>
            </form>
          </details>
        </>
      ) : (
        <p className="muted">Clase cerrada o no adulta.</p>
      )}
    </article>
  );

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
          <a href="/examenes">Examenes</a>
          <a href="/auditoria">Auditoria</a>
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
              <form action={prepareAdultClassAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  Preparar clase
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && !clase.plan_generated && !clase.closed ? (
              <form action={generateAdultGroupsAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link secondary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  Generar grupos
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && !clase.plan_generated && !clase.closed ? (
              <form action={generateAdultPlanAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link secondary-link button-reset" type="submit">
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
        {query.saved === "class" ? <p className="save-ok">Clase creada.</p> : null}
        {query.saved === "prepare" ? <p className="save-ok">Clase preparada: grupos y plan tecnico listos.</p> : null}
        {query.saved === "groups" ? <p className="save-ok">Grupos tecnicos generados.</p> : null}
        {query.saved === "attendance" ? <p className="save-ok">Asistencia anadida.</p> : null}
        {query.saved === "plan-technique" ? <p className="save-ok">Tecnica actualizada.</p> : null}
        {query.saved === "close" ? <p className="save-ok">Clase cerrada y registros tecnicos generados.</p> : null}
        {query.error === "plan" ? (
          <p className="form-error">No se ha podido generar el plan tecnico para esta clase.</p>
        ) : null}
        {query.error === "prepare" ? (
          <p className="form-error">No se ha podido preparar la clase.</p>
        ) : null}
        {query.error === "groups" ? (
          <p className="form-error">No se han podido generar los grupos tecnicos.</p>
        ) : null}
        {query.error === "attendance" ? (
          <p className="form-error">No se ha podido anadir la asistencia.</p>
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

        <section className="class-stepper" aria-label="Flujo de clase">
          <span className={(groups ?? []).length ? "step done" : "step"}>1 Grupos</span>
          <span className={clase.plan_generated ? "step done" : "step"}>2 Plan</span>
          <span className={completedPlan ? "step done" : "step"}>3 Tecnicas</span>
          <span className={(attendance ?? []).length ? "step done" : "step"}>4 Asistencia</span>
          <span className={clase.closed ? "step done" : "step"}>5 Cierre</span>
        </section>

        <section className="split-section class-workbench">
          <article className="card">
            <h2>Grupos tecnicos</h2>
            <div className="chip-list">
              {(groups ?? []).length ? (groups ?? []).map((group) => (
                <span className="tag" key={group.id}>{group.grade}</span>
              )) : <span className="muted">Sin grupos todavia</span>}
            </div>
          </article>
          <article className="card">
            <h2>Orden de trabajo</h2>
            <p className="muted">
              Marca primero las tecnicas realizadas. Al final anade asistencia y cierra la clase para adjuntar el
              trabajo al grado entrenado de cada kenshi.
            </p>
          </article>
        </section>

        <div className="section-heading-row">
          <h2 className="section-title">Plan tecnico</h2>
          <span className="status">{completedPlan}/{(plan ?? []).length} realizadas</span>
        </div>
        <section className="plan-board">
          {groupedPlan.length ? groupedPlan.map(([grade, items]) => {
            const groupCompleted = items.filter((item) => item.completed).length;
            return (
              <article className="card plan-group" key={grade}>
                <div className="plan-group-head">
                  <div>
                    <span className="tag">{grade}</span>
                    <h2>{items[0]?.target_grade ? `Objetivo ${items[0].target_grade}` : "Grupo tecnico"}</h2>
                  </div>
                  <strong>{groupCompleted}/{items.length}</strong>
                </div>
                <div className="plan-card-list">
                  {items.map((item) => (
                    <div className={item.completed ? "plan-card completed" : "plan-card"} key={item.id}>
                      <div>
                        <strong>{item.technique_name}</strong>
                        <span>{item.category ?? "-"} - {item.proposal_type ?? item.focus ?? "-"}</span>
                        <small className="plan-reason">
                          Rep: {item.techniques?.repetitions ?? 0} - Ultima: {item.techniques?.last_trained_on ?? "nunca"} - Score: {item.techniques?.score ?? item.score_at_that_moment ?? 0}
                        </small>
                      </div>
                      {clase.closed ? (
                        <span className={item.completed ? "mini-action selected" : "mini-action"}>
                          {item.completed ? "Si" : "No"}
                        </span>
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
                            {item.completed ? "Hecha" : "Marcar"}
                          </button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          }) : (
            <article className="card">
              <h2>Sin plan tecnico</h2>
              <p className="muted">Pulsa Preparar clase para crear grupos y plan tecnico adulto.</p>
          </article>
        )}
        </section>

        <h2 className="section-title">Asistencia final</h2>
        <section className="card mobile-attendance-note">
          <h2>Como se adjuntan las tecnicas</h2>
          <p className="muted">
            Puedes marcar primero todas las tecnicas realizadas. Al cerrar la clase, el sistema cruza esas tecnicas con
            la asistencia final y las adjunta al grado entrenado de cada asistente.
          </p>
        </section>

        {attendanceQuickPanel}

        {readyToClose ? (
          <section className="mobile-close-bar" aria-label="Cerrar clase">
            <div>
              <strong>{completedPlan}/{(plan ?? []).length}</strong>
              <span>tecnicas realizadas</span>
            </div>
            <form action={closeAdultClassAction}>
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <button className="primary-link button-reset" type="submit">
                <Check aria-hidden="true" size={16} />
                Cerrar clase
              </button>
            </form>
          </section>
        ) : null}

        <h2 className="section-title">Asistencia</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Kenshi</th><th>Grado oficial</th><th>Grado entrenado</th></tr>
            </thead>
            <tbody>
              {(attendance ?? []).map((item) => (
                <tr key={`${item.members?.first_name}-${item.members?.last_name}-${item.trained_grade}`}>
                  <td data-label="Kenshi"><strong>{item.members?.first_name} {item.members?.last_name}</strong></td>
                  <td data-label="Grado oficial">{item.official_grade ?? "-"}</td>
                  <td data-label="Grado entrenado">{item.trained_grade ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function groupPlanByGrade(plan: PlanRow[]) {
  const groups = new Map<string, PlanRow[]>();
  plan.forEach((item) => {
    const key = item.group_grade ?? "Sin grupo";
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  });
  return [...groups.entries()];
}
