import { Check, ClipboardCheck, Play, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { saveDelegateTechnicalStepAction, startDelegateClassAction, submitDelegateClassAction } from "@/app/actions";
import { adultGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";

type DelegateMode = "adults" | "kids" | "combined";

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

type MemberOption = {
  id: string;
  display_name: string;
  grade: string | null;
  class: "kids" | "adults";
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
    .select("id,class_id,token,delegate_name,expires_at,started_at,closed_at,revoked_at,created_by")
    .eq("token", token)
    .single<LinkRow>();

  if (linkError || !link) notFound();

  const { data: primaryClass, error: classError } = await supabase
    .from("classes")
    .select("id,class_date,name,class_group,closed,status")
    .eq("id", link.class_id)
    .single<ClassRow>();

  if (classError || !primaryClass) notFound();

  const mode = requestedMode ?? delegateModeFromCreatedBy(link.created_by) ?? primaryClass.class_group;
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
  const isUnavailable = Boolean(link.revoked_at || link.closed_at || isExpired || !usableClasses.length);
  const hasStarted = Boolean(link.started_at || query.started || mode === "kids");
  const step = normalizeDelegateStep(query.step, mode, hasStarted, kidsClasses.length > 0, adultClasses.length > 0);

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
      .select("id,display_name,grade,class")
      .in("class", classGroups)
      .eq("status", "active")
      .order("display_name")
      .returns<MemberOption[]>()
  ]) : [{ data: [] }, { data: [] }, { data: [] }];

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
        <section className="delegate-card delegate-success">
          <Check aria-hidden="true" size={28} />
          <h2>Clase enviada</h2>
          <p>Gracias. La asistencia y el trabajo de clase han quedado guardados en SKBC.</p>
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
          <input type="hidden" name="nextStep" value="technical" />
          <section className="delegate-card">
            <span className="tag">Paso 1</span>
            <h2>Asistencia ninos</h2>
            <p className="muted">Primero registra la clase infantil. Despues el enlace pasara al plan tecnico de adultos.</p>
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
              <span>Continua despues con adultos.</span>
            </div>
            <button type="submit">
              <Send aria-hidden="true" size={18} />
              Guardar y seguir
            </button>
          </section>
        </form>
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
          {(step === "attendance" ? adultClasses : [...adultClasses, ...kidsClasses]).map((clase) => (
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
            <button type="submit">
              <Send aria-hidden="true" size={18} />
              Enviar
            </button>
          </section>
        </form>
      )}
    </main>
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

function normalizeDelegateStep(
  value: string | null | undefined,
  mode: DelegateMode,
  hasStarted: boolean,
  hasKidsClass: boolean,
  hasAdultClass: boolean
) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["start", "kids-attendance", "technical", "attendance"].includes(normalized)) return normalized;
  if (!hasStarted) return "start";
  if (mode === "combined") return hasKidsClass ? "kids-attendance" : hasAdultClass ? "technical" : "attendance";
  if (mode === "kids") return "attendance";
  return hasAdultClass ? "technical" : "attendance";
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
