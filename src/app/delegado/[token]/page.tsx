import { ClipboardCheck, Play, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { saveDelegateChildPlanAction, saveDelegateTechnicalStepAction, startDelegateClassAction, submitDelegateClassAction } from "@/app/actions";
import { ClosingClassButton } from "@/app/components/ClosingClassButton";
import { ClassClosureSuccess } from "@/app/components/ClassClosureSuccess";
import { adultGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveImageUrl } from "@/lib/drive";
import { delegateAttendanceGroups, normalizeDelegateStep, resolveDelegateMode, type DelegateMode } from "@/lib/delegate-class-flow";
import { delegateChildActivities, delegateChildObjectives } from "@/lib/delegate-child-plan";

type LinkRow = {
  id: string;
  class_id: string;
  token: string;
  delegate_name: string | null;
  expires_at: string;
  started_at: string | null;
  closed_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  updated_at: string;
};

type ClassRow = {
  id: string;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  closed: boolean;
  status: string;
};

type PlanRow = {
  id: string;
  class_id: string;
  group_grade: string | null;
  target_grade: string | null;
  technique_name: string;
  variant: string | null;
  variant_note: string | null;
  category: string | null;
  proposal_type: string | null;
  summary_es: string | null;
  completed: boolean;
};

type AttendanceRow = {
  class_id: string;
  member_id: string;
};

type ChildPlanRow = {
  objective: string | null;
  activities: string[] | null;
  syllabus_item_ids: string[] | null;
  notes: string | null;
};

type ChildSyllabusItemRow = {
  id: string;
  grade: string | null;
  title: string;
  category: string | null;
  description: string | null;
};

type MemberOption = {
  id: string;
  display_name: string;
  grade: string | null;
  class: "kids" | "adults";
  photo_url: string | null;
};

export default async function DelegateClassPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string; step?: string; started?: string; saved?: string; error?: string; detail?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const supabase = createAdminClient();
  const requestedMode = normalizeDelegateMode(query.mode);

  const { data: link, error: linkError } = await supabase
    .from("class_delegate_links")
    .select("id,class_id,token,delegate_name,expires_at,started_at,closed_at,revoked_at,created_by,updated_at")
    .eq("token", token)
    .single<LinkRow>();

  if (linkError || !link) notFound();

  const { data: primaryClass, error: classError } = await supabase
    .from("classes")
    .select("id,class_date,name,class_group,closed,status")
    .eq("id", link.class_id)
    .single<ClassRow>();

  if (classError || !primaryClass) notFound();

  const mode = resolveDelegateMode(requestedMode, delegateModeFromCreatedBy(link.created_by), primaryClass.class_group);
  const classGroups: Array<"kids" | "adults"> = mode === "combined" ? ["adults", "kids"] : [mode === "kids" ? "kids" : "adults"];

  const { data: classes } = await supabase
    .from("classes")
    .select("id,class_date,name,class_group,closed,status")
    .eq("class_date", primaryClass.class_date)
    .in("class_group", classGroups)
    .order("class_group")
    .returns<ClassRow[]>();

  const usableClasses = (classes ?? []).filter((clase) => !clase.closed);
  const adultClasses = usableClasses.filter((clase) => clase.class_group === "adults");
  const kidsClasses = usableClasses.filter((clase) => clase.class_group === "kids");
  const isExpired = new Date(link.expires_at).getTime() < Date.now();
  const isClassClosed = Boolean(
    link.closed_at
    || primaryClass.closed
    || (mode === "combined" && (!adultClasses.length || !kidsClasses.length) && (classes ?? []).some((clase) => clase.closed))
  );
  const isUnavailable = Boolean(link.revoked_at || link.closed_at || isExpired || !usableClasses.length);
  const hasStarted = Boolean(link.started_at || query.started);
  const step = normalizeDelegateStep(query.step, mode, hasStarted, kidsClasses.length > 0, adultClasses.length > 0);
  const attendanceGroups = delegateAttendanceGroups(mode, step);
  const attendanceClasses = usableClasses.filter((clase) => attendanceGroups.includes(clase.class_group));

  const classIds = usableClasses.map((clase) => clase.id);
  const [{ data: plan }, { data: attendance }, { data: members }] = classIds.length ? await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,class_id,group_grade,target_grade,technique_name,variant,variant_note,category,proposal_type,summary_es,completed")
      .in("class_id", adultClasses.map((clase) => clase.id))
      .order("group_grade")
      .order("suggested_order")
      .returns<PlanRow[]>(),
    supabase
      .from("attendance_logs")
      .select("class_id,member_id")
      .in("class_id", classIds)
      .returns<AttendanceRow[]>(),
    supabase
      .from("members")
      .select("id,display_name,grade,class,photo_url")
      .in("class", classGroups)
      .eq("status", "active")
      .order("display_name")
      .returns<MemberOption[]>()
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const kidsClassId = kidsClasses[0]?.id ?? null;
  const [{ data: childPlan, error: childPlanError }, { data: childSyllabusItems, error: childSyllabusError }] = kidsClassId ? await Promise.all([
    supabase
      .from("child_class_plans")
      .select("objective,activities,syllabus_item_ids,notes")
      .eq("class_id", kidsClassId)
      .maybeSingle<ChildPlanRow>(),
    supabase
      .from("child_syllabus_items")
      .select("id,grade,title,category,description,child_syllabus_contents!inner(archived_at)")
      .eq("active", true)
      .is("child_syllabus_contents.archived_at", null)
      .order("sort_order")
      .returns<ChildSyllabusItemRow[]>()
  ]) : [{ data: null as ChildPlanRow | null, error: null }, { data: [] as ChildSyllabusItemRow[], error: null }];
  const activeChildSyllabusIds = new Set((childSyllabusItems ?? []).map((item) => item.id));
  const historicalChildSyllabusIds = (childPlan?.syllabus_item_ids ?? []).filter((id) => !activeChildSyllabusIds.has(id));
  const { data: historicalChildSyllabusItems, error: historicalChildSyllabusError } = historicalChildSyllabusIds.length
    ? await supabase
      .from("child_syllabus_items")
      .select("id,grade,title,category,description")
      .in("id", historicalChildSyllabusIds)
      .returns<ChildSyllabusItemRow[]>()
    : { data: [] as ChildSyllabusItemRow[], error: null };
  const childSyllabusLoadError = childPlanError ?? childSyllabusError ?? historicalChildSyllabusError;

  const attendanceKeys = new Set((attendance ?? []).map((item) => `${item.class_id}:${item.member_id}`));
  const title = mode === "combined" ? "Clase adultos + ninos" : mode === "kids" ? "Clase ninos" : "Clase adultos";
  const primaryName = usableClasses.map((clase) => clase.name).join(" + ") || primaryClass.name;

  return (
    <main className="delegate-page">
      <section className="delegate-hero">
        <img src="/skbc-icon.png" alt="SKBC Gipuzkoa" />
        <div>
          <span>SKBC Gipuzkoa · {title}</span>
          <h1>{primaryName}</h1>
          <p>{primaryClass.class_date}</p>
        </div>
      </section>

      {query.saved === "sent" ? (
        <ClassClosureSuccess detail="La asistencia y el trabajo de clase han quedado guardados en SKBC." />
      ) : isClassClosed ? (
        <section className="delegate-card">
          <h2>Clase cerrada</h2>
          <p className="muted">Otra persona ya ha cerrado esta clase. No se pueden guardar mas cambios desde los enlaces de sustituto.</p>
          <p className="muted">Si hace falta corregir algun dato, Alvaro debe reabrir la clase desde administracion.</p>
        </section>
      ) : isUnavailable ? (
        <section className="delegate-card">
          <h2>Enlace no disponible</h2>
          <p className="muted">Este enlace ha caducado, ha sido usado, falta alguna clase del modo combinado o la clase ya esta cerrada.</p>
        </section>
      ) : step === "start" ? (
        <section className="delegate-card">
          <h2>Iniciar clase</h2>
          <p className="muted">Pulsa iniciar. Si hay adultos, el sistema preparara automaticamente grupos y plan tecnico.</p>
          {query.error ? <p className="form-error">No se ha podido iniciar la clase.</p> : null}
          <form action={startDelegateClassAction} className="delegate-form">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="mode" value={mode} />
            <label>
              Tu nombre
              <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
            </label>
            <button type="submit">
              <Play aria-hidden="true" size={18} />
              Iniciar clase
            </button>
          </form>
        </section>
      ) : step === "kids-attendance" ? (
        <form action={submitDelegateClassAction} className="delegate-form delegate-flow">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value={mode} />
          <input type="hidden" name="nextStep" value={mode === "kids" ? "kids-technical" : "technical"} />
          <section className="delegate-card">
            <span className="tag">Paso 1</span>
            <h2>Asistencia ninos</h2>
            <p className="muted">Primero registra la asistencia infantil. Despues podras indicar el programa tecnico trabajado.</p>
            <label>
              Responsable
              <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
            </label>
            {query.error === "attendance" ? <p className="form-error">Selecciona al menos un asistente.</p> : null}
            {query.error === "submit" ? (
              <p className="form-error">No se ha podido guardar la asistencia infantil{query.detail ? `: ${query.detail}` : "."}</p>
            ) : null}
          </section>
          {kidsClasses.map((clase) => (
            <DelegateAttendanceSection
              key={clase.id}
              clase={clase}
              members={(members ?? []).filter((member) => member.class === "kids")}
              attendanceKeys={attendanceKeys}
              adultTrainingGradeOptions={[]}
            />
          ))}
          <section className="delegate-submit-bar">
            <div>
              <strong>Guardar ninos</strong>
              <span>{mode === "kids" ? "Continua con el programa tecnico infantil." : "Continua despues con adultos."}</span>
            </div>
            <button type="submit">
              <Send aria-hidden="true" size={18} />
              Guardar y seguir
            </button>
          </section>
        </form>
      ) : step === "kids-technical" && mode === "kids" && kidsClassId ? (
        <div className="delegate-form delegate-flow">
          <form action={saveDelegateChildPlanAction} className="delegate-form delegate-flow">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="linkVersion" value={link.updated_at} />
            <section className="delegate-card">
              <span className="tag">Paso 2</span>
              <h2>Programa tecnico infantil</h2>
              <p className="muted">Marca lo trabajado en la clase. Puedes guardar varias veces antes de cerrar.</p>
              <label>
                Responsable
                <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
              </label>
              {query.saved === "kids-plan" ? <p className="save-ok">Programa infantil guardado correctamente.</p> : null}
              {query.error === "kids-plan" ? <p className="form-error">No se ha podido guardar el programa infantil{query.detail ? `: ${query.detail}` : "."}</p> : null}
            </section>
            {childSyllabusLoadError ? (
              <section className="delegate-step-card">
                <p className="form-error">No se ha podido cargar el programa infantil. Recarga la pagina antes de guardar o cerrar la clase.</p>
              </section>
            ) : (
              <>
                <DelegateChildPlanSection
                  plan={childPlan}
                  syllabusItems={childSyllabusItems ?? []}
                  historicalSyllabusItems={historicalChildSyllabusItems ?? []}
                  savedSyllabusItemIds={childPlan?.syllabus_item_ids ?? []}
                />
                <section className="delegate-submit-bar delegate-submit-bar-secondary">
                  <div>
                    <strong>Guardar programa</strong>
                    <span>La clase seguira abierta para poder modificarlo.</span>
                  </div>
                  <button type="submit">
                    <ClipboardCheck aria-hidden="true" size={18} />
                    Guardar programa
                  </button>
                </section>
                <section className="delegate-submit-bar">
                  <div>
                    <strong>Cerrar clase infantil</strong>
                    <span>Guarda el programa actual y cierra la clase en una sola accion.</span>
                  </div>
                  <ClosingClassButton name="intent" value="close">
                    <Send aria-hidden="true" size={18} />
                    Guardar y cerrar
                  </ClosingClassButton>
                </section>
              </>
            )}
          </form>
        </div>
      ) : adultClasses.length && step !== "attendance" ? (
        <form action={saveDelegateTechnicalStepAction} className="delegate-form delegate-flow">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value={mode} />
          <section className="delegate-card">
            <span className="tag">{mode === "combined" ? "Paso 2" : "Paso 1"}</span>
            <h2>Parte tecnica</h2>
            <p className="muted">Marca solo las tecnicas que se han trabajado. Despues pasas a asistencia de adultos.</p>
            <label>
              Responsable
              <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
            </label>
          </section>
          {query.error === "technical" ? (
            <p className="form-error">No se han podido guardar las tecnicas{query.detail ? `: ${query.detail}` : "."}</p>
          ) : null}
          {groupPlanByGrade(plan ?? []).map(([grade, items]) => (
            <article className="delegate-step-card" key={grade}>
              <h2>{grade}</h2>
              <div className="delegate-check-list">
                {items.map((item) => (
                  <label className="delegate-check" key={item.id}>
                    <input name="planIds" type="checkbox" value={item.id} defaultChecked={item.completed} />
                    <span>
                      <strong>{item.technique_name}</strong>
                      {item.summary_es ? <em>{item.summary_es}</em> : null}
                      <small>{item.category ?? "-"} · {item.proposal_type ?? item.target_grade ?? "-"}</small>
                    </span>
                  </label>
                ))}
              </div>
            </article>
          ))}
          <section className="delegate-submit-bar">
            <div>
              <strong>Siguiente</strong>
              <span>Guardar tecnicas y pasar asistencia adultos</span>
            </div>
            <button type="submit">
              <ClipboardCheck aria-hidden="true" size={18} />
              Asistencia
            </button>
          </section>
        </form>
      ) : (
        <form action={submitDelegateClassAction} className="delegate-form delegate-flow">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value={mode} />
          <section className="delegate-card">
            <span className="tag">{mode === "combined" ? "Paso 3" : adultClasses.length ? "Paso 2" : "Paso 1"}</span>
            <h2>{adultClasses.length ? "Asistencia adultos" : "Asistencia"}</h2>
            <p className="muted">Selecciona quienes han venido. En adultos puedes indicar si entrenan con otro grupo o si han estado ensenando.</p>
            <label>
              Responsable
              <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
            </label>
            {query.error === "attendance" ? <p className="form-error">Selecciona al menos un asistente.</p> : null}
            {query.error === "submit" ? (
              <p className="form-error">No se ha podido enviar la clase{query.detail ? `: ${query.detail}` : "."}</p>
            ) : null}
          </section>
          {attendanceClasses.map((clase) => (
            <DelegateAttendanceSection
              key={clase.id}
              clase={clase}
              members={(members ?? []).filter((member) => member.class === clase.class_group)}
              attendanceKeys={attendanceKeys}
              adultTrainingGradeOptions={adultTrainingGradeOptions()}
            />
          ))}
          <section className="delegate-submit-bar">
            <div>
              <strong>Enviar y cerrar</strong>
              <span>Guarda en el sistema nuevo y deja la clase cerrada.</span>
            </div>
            <ClosingClassButton>
              <Send aria-hidden="true" size={18} />
              Enviar y cerrar
            </ClosingClassButton>
          </section>
        </form>
      )}
    </main>
  );
}

