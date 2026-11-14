import { ProvisionalAttendanceForm } from "@/components/provisional-attendance-form";
import { ClassVisitorForm } from "@/components/class-visitor-form";
import { PortalBackLink } from "@/app/portal/back-link";
import { randomBytes } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { requireDojo } from "@/lib/dojo-access";
import { normalizeGrade } from "@/lib/adult-groups";
import { ClassSectionNav } from "@/components/class-section-nav";
import { DojoSubmitButton } from "@/app/dojo/DojoSubmitButton";
import { ManualTechniqueForm } from "@/app/clases/[legacyId]/ManualTechniqueForm";
import { addPortalManualTechnique } from "@/app/actions";
import { recalculateMemberExamStatus } from "@/lib/member-exam-status";

async function maintainClass(slug: string, id: string, remove: boolean, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const list = `/portal/${dojo.slug}/clases`;
  const back = `${list}/${id}`;
  const field = (key: string) => String(form.get(key) ?? "").trim();
  const name = field("name");
  const date = field("date");
  const type = field("type");
  if (remove ? field("confirm").toUpperCase() !== "ELIMINAR" :
    !name || name.length > 100 || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !["NORMAL", "CONJUNTA", "REPASO", "EXAMEN"].includes(type)) {
    redirect(back + "?error=mantenimiento#mantenimiento");
  }
  const { data, error } = await db.rpc("maintain_dojo_class", {
    p_slug: dojo.slug, p_id: id, p_delete: remove, p_date: remove ? null : date,
    p_name: name, p_type: type, p_responsible: field("responsible") || null, p_notes: field("notes") || null
  });
  if (error) {
    console.error("Error maintaining dojo class", error);
    redirect(back + "?error=mantenimiento#mantenimiento");
  }
  const attendees: string[] = Array.isArray(data) ? data : [];
  const results = await Promise.allSettled(attendees.map((memberId) => recalculateMemberExamStatus(memberId)));
  const warning = results.some((result) => result.status === "rejected") ? "&warning=exam" : "";
  redirect(remove ? list + "?saved=deleted" + warning : back + "?saved=updated" + warning);
}

async function selectTechniques(slug: string, id: string, form: FormData) {
  "use server";
  const { db } = await requireDojo(slug, true);
  const { data } = await db.from("classes").select("id").eq("id", id)
    .eq("dojo_slug", slug).eq("closed", false).eq("status", "pending").maybeSingle();
  if (!data || slug === "gainberri") notFound();
  const { data: plan, error } = await db.from("technical_plans").select("id,completed").eq("class_id", id);
  const path = `/portal/${slug}/clases/${id}`;
  if (error) redirect(path + "?modo=plan&error=plan");
  const selected = new Set(form.getAll("worked").map(String));
  for (const completed of [false, true]) {
    const ids = plan.filter((row) => row.completed !== completed && selected.has(row.id) === completed).map((row) => row.id);
    if (!ids.length) continue;
    const { error: updateError } = await db.from("technical_plans").update({ completed }).eq("class_id", id).in("id", ids);
    if (updateError) redirect(path + "?modo=plan&error=plan");
  }
  redirect(path + "?modo=asistencia");
}

async function save(slug: string, id: string, guided: boolean, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("save_dojo_attendance", {
    p_slug: dojo.slug, p_class: id, p_members: form.getAll("member").map(String)
  });
  redirect(`/portal/${dojo.slug}/clases/${id}${guided ? (error ? "?modo=asistencia&error=1" : "?modo=cierre") : error ? "?error=1" : ""}`);
}

