import { ArrowLeft, Check, LogOut, Wand2, X } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  closeAdultClassAction,
  addAttendanceAction,
  addBulkAttendanceAction,
  closeKidsClassAction,
  createClassDelegateLinkAction,
  deleteClassAction,
  generateAdultGroupsAction,
  generateAdultPlanAction,
  logoutAction,
  prepareAdultClassAction,
  updateClassAction,
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
  official_grade: string | null;
  trained_grade: string | null;
  members: { first_name: string; last_name: string | null; legacy_id: string | null; class: "kids" | "adults" } | null;
};

type MemberOption = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  grade: string | null;
};

type DelegateLinkRow = {
  token: string;
  expires_at: string;
  created_at: string;
};

export default async function ClaseDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
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

  const [{ data: plan }, { data: attendance }, { data: groups }, { data: classMembers }, { data: delegateLinks }] = await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,legacy_id,group_grade,target_grade,technique_name,category,proposal_type,focus,completed,notes,score_at_that_moment,techniques(repetitions,last_trained_on,score)")
      .eq("class_id", clase.id)
      .order("group_grade")
      .order("suggested_order")
      .returns<PlanRow[]>(),
    supabase
      .from("attendance_logs")
      .select("attended_on,member_id,official_grade,trained_grade,members(first_name,last_name,legacy_id,class)")
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
      .select("id,legacy_id,display_name,grade")
      .eq("class", clase.class_group)
      .eq("status", "active")
      .order("display_name")
      .returns<MemberOption[]>(),
    supabase
      .from("class_delegate_links")
      .select("token,expires_at,created_at")
      .eq("class_id", clase.id)
      .is("revoked_at", null)
      .is("closed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .returns<DelegateLinkRow[]>()
  ]);

  const attendanceMemberIds = new Set((attendance ?? []).map((item) => item.member_id));
  const pendingClassMembers = (classMembers ?? []).filter((member) => !attendanceMemberIds.has(member.id));
  const completedPlan = (plan ?? []).filter((item) => item.completed).length;
  const groupedPlan = groupPlanByGrade(plan ?? []);
  const hasGroups = Boolean((groups ?? []).length);
  const hasPlan = Boolean((plan ?? []).length);
  const readyToClose = clase.class_group === "adults" && clase.plan_generated && !clase.closed;
  const readyToCloseKids = clase.class_group === "kids" && !clase.closed;
  const delegateLink = delegateLinks?.[0] ?? null;
  const delegateUrl = delegateLink ? `https://skbc.vercel.app/delegado/${delegateLink.token}` : null;
  const attendanceQuickPanel = (
    <article className="card">
      <h2>Asistencia final</h2>
      {!clase.closed ? (
        <>
          <form action={addBulkAttendanceAction} className="quick-form">
            <input type="hidden" name="classId" value={clase.id} />
            <input type="hidden" name="legacyId" value={legacyId} />
            <div className="attendance-checklist">
              {pendingClassMembers.length ? pendingClassMembers.map((member) => (
                <label className="check-row" key={member.id}>
                  <input name="memberIds" type="checkbox" value={member.id} />
                  <span>
                    <strong>{member.display_name}</strong>
                    <small>{member.grade ?? "Sin grado"}</small>
                  </span>
                </label>
              )) : <p className="muted">Todos los kenshis activos de esta clase estan ya en asistencia.</p>}
            </div>
            <button type="submit" disabled={!pendingClassMembers.length}>Anadir seleccionados</button>
          </form>
          {clase.class_group === "adults" ? <details className="advanced-details">
            <summary>Anadir uno con grado entrenado manual</summary>
            <form action={addAttendanceAction} className="quick-form">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <label>
                Kenshi
                <select name="memberId" required>
                  <option value="">Seleccionar</option>
                  {pendingClassMembers.map((member) => (
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
          </details> : null}
        </>
      ) : (
        <p className="muted">Clase cerrada.</p>
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
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main class-detail-main">
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
                  {hasGroups && !hasPlan ? "Completar plan tecnico" : "Preparar clase"}
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && !hasGroups && !clase.plan_generated && !clase.closed ? (
              <form action={generateAdultGroupsAction}>
                <input type="hidden" name="classId" value={clase.id} />
                <input type="hidden" name="legacyId" value={legacyId} />
                <button className="primary-link secondary-link button-reset" type="submit">
                  <Wand2 aria-hidden="true" size={16} />
                  Generar grupos
                </button>
              </form>
            ) : null}
            {clase.class_group === "adults" && !hasPlan && !clase.plan_generated && !clase.closed ? (
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
            {readyToCloseKids ? (
              <form action={closeKidsClassAction}>
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
        {query.saved === "class-updated" ? <p className="save-ok">Clase actualizada.</p> : null}
        {query.saved === "class-prepared" ? <p className="save-ok">Clase creada con grupos y plan tecnico.</p> : null}
        {query.saved === "prepare" ? <p className="save-ok">Clase preparada: grupos y plan tecnico listos.</p> : null}
        {query.saved === "groups" ? <p className="save-ok">Grupos tecnicos generados.</p> : null}
        {query.saved === "attendance" ? <p className="save-ok">Asistencia anadida.</p> : null}
        {query.saved === "plan-technique" ? <p className="save-ok">Tecnica actualizada.</p> : null}
        {query.saved === "close" ? <p className="save-ok">Clase cerrada y registros tecnicos generados.</p> : null}
        {query.saved === "delegate" ? <p className="save-ok">Enlace de sustituto generado.</p> : null}
        {query.error === "plan" ? (
          <p className="form-error">No se ha podido generar el plan tecnico{query.detail ? `: ${query.detail}` : " para esta clase."}</p>
        ) : null}
        {query.error === "class" ? (
          <p className="form-error">No se ha podido actualizar la clase.</p>
        ) : null}
        {query.error === "delete" ? (
          <p className="form-error">No se ha podido eliminar la clase. Escribe ELIMINAR y vuelve a intentarlo.</p>
        ) : null}
        {query.error === "prepare" ? (
          <p className="form-error">No se ha podido preparar la clase{query.detail ? `: ${query.detail}` : "."}</p>
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
        {query.error === "delegate" ? (
          <p className="form-error">No se ha podido generar el enlace de sustituto.</p>
        ) : null}

        <section className="grid stats compact class-summary-strip" aria-label="Resumen">
          <article className="card"><h2>Fecha</h2><div className="metric small">{clase.class_date}</div></article>
          <article className="card"><h2>Tipo</h2><div className="metric small">{clase.class_type ?? "-"}</div></article>
          <article className="card"><h2>Estado</h2><div className="metric small">{clase.status}</div></article>
          <article className="card"><h2>Asistentes</h2><div className="metric">{attendance?.length ?? 0}</div></article>
        </section>

        <details className="card maintenance-panel">
          <summary>Editar o eliminar clase</summary>
          <div className="split-section">
            <article className="delegate-admin-box">
              <h2>Modo sustituto</h2>
              <p className="muted">
                Genera un enlace temporal. Al entrar, el sustituto solo podra iniciar esta clase, marcar lo realizado y enviarla.
              </p>
              {delegateUrl ? (
                <div className="copy-box">
                  <strong>Enlace activo</strong>
                  <a className="text-link" href={delegateUrl}>{delegateUrl}</a>
                  <small className="muted">Caduca: {new Date(delegateLink?.expires_at ?? "").toLocaleString("es-ES")}</small>
                </div>
              ) : null}
              {!clase.closed ? (
                <form action={createClassDelegateLinkAction} className="quick-form">
                  <input type="hidden" name="classId" value={clase.id} />
                  <input type="hidden" name="legacyId" value={legacyId} />
                  <label>
                    Duracion del enlace
                    <select name="hours" defaultValue="48">
                      <option value="12">12 horas</option>
                      <option value="24">24 horas</option>
                      <option value="48">48 horas</option>
                      <option value="72">72 horas</option>
                    </select>
                  </label>
                  <button type="submit">{delegateUrl ? "Generar otro enlace" : "Generar enlace sustituto"}</button>
                </form>
              ) : <p className="muted">La clase ya esta cerrada.</p>}
            </article>
            <form action={updateClassAction} className="edit-form">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <div className="form-grid">
                <label>Fecha<input name="classDate" type="date" defaultValue={clase.class_date} required /></label>
                <label>Nombre<input name="name" defaultValue={clase.name} required /></label>
                <label>
                  Tipo
                  <select name="classType" defaultValue={clase.class_type ?? "NORMAL"}>
                    <option value="NORMAL">Normal</option>
                    <option value="CONJUNTA">Conjunta</option>
                    <option value="REPASO">Repaso</option>
                    <option value="EXAMEN">Examen</option>
                  </select>
                </label>
                <label>Responsable<input name="responsible" defaultValue={clase.responsible ?? ""} /></label>
                <label>
                  Estado cierre
                  <select name="closed" defaultValue={clase.closed ? "true" : "false"}>
                    <option value="false">Abierta</option>
                    <option value="true">Cerrada</option>
                  </select>
                </label>
                <label className="wide">Notas<textarea name="notes" rows={3} defaultValue={clase.notes ?? ""} /></label>
              </div>
              <div className="form-actions">
                <button type="submit">Guardar cambios</button>
              </div>
            </form>
            <form action={deleteClassAction} className="edit-form danger-zone">
              <input type="hidden" name="classId" value={clase.id} />
              <input type="hidden" name="legacyId" value={legacyId} />
              <h2>Eliminar clase</h2>
              <p className="muted">Elimina esta clase del sistema nuevo junto con asistencia, plan, grupos e historiales tecnicos asociados.</p>
              <label>Confirmacion<input name="confirmText" placeholder="Escribe ELIMINAR" /></label>
              <div className="form-actions">
                <button type="submit">Eliminar clase</button>
              </div>
            </form>
          </div>
        </details>

        {clase.class_group === "adults" ? (
          <section className="class-stepper" aria-label="Flujo de clase">
            <span className={(groups ?? []).length ? "step done" : "step"}>1 Grupos</span>
            <span className={hasPlan ? "step done" : "step"}>2 Plan</span>
            <span className={completedPlan ? "step done" : "step"}>3 Tecnicas</span>
            <span className={(attendance ?? []).length ? "step done" : "step"}>4 Asistencia</span>
            <span className={clase.closed ? "step done" : "step"}>5 Cierre</span>
          </section>
        ) : (
          <section className="class-stepper" aria-label="Flujo de clase infantil">
            <span className={(attendance ?? []).length ? "step done" : "step"}>1 Asistencia</span>
            <span className="step done">2 Fichas</span>
            <span className={clase.closed ? "step done" : "step"}>3 Cierre</span>
          </section>
        )}

        {clase.class_group === "adults" ? <section className="split-section class-workbench">
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
        </section> : (
          <section className="card">
            <h2>Clase infantil</h2>
            <p className="muted">Esta sesion no usa plan tecnico. Registra asistencia y abre las fichas para revisar constancia, avisos y datos del alumno.</p>
          </section>
        )}

        {clase.class_group === "adults" ? (
          <>
            <div className="section-heading-row">
              <h2 className="section-title">Plan tecnico</h2>
              <span className="status">{completedPlan}/{(plan ?? []).length} realizadas</span>
            </div>
            <section className="plan-board mobile-plan-board">
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
          </>
        ) : null}

        <h2 className="section-title">{clase.class_group === "kids" ? "Asistencia infantil" : "Asistencia final"}</h2>
        <section className="card mobile-attendance-note">
          {clase.class_group === "adults" ? (
            <>
              <h2>Como se adjuntan las tecnicas</h2>
              <p className="muted">
                Puedes marcar primero todas las tecnicas realizadas. Al cerrar la clase, el sistema cruza esas tecnicas con
                la asistencia final y las adjunta al grado entrenado de cada asistente.
              </p>
            </>
          ) : (
            <>
              <h2>Registro infantil</h2>
              <p className="muted">La asistencia infantil actualiza la actividad del alumno y sirve para ranking, constancia y revision de fichas.</p>
            </>
          )}
        </section>

        <section className="mobile-work-anchor" id="asistencia">
          {attendanceQuickPanel}
        </section>

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

        {readyToCloseKids ? (
          <section className="mobile-close-bar" aria-label="Cerrar clase infantil">
            <div>
              <strong>{attendance?.length ?? 0}</strong>
              <span>asistentes</span>
            </div>
            <form action={closeKidsClassAction}>
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
              <tr><th>Kenshi</th><th>Grado oficial</th><th>Grado entrenado</th><th>Ficha</th></tr>
            </thead>
            <tbody>
              {(attendance ?? []).map((item) => (
                <tr key={`${item.members?.first_name}-${item.members?.last_name}-${item.trained_grade}`}>
                  <td data-label="Kenshi"><strong>{item.members?.first_name} {item.members?.last_name}</strong></td>
                  <td data-label="Grado oficial">{item.official_grade ?? "-"}</td>
                  <td data-label="Grado entrenado">{item.trained_grade ?? "-"}</td>
                  <td data-label="Ficha">{item.members?.legacy_id ? <a className="text-link" href={`/kenshis/${item.members.legacy_id}`}>Abrir ficha</a> : "-"}</td>
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
