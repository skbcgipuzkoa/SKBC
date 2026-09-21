import { Check, ChevronDown, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import {
  addBulkAttendanceAction,
  addManualClassTechniqueAction,
  closeKidsClassAction,
  logoutAction,
  removeManualClassTechniqueAction,
  updateClassPlanTechniquesAction
} from "@/app/actions";
import { ManualTechniqueForm } from "@/app/clases/[legacyId]/ManualTechniqueForm";
import { DojoSubmitButton } from "@/app/dojo/DojoSubmitButton";
import { hasInternalAccess } from "@/lib/auth";
import { adultGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  status: string;
  closed: boolean;
};

type PlanRow = {
  id: string;
  group_grade: string | null;
  target_grade: string | null;
  technique_name: string;
  category: string | null;
  proposal_type: string | null;
  summary_es: string | null;
  completed: boolean;
};

type MemberRow = {
  id: string;
  display_name: string;
  grade: string | null;
  class: "kids" | "adults";
};

type AttendanceRow = {
  id: string;
  class_id: string;
  member_id: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_role: string | null;
};

type TechniqueOption = {
  id: string;
  grade: string;
  name: string;
  category: string | null;
  content_type: string | null;
};

export default async function DojoClassPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<{ step?: string; saved?: string; error?: string; detail?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const [{ legacyId }, query] = await Promise.all([params, searchParams]);
  const supabase = createAdminClient();
  const { data: baseClass, error } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,status,closed")
    .eq("legacy_id", legacyId)
    .single<ClassRow>();

  if (error || !baseClass) notFound();

  const { data: dayClasses } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,status,closed")
    .eq("class_date", baseClass.class_date)
    .in("class_group", ["adults", "kids"])
    .returns<ClassRow[]>();

  const adultClass = (dayClasses ?? []).find((item) => item.class_group === "adults") ?? (baseClass.class_group === "adults" ? baseClass : null);
  const kidsClass = (dayClasses ?? []).find((item) => item.class_group === "kids") ?? (baseClass.class_group === "kids" ? baseClass : null);

  if (baseClass.class_group === "kids" && adultClass?.legacy_id) {
    redirect(`/dojo/${adultClass.legacy_id}`);
  }

  if (!adultClass && !kidsClass) notFound();
  const mainClass = adultClass ?? kidsClass ?? baseClass;
  const classIds = [adultClass?.id, kidsClass?.id].filter(Boolean) as string[];

  const [{ data: plan }, { data: members }, { data: attendance }, { data: techniques }] = await Promise.all([
    adultClass
      ? supabase
        .from("technical_plans")
        .select("id,group_grade,target_grade,technique_name,category,proposal_type,summary_es,completed")
        .eq("class_id", adultClass.id)
        .order("group_grade")
        .order("suggested_order")
        .returns<PlanRow[]>()
      : Promise.resolve({ data: [] as PlanRow[] }),
    supabase
      .from("members")
      .select("id,display_name,grade,class")
      .eq("status", "active")
      .in("class", ["kids", "adults"])
      .order("display_name")
      .returns<MemberRow[]>(),
    classIds.length
      ? supabase
        .from("attendance_logs")
        .select("id,class_id,member_id,official_grade,trained_grade,technical_role")
        .in("class_id", classIds)
        .returns<AttendanceRow[]>()
      : Promise.resolve({ data: [] as AttendanceRow[] }),
    supabase
      .from("techniques")
      .select("id,grade,name,category,content_type")
      .eq("active", true)
      .order("grade")
      .order("name")
      .returns<TechniqueOption[]>()
  ]);

  const attendanceRows = attendance ?? [];
  const kidsAttendance = attendanceRows.filter((item) => item.class_id === kidsClass?.id);
  const adultAttendance = attendanceRows.filter((item) => item.class_id === adultClass?.id);
  const kidsPresent = new Set(kidsAttendance.map((item) => item.member_id));
  const adultPresent = new Set(adultAttendance.map((item) => item.member_id));
  const kids = (members ?? []).filter((item) => item.class === "kids");
  const adults = (members ?? []).filter((item) => item.class === "adults");
  const pendingKids = kids.filter((item) => !kidsPresent.has(item.id));
  const pendingAdults = adults.filter((item) => !adultPresent.has(item.id));
  const planRows = plan ?? [];
  const completedPlan = planRows.filter((item) => item.completed).length;
  const step = resolveStep(query.step, {
    hasKids: Boolean(kidsClass),
    kidsClosed: Boolean(kidsClass?.closed),
    adultClosed: Boolean(adultClass?.closed),
    kidsAttendance: kidsAttendance.length,
    adultAttendance: adultAttendance.length,
    completedPlan
  });
  const groupedPlan = groupPlanByGrade(planRows);
  const trainingGrades = buildAdultTrainingGradeOptions(groupedPlan.map(([grade]) => grade));
  const manualCommonPlan = planRows.filter((item) => normalizeGrade(item.proposal_type) === "COMUN MANUAL");
  const manualCommonSummary = summarizeManualCommonPlan(manualCommonPlan);

  return (
    <main className="dojo-page dojo-work-page">
      <header className="dojo-topbar">
        <a href="/skbc-interno/dojo" className="dojo-brand">
          <img src="/icon-192.png" alt="" />
          <span>
            <strong>{mainClass.name}</strong>
            <small>{formatDate(mainClass.class_date)}</small>
          </span>
        </a>
        <form action={logoutAction}>
          <button className="dojo-icon-button" type="submit" aria-label="Salir">
            <LogOut aria-hidden="true" size={22} />
          </button>
        </form>
      </header>

      <section className="dojo-stepper" aria-label="Flujo de clase">
        <StepPill active={step === "kids"} done={Boolean(kidsClass?.closed || kidsAttendance.length)} label="1 Niños" />
        <StepPill active={step === "techniques"} done={completedPlan > 0} label="2 Técnicas" />
        <StepPill active={step === "adults"} done={adultAttendance.length > 0} label="3 Adultos" />
        <StepPill active={step === "close" || step === "done"} done={Boolean(adultClass?.closed && (!kidsClass || kidsClass.closed))} label="4 Cerrar" />
      </section>

      {query.error ? <p className="dojo-error">No se ha podido guardar. Revisa la clase completa si necesitas corregir algo.</p> : null}
      {query.saved ? <p className="dojo-ok">{savedMessage(query.saved)}</p> : null}

      {step === "kids" ? (
        <section className="dojo-task-card">
          <p className="eyebrow">Paso 1</p>
          <h1>Asistencia niños</h1>
          <p>Marca los niños que han venido. Si hoy no hay clase infantil, puedes saltar este paso.</p>
          {kidsClass ? (
            <>
              <form action={addBulkAttendanceAction} className="dojo-check-list">
                <input type="hidden" name="classId" value={kidsClass.id} />
                <input type="hidden" name="legacyId" value={kidsClass.legacy_id ?? legacyId} />
                <input type="hidden" name="returnLegacyId" value={mainClass.legacy_id ?? legacyId} />
                <input type="hidden" name="returnTo" value={`/dojo/${mainClass.legacy_id ?? legacyId}?step=techniques&saved=kids`} />
                <input type="hidden" name="groupClassIds" value={kidsClass.id} />
                {pendingKids.map((member) => <DojoCheck key={member.id} name={`memberIds:${kidsClass.id}`} member={member} />)}
                {pendingKids.length ? <DojoSubmitButton pendingLabel="Guardando niños...">Guardar niños y seguir</DojoSubmitButton> : <a className="dojo-primary-button" href={`/dojo/${mainClass.legacy_id ?? legacyId}?step=techniques`}>Seguir a técnicas</a>}
              </form>
              {!kidsClass.closed ? (
                <form action={closeKidsClassAction} className="dojo-secondary-form">
                  <input type="hidden" name="classId" value={kidsClass.id} />
                  <input type="hidden" name="legacyId" value={kidsClass.legacy_id ?? legacyId} />
                  <input type="hidden" name="returnLegacyId" value={mainClass.legacy_id ?? legacyId} />
                  <input type="hidden" name="returnTo" value={`/dojo/${mainClass.legacy_id ?? legacyId}?step=techniques&saved=kids-skip`} />
                  <DojoSubmitButton className="dojo-secondary-button" pendingLabel="Saltando...">Saltar niños hoy</DojoSubmitButton>
                </form>
              ) : null}
            </>
          ) : <a className="dojo-primary-button" href={`/dojo/${mainClass.legacy_id ?? legacyId}?step=techniques`}>Seguir a técnicas</a>}
        </section>
      ) : null}

      {step === "techniques" ? (
        <section className="dojo-task-card">
          <p className="eyebrow">Paso 2</p>
          <h1>Técnicas adultos</h1>
          <p>Despliega solo el grado que necesitas y marca lo realizado.</p>
          {adultClass ? (
            <>
            <details className="dojo-manual-technique manual-technique-panel">
              <summary>
                <strong>Tecnica comun fuera del plan</strong>
                <span>{manualCommonSummary.length} anadidas</span>
              </summary>
              {manualCommonSummary.length ? (
                <div className="manual-technique-added-list">
                  <strong>Extras manuales de esta clase</strong>
                  {manualCommonSummary.map((item) => (
                    <div className="manual-technique-added-row" key={item.key}>
                      <span>
                        {item.name}
                        <small>{item.grades.length ? item.grades.join(", ") : "Toda la clase"} - {item.category ?? "tecnica"}</small>
                      </span>
                      <form action={removeManualClassTechniqueAction}>
                        <input type="hidden" name="classId" value={adultClass.id} />
                        <input type="hidden" name="legacyId" value={adultClass.legacy_id ?? legacyId} />
                        <input type="hidden" name="planIds" value={item.ids.join(",")} />
                        <input type="hidden" name="returnTo" value={`/dojo/${adultClass.legacy_id ?? legacyId}?step=techniques&saved=manual-technique-remove`} />
                        <DojoSubmitButton className="secondary-button" pendingLabel="Quitando...">Quitar</DojoSubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
              ) : null}
              <ManualTechniqueForm
                action={addManualClassTechniqueAction}
                classId={adultClass.id}
                legacyId={adultClass.legacy_id ?? legacyId}
                returnTo={`/dojo/${adultClass.legacy_id ?? legacyId}?step=techniques&saved=manual-technique`}
                techniques={techniques ?? []}
                groups={groupedPlan.map(([grade]) => ({ id: grade, grade }))}
              />
            </details>
            <form action={updateClassPlanTechniquesAction} className="dojo-plan-form">
              <input type="hidden" name="classId" value={adultClass.id} />
              <input type="hidden" name="legacyId" value={adultClass.legacy_id ?? legacyId} />
              <input type="hidden" name="returnTo" value={`/dojo/${adultClass.legacy_id ?? legacyId}?step=adults&saved=techniques`} />
              {groupedPlan.map(([grade, items], index) => {
                const done = items.filter((item) => item.completed).length;
                const targetGrade = items[0]?.target_grade ?? nextAdultGrade(grade);
                return (
                  <details className={`dojo-grade-panel dojo-grade-${slugGrade(targetGrade)}`} key={grade} open={index === 0}>
                    <summary>
                      <span>{grade} <b>para</b> {targetGrade}</span>
                      <em>{done}/{items.length}</em>
                      <ChevronDown aria-hidden="true" size={20} />
                    </summary>
                    <div className="dojo-technique-list">
                      {items.map((item) => (
                        <label className="dojo-technique" key={item.id}>
                          <input type="checkbox" name="planIds" value={item.id} defaultChecked={item.completed} />
                          <span>
                            <strong>{item.technique_name}</strong>
                            <small>{item.category ?? "tecnica"} · {item.proposal_type ?? "programa"}</small>
                            {item.summary_es ? <p>{item.summary_es}</p> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
              <DojoSubmitButton pendingLabel="Guardando técnicas...">Guardar técnicas y pasar a adultos</DojoSubmitButton>
            </form>
            </>
          ) : <p className="muted">No hay clase adulta en este día.</p>}
        </section>
      ) : null}

      {step === "adults" ? (
        <section className="dojo-task-card">
          <p className="eyebrow">Paso 3</p>
          <h1>Asistencia adultos</h1>
          <p>Marca asistencia y ajusta grupo/rol solo cuando haga falta.</p>
          {adultClass ? (
            <form action={addBulkAttendanceAction} className="dojo-check-list">
              <input type="hidden" name="classId" value={adultClass.id} />
              <input type="hidden" name="legacyId" value={adultClass.legacy_id ?? legacyId} />
              <input type="hidden" name="returnTo" value={`/dojo/${adultClass.legacy_id ?? legacyId}?step=close&saved=adults`} />
              <input type="hidden" name="groupClassIds" value={adultClass.id} />
              {pendingAdults.map((member) => (
                <DojoCheck key={member.id} name={`memberIds:${adultClass.id}`} member={member}>
                  <select name={`trainedGrade:${adultClass.id}:${member.id}`} defaultValue={resolveTrainingGroupGrade(member.grade)}>
                    {trainingGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                  </select>
                  <select name={`technicalRole:${adultClass.id}:${member.id}`} defaultValue="student">
                    <option value="student">Entrena</option>
                    <option value="teaching">Enseña</option>
                    <option value="reviewing">Parcial / revisar</option>
                    <option value="observing">Observa</option>
                  </select>
                </DojoCheck>
              ))}
              {pendingAdults.length ? <DojoSubmitButton pendingLabel="Guardando adultos...">Guardar adultos y revisar cierre</DojoSubmitButton> : <a className="dojo-primary-button" href={`/dojo/${adultClass.legacy_id ?? legacyId}?step=close`}>Revisar cierre</a>}
            </form>
          ) : <p className="muted">No hay clase adulta en este día.</p>}
        </section>
      ) : null}

      {step === "close" ? (
        <section className="dojo-task-card">
          <p className="eyebrow">Paso 4</p>
          <h1>Cerrar todo</h1>
          <DojoCorrectionLinks
            legacyId={mainClass.legacy_id ?? legacyId}
            hasKids={Boolean(kidsClass)}
            hasAdults={Boolean(adultClass)}
            hasPlan={planRows.length > 0}
          />
          {adultClass && planRows.length > 0 && completedPlan === 0 ? (
            <p className="dojo-warning">
              No hay tecnicas marcadas en la clase adulta. Puedes cerrar igualmente si fue una clase sin trabajo tecnico registrado.
            </p>
          ) : null}
          <div className="dojo-summary-grid">
            <SummaryBox label="Niños" value={`${kidsAttendance.length}/${kids.length}`} />
            <SummaryBox label="Adultos" value={`${adultAttendance.length}/${adults.length}`} />
            <SummaryBox label="Técnicas" value={`${completedPlan}/${planRows.length}`} />
          </div>
          <form action={addBulkAttendanceAction}>
            <input type="hidden" name="classId" value={adultClass?.id ?? kidsClass?.id ?? ""} />
            <input type="hidden" name="legacyId" value={mainClass.legacy_id ?? legacyId} />
            <input type="hidden" name="returnTo" value={`/dojo/${mainClass.legacy_id ?? legacyId}?step=done&saved=close`} />
            <input type="hidden" name="closeAfter" value="true" />
            {adultClass ? <input type="hidden" name="groupClassIds" value={adultClass.id} /> : null}
            {kidsClass ? <input type="hidden" name="groupClassIds" value={kidsClass.id} /> : null}
            <DojoSubmitButton
              pendingLabel="Cerrando clase..."
              confirmMessage={adultClass && planRows.length > 0 && completedPlan === 0 ? "No hay ninguna tecnica adulta marcada. ¿Quieres cerrar la clase igualmente?" : undefined}
            >
              Cerrar clase completa
            </DojoSubmitButton>
          </form>
          <a className="dojo-secondary-button" href={`/clases/${mainClass.legacy_id ?? legacyId}`}>Abrir clase completa</a>
        </section>
      ) : null}

      {step === "done" ? (
        <section className="dojo-task-card dojo-done-card">
          <Check aria-hidden="true" size={42} />
          <h1>Clase cerrada</h1>
          <p>Asistencia, técnicas, fichas y rankings quedan actualizados.</p>
          <a className="dojo-primary-button" href="/skbc-interno/dojo">Volver a modo dojo</a>
          <a className="dojo-secondary-button" href={`/control-dia?date=${mainClass.class_date}`}>Ver control del día</a>
        </section>
      ) : null}
    </main>
  );
}

function StepPill({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return <span className={active ? "active" : done ? "done" : ""}>{done ? <Check aria-hidden="true" size={16} /> : null}{label}</span>;
}

function DojoCheck({ name, member, children }: { name: string; member: MemberRow; children?: ReactNode }) {
  return (
    <label className="dojo-member-row">
      <input type="checkbox" name={name} value={member.id} />
      <span>
        <strong>{member.display_name}</strong>
        <small>{member.grade ?? "Sin grado"}</small>
      </span>
      {children ? <div className="dojo-member-options">{children}</div> : null}
    </label>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return <div><small>{label}</small><strong>{value}</strong></div>;
}

function DojoCorrectionLinks({
  legacyId,
  hasKids,
  hasAdults,
  hasPlan
}: {
  legacyId: string;
  hasKids: boolean;
  hasAdults: boolean;
  hasPlan: boolean;
}) {
  return (
    <nav className="dojo-correction-links" aria-label="Corregir pasos de la clase">
      {hasKids ? <a href={`/dojo/${legacyId}?step=kids`}>Corregir ninos</a> : null}
      {hasAdults && hasPlan ? <a href={`/dojo/${legacyId}?step=techniques`}>Corregir tecnicas</a> : null}
      {hasAdults ? <a href={`/dojo/${legacyId}?step=adults`}>Corregir adultos</a> : null}
    </nav>
  );
}

function savedMessage(saved: string) {
  if (saved === "kids") return "Asistencia infantil guardada. Continua con tecnicas.";
  if (saved === "kids-skip") return "Clase infantil saltada para hoy. Continua con adultos.";
  if (saved === "techniques") return "Tecnicas guardadas. Continua con asistencia adulta.";
  if (saved === "adults") return "Asistencia adulta guardada. Revisa y cierra la clase.";
  if (saved === "close") return "Clase cerrada. Fichas actualizadas.";
  return "Guardado correctamente.";
}

function resolveStep(
  requested: string | undefined,
  state: { hasKids: boolean; kidsClosed: boolean; adultClosed: boolean; kidsAttendance: number; adultAttendance: number; completedPlan: number }
) {
  if (requested === "kids" || requested === "techniques" || requested === "adults" || requested === "close" || requested === "done") return requested;
  if (state.adultClosed && (!state.hasKids || state.kidsClosed)) return "done";
  if (state.hasKids && !state.kidsClosed && state.kidsAttendance === 0) return "kids";
  if (state.completedPlan === 0) return "techniques";
  if (state.adultAttendance === 0) return "adults";
  return "close";
}

function groupPlanByGrade(plan: PlanRow[]) {
  const groups = new Map<string, PlanRow[]>();
  plan.forEach((item) => {
    const grade = normalizeGrade(item.group_grade || "Sin grupo");
    groups.set(grade, [...(groups.get(grade) ?? []), item]);
  });
  return [...groups.entries()].sort(([a], [b]) => gradeSortValue(a) - gradeSortValue(b));
}

function summarizeManualCommonPlan(rows: PlanRow[]) {
  const summary = new Map<string, { key: string; name: string; category: string | null; grades: string[]; ids: string[] }>();
  rows.forEach((row) => {
    const key = `${row.technique_name}:${row.category ?? ""}`;
    const current = summary.get(key) ?? { key, name: row.technique_name, category: row.category, grades: [], ids: [] };
    const grade = normalizeGrade(row.group_grade);
    if (grade && !current.grades.includes(grade)) current.grades.push(grade);
    current.ids.push(row.id);
    summary.set(key, current);
  });
  return [...summary.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildAdultTrainingGradeOptions(planGrades: string[]) {
  const seen = new Set(planGrades.map(normalizeGrade));
  const base = adultGrades.filter((grade) => gradeSortValue(grade) <= gradeSortValue("5 DAN"));
  const extras = [...seen].filter((grade) => !base.includes(grade)).sort((a, b) => gradeSortValue(a) - gradeSortValue(b));
  return [...base, ...extras];
}

function resolveTrainingGroupGrade(grade: string | null) {
  const normalized = normalizeGrade(grade);
  if (gradeSortValue(normalized) >= gradeSortValue("5 DAN")) return "5 DAN";
  return normalized || "MINARAI";
}

function nextAdultGrade(grade: string | null) {
  const normalized = normalizeGrade(grade);
  const index = adultGrades.indexOf(normalized);
  if (index < 0) return "";
  return adultGrades[Math.min(index + 1, adultGrades.indexOf("5 DAN"))] ?? "";
}

function gradeSortValue(grade: string | null) {
  const normalized = normalizeGrade(grade);
  const order = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN", "6 DAN", "7 DAN", "8 DAN", "9 DAN", "10 DAN"];
  const index = order.indexOf(normalized);
  return index === -1 ? 999 : index;
}

function normalizeGrade(grade: string | null | undefined) {
  return String(grade ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function slugGrade(grade: string | null | undefined) {
  return normalizeGrade(grade || "sin-grado").toLowerCase().replace(/\s+/g, "-");
}

function formatDate(value: string) {
  return value.split("-").reverse().join("/");
}