function DelegateChildPlanSection({
  plan,
  syllabusItems,
  historicalSyllabusItems,
  savedSyllabusItemIds
}: {
  plan: ChildPlanRow | null;
  syllabusItems: ChildSyllabusItemRow[];
  historicalSyllabusItems: ChildSyllabusItemRow[];
  savedSyllabusItemIds: string[];
}) {
  const selectedActivities = new Set(plan?.activities ?? []);
  const selectedItems = new Set(plan?.syllabus_item_ids ?? []);
  const byGrade = new Map<string, ChildSyllabusItemRow[]>();
  syllabusItems.forEach((item) => {
    const grade = item.grade ?? "General";
    byGrade.set(grade, [...(byGrade.get(grade) ?? []), item]);
  });

  return (
    <section className="delegate-step-card delegate-child-plan">
      {savedSyllabusItemIds.map((id) => <input key={id} type="hidden" name="savedSyllabusItemIds" value={id} />)}
      {historicalSyllabusItems.length ? <p className="muted">Contenido historico conservado: {historicalSyllabusItems.map((item) => item.title).join(", ")}.</p> : null}
      <label>
        Objetivo del dia
        <select name="objective" defaultValue={plan?.objective ?? ""}>
          <option value="">Sin objetivo concreto</option>
          {delegateChildObjectives.map((objective) => <option key={objective} value={objective}>{objective}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>Actividades generales</legend>
        <div className="delegate-child-activity-grid">
          {delegateChildActivities.map((activity) => (
            <label className="delegate-check" key={activity.value}>
              <input name="activities" type="checkbox" value={activity.value} defaultChecked={selectedActivities.has(activity.value)} />
              <span><strong>{activity.label}</strong></span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Temario trabajado</legend>
        <p className="muted">Despliega los grados necesarios y marca solo lo practicado hoy.</p>
        {[...byGrade.entries()].map(([grade, items], index) => (
          <details className="delegate-child-grade" key={grade} open={index === 0 || items.some((item) => selectedItems.has(item.id))}>
            <summary><strong>{grade}</strong><span>{items.length} contenidos</span></summary>
            <div className="delegate-check-list">
              {items.map((item) => (
                <label className="delegate-check" key={item.id}>
                  <input name="syllabusItemIds" type="checkbox" value={item.id} defaultChecked={selectedItems.has(item.id)} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.category ?? "Contenido infantil"}</small>
                    {item.description ? <em>{item.description}</em> : null}
                  </span>
                </label>
              ))}
            </div>
          </details>
        ))}
      </fieldset>
      <label>
        Nota de la clase
        <textarea name="notes" rows={3} defaultValue={plan?.notes ?? ""} placeholder="Observaciones para Alvaro..." />
      </label>
    </section>
  );
}

function DelegateAttendanceSection({
  clase,
  members,
  attendanceKeys,
  adultTrainingGradeOptions
}: {
  clase: ClassRow;
  members: MemberOption[];
  attendanceKeys: Set<string>;
  adultTrainingGradeOptions: string[];
}) {
  const pendingMembers = members.filter((member) => !attendanceKeys.has(`${clase.id}:${member.id}`));
  return (
    <section className="delegate-step-card" key={clase.id}>
      <h2>{clase.class_group === "adults" ? "Adultos" : "Ninos"}</h2>
      <p className="muted">{clase.name}</p>
      <div className="delegate-check-list">
        {pendingMembers.length ? pendingMembers.map((member) => (
          <label className="delegate-check delegate-check-with-options" key={member.id}>
            <input name={`memberIds:${clase.id}`} type="checkbox" value={member.id} />
            <AttendanceAvatar name={member.display_name} photoUrl={member.photo_url} />
            <span>
              <strong>{member.display_name}</strong>
              <small>{member.grade ?? "Sin grado"}</small>
            </span>
            {clase.class_group === "adults" ? (
              <span className="delegate-attendance-options">
                <select name={`trainedGrade:${clase.id}:${member.id}`} defaultValue="">
                  <option value="">Su grupo ({member.grade ?? "automatico"})</option>
                  {adultTrainingGradeOptions.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                </select>
                <select name={`technicalRole:${clase.id}:${member.id}`} defaultValue="student">
                  <option value="student">Entrena</option>
                  <option value="teaching">Ensenando +1</option>
                  <option value="support">Apoyo</option>
                  <option value="reviewing">Repaso</option>
                  <option value="observing">Observa</option>
                </select>
              </span>
            ) : null}
          </label>
        )) : <p className="muted">Ya no quedan kenshis pendientes.</p>}
      </div>
    </section>
  );
}

function AttendanceAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const src = driveImageUrl(photoUrl);
  return src
    ? <img className="attendance-avatar" src={src} alt={`Foto de ${name}`} />
    : <span className="attendance-avatar attendance-avatar-placeholder" aria-hidden="true">{initials(name)}</span>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
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

function normalizeDelegateMode(value: string | null | undefined): DelegateMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["kids", "ninos", "niños"].includes(normalized)) return "kids";
  if (["combined", "combinado"].includes(normalized)) return "combined";
  if (["adults", "adultos"].includes(normalized)) return "adults";
  return null;
}

function adultTrainingGradeOptions() {
  return adultGrades.filter((grade) => gradeSortValue(grade) <= gradeSortValue("5 DAN"));
}

function gradeSortValue(grade: string) {
  const normalized = String(grade ?? "").trim().toUpperCase();
  const order = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN"];
  const index = order.indexOf(normalized);
  return index === -1 ? 999 : index;
}

function delegateModeFromCreatedBy(value: string | null | undefined): DelegateMode | null {
  const [, mode] = String(value ?? "").split(":");
  return normalizeDelegateMode(mode);
}