async function preparePlan(slug: string, id: string, guided: boolean) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { data } = await db.from("classes").select("id")
    .eq("id", id).eq("dojo_slug", dojo.slug).eq("class_group", "adults")
    .eq("status", "pending").eq("closed", false).maybeSingle();
  if (!data || dojo.slug === "gainberri") notFound();
  let failed = false;
  try {
    const { error } = await db.rpc("prepare_dojo_plan_groups", { p_slug: dojo.slug, p_class: id });
    if (error) throw error;
    await generateAdultTechnicalPlan(id);
  } catch {
    failed = true;
  }
  redirect(`/portal/${dojo.slug}/clases/${id}${guided ? "?modo=plan" + (failed ? "&error=plan" : "") : failed ? "?error=plan" : ""}`);
}

async function finishClass(slug: string, id: string, guided: boolean, form: FormData) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { error } = await db.rpc("finish_dojo_class", {
    p_slug: dojo.slug, p_class: id, p_worked: form.getAll("worked").map(String)
  });
  redirect(`/portal/${dojo.slug}/clases/${id}${guided ? "?modo=cierre" + (error ? "&error=cierre" : "") : error ? "?error=cierre" : ""}`);
}

async function createSubstituteLink(slug: string, id: string) {
  "use server";
  const { db, dojo } = await requireDojo(slug, true);
  const { data } = await db.from("classes").select("id").eq("id", id)
    .eq("dojo_slug", dojo.slug).eq("closed", false).eq("status", "pending").maybeSingle();
  if (!data || slug === "gainberri") notFound();
  const token = randomBytes(32).toString("hex");
  const { error } = await db.from("class_delegate_links").insert({
    class_id: id, token, expires_at: new Date(Date.now() + 86_400_000).toISOString(), created_by: "dojo_portal"
  });
  redirect(`/portal/${slug}/clases/${id}${error ? "?error=sustituto" : ""}`);
}

export default async function SessionPage({ params, searchParams }: {
  params: Promise<{ dojo: string; id: string }>;
  searchParams: Promise<{ error?: string; modo?: string; saved?: string; warning?: string }>;
}) {
  const { error: formError, modo, saved, warning } = await searchParams;
  const fromMode = modo === "plan" || modo === "asistencia" || modo === "cierre";
  const { dojo: slug, id } = await params;
  const { db, dojo } = await requireDojo(slug);
  const { data: session, error } = await db.from("classes")
    .select("name,class_date,class_group,closed,status,plan_generated,class_type,responsible,notes")
    .eq("dojo_slug", dojo.slug).eq("id", id).maybeSingle();
  if (error || !session) notFound();
  const [roster, attendance] = await Promise.all([
    db.rpc("dojo_class_roster", { p_slug: slug, p_class: id }).overrideTypes<{ member_id: string; display_name: string; visit_id: string | null }[], { merge: false }>(),
    db.from("attendance_logs").select("member_id").eq("class_id", id)
  ]);
  if (roster.error) throw roster.error;
  if (attendance.error) throw attendance.error;
  const { data: plan, error: planError } = await db.from("technical_plans")
    .select("id,group_grade,target_grade,technique_name,category,summary_es,completed").eq("class_id", id).order("suggested_order");
  if (planError) throw planError;
  const present = new Set(attendance.data.map((row) => row.member_id));
  const editable = slug !== "gainberri" && !dojo.archived_at && !session.closed && session.status === "pending";
  const { data: substitutes, error: substituteError } = editable
    ? await db.from("class_delegate_links").select("token").eq("class_id", id)
      .eq("created_by", "dojo_portal").is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1)
    : { data: [], error: null };
  if (substituteError) throw substituteError;
  const path = `/portal/${slug}/clases/${id}`;
  const guided = session.class_group === "adults" && slug !== "gainberri";
  const step = !editable ? "cerrada" : fromMode ? modo : "plan";
  const attendancePath = guided ? path + "?modo=asistencia" : path;
  const grades = [...new Set(plan.map((row) => row.group_grade))];
  const showManual = guided && editable && step === "plan" && session.class_group === "adults";
  const [catalog, groups] = showManual ? await Promise.all([
    db.from("techniques").select("id,grade,name,base_name,variant,variant_note,category,content_type").eq("active", true).order("name"),
    db.from("class_technical_groups").select("id,grade").eq("class_id", id).eq("active", true).order("grade")
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (catalog.error || groups.error) throw catalog.error ?? groups.error;
  return (
    <main className={guided ? "dojo-page" : "main"}>
      <PortalBackLink href={`/portal/${slug}/${fromMode ? "modo-dojo" : "clases"}`} label={fromMode ? "Volver a Modo Dojo" : "Volver a clases"} />
      {guided && editable && <ClassSectionNav
        current={step === "plan" ? "adult-technical" : step === "asistencia" ? "adult-attendance" : "close"}
        links={[
          { id: "adult-technical", label: "Técnicas adultos", href: path + "?modo=plan", done: plan.some((row) => row.completed) },
          { id: "adult-attendance", label: "Asistencia adultos", href: attendancePath, done: present.size > 0 },
          { id: "close", label: "Revisar y cerrar", href: path + "?modo=cierre" }
        ]}
      />}
      <section className={guided ? "dojo-task-card" : undefined}>
      <h1>{guided ? (step === "cerrada" ? "Clase cerrada" : step === "plan" ? "Técnicas adultos" : step === "asistencia" ? "Asistencia adultos" : "Cerrar clase") : session.name}</h1>
      <p>{guided && <>{session.name} · </>}{session.class_date} · {present.size} asistentes</p>
      {formError && <p role="alert">No se pudo guardar el cambio.</p>}
      {saved === "updated" && <p role="status">Clase actualizada.</p>}
      {warning === "exam" && <p role="alert">Quedó pendiente recalcular la preparación de examen de algún asistente.</p>}
      {slug !== "gainberri" && !dojo.archived_at && (
        <details id="mantenimiento" className="card maintenance-panel" open={formError === "mantenimiento"}>
          <summary>Editar o eliminar clase</summary>
          <div className="split-section">
            <form action={maintainClass.bind(null, slug, id, false)} className="edit-form">
              <div className="form-grid">
                <label>Fecha<input type="date" name="date" defaultValue={session.class_date} required /></label>
                <label>Nombre<input name="name" defaultValue={session.name} maxLength={100} required /></label>
                <label>Tipo<select name="type" defaultValue={session.class_type ?? "NORMAL"}>
                  <option value="NORMAL">Normal</option>
                  <option value="CONJUNTA">Conjunta</option>
                  <option value="REPASO">Repaso</option>
                  <option value="EXAMEN">Examen</option>
                </select></label>
                <label>Responsable<input name="responsible" defaultValue={session.responsible ?? ""} /></label>
                <label className="wide">Notas<textarea name="notes" rows={3} defaultValue={session.notes ?? ""} /></label>
              </div>
              <div className="form-actions"><button type="submit">Guardar cambios</button></div>
            </form>
            <form action={maintainClass.bind(null, slug, id, true)} className="edit-form danger-zone">
              <h2>Eliminar clase</h2>
              <p className="muted">Elimina también la asistencia, el plan y el historial técnico de esta clase.</p>
              <label>Confirmación<input name="confirm" placeholder="Escribe ELIMINAR" required /></label>
              <div className="form-actions"><button type="submit">Eliminar clase</button></div>
            </form>
          </div>
        </details>
      )}
      {(!guided || step === "plan" || step === "cerrada") && <h2>Plan técnico</h2>}
      {showManual && <details className="dojo-manual-technique manual-technique-panel">
        <summary><strong>Técnicas fuera del plan</strong></summary>
        {groups.data.length ? <ManualTechniqueForm action={addPortalManualTechnique.bind(null, slug, id)}
          classId={id} legacyId={id} techniques={catalog.data} groups={groups.data} /> :
          <p>Para añadir técnicas, el dojo necesita al menos un kenshi adulto activo con grado asignado.</p>}
      </details>}
      {guided && step === "plan" && plan.length > 0 && (
        <form action={selectTechniques.bind(null, slug, id)} className="dojo-plan-form">
          <span data-class-primary-form="adult-technical" hidden />
          {grades.map((grade) => {
            const rows = plan.filter((row) => row.group_grade === grade);
            const colorGrade = normalizeGrade(rows[0].target_grade || grade).toLowerCase().replace(/\s+/g, "-");
            return <details className={`dojo-grade-panel dojo-grade-${colorGrade}`} key={grade}>
              <summary>
                <span>{grade} {rows[0].target_grade && <> <b>para</b> {rows[0].target_grade}</>}</span>
                <em>{rows.filter((row) => row.completed).length}/{rows.length}</em>
              </summary>
              <div className="dojo-technique-list">
                {rows.map((row) => <label className="dojo-technique" key={row.id}>
                  <input name="worked" type="checkbox" value={row.id} defaultChecked={row.completed} />
                  <span><strong>{row.technique_name}</strong><small>{row.category}</small>{row.summary_es && <p>{row.summary_es}</p>}</span>
                </label>)}
              </div>
            </details>;
          })}
          <DojoSubmitButton pendingLabel="Guardando técnicas…">Guardar técnicas y pasar asistencia</DojoSubmitButton>
        </form>
      )}
      {!editable && <ul>{plan.filter((row) => row.completed).map((row) => <li key={row.id}>{row.group_grade} · {row.technique_name}</li>)}</ul>}
      {editable && !guided && session.class_group === "adults" && !plan.length && !session.plan_generated &&
        <form action={preparePlan.bind(null, slug, id, guided)}>
          <DojoSubmitButton pendingLabel="Generando plan…">Generar plan técnico</DojoSubmitButton>
        </form>}
      {guided && step === "plan" && !plan.length && <>
        <p>No hay técnicas propuestas para esta clase.</p>
        <a className="dojo-primary-button" href={attendancePath}>Pasar asistencia</a>
      </>}
      {editable && (!guided || step === "asistencia") && <ClassVisitorForm host={slug} classId={id} group={session.class_group} returnTo={attendancePath} />}
      {editable && (!guided || step === "asistencia") && <ProvisionalAttendanceForm dojo={slug} classId={id} group={session.class_group} returnTo={attendancePath} />}
      {editable && (!guided || step === "asistencia") && <form action={save.bind(null, slug, id, guided)}>
        {guided && <span data-class-primary-form="adult-attendance" hidden />}
        <fieldset>
          <legend>Pasar lista</legend>
          {(Array.isArray(roster.data) ? roster.data : []).map(({member_id, display_name, visit_id}) => (
            <div key={member_id}>
              <label><input type="checkbox" name="member" value={member_id} defaultChecked={present.has(member_id)} /> {display_name}{visit_id && " · Visitante"}</label>
            </div>
          ))}
        </fieldset>
        <button className="primary-link">Guardar asistencia</button>
      </form>}
      {editable && (guided ? step === "cierre" : plan.length > 0) && <form action={finishClass.bind(null, slug, id, guided)}>
        <fieldset>
          <legend>Técnicas trabajadas</legend>
          {plan.map((row) => <div key={row.id}>
            <label><input name="worked" type="checkbox" value={row.id} defaultChecked={row.completed} /> {row.group_grade} · {row.technique_name}</label>
          </div>)}
        </fieldset>
        <button className={guided ? "dojo-primary-button" : undefined}>Cerrar clase</button>
      </form>}
      {editable && (!guided || step === "plan") && <section className="card">
        <h2>Sustituto</h2>
        {substitutes?.[0] ? <a href={`/portal/sustituto/${substitutes[0].token}`}>Abrir o copiar enlace del sustituto</a> :
          <form action={createSubstituteLink.bind(null, slug, id)}><DojoSubmitButton pendingLabel="Creando enlace…">Crear enlace de sustitución</DojoSubmitButton></form>}
      </section>}
      </section>
    </main>
  );
}
