import { Check, ClipboardCheck, Play, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { saveDelegateTechnicalStepAction, startDelegateClassAction, submitDelegateClassAction } from "@/app/actions";
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
  category: string | null;
  proposal_type: string | null;
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
  const isUnavailable = Boolean(link.revoked_at || link.closed_at || isExpired || !usableClasses.length || (mode === "combined" && usableClasses.length < 2));
  const hasStarted = Boolean(link.started_at || query.started || mode === "kids");
  const step = query.step ?? (hasStarted ? (adultClasses.length ? "technical" : "attendance") : "start");

  const classIds = usableClasses.map((clase) => clase.id);
  const [{ data: plan }, { data: attendance }, { data: members }] = classIds.length ? await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,class_id,group_grade,target_grade,technique_name,category,proposal_type,completed")
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
        <span>{title}</span>
        <h1>{primaryName}</h1>
        <p>{primaryClass.class_date}</p>
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
      ) : adultClasses.length && step !== "attendance" ? (
        <form action={saveDelegateTechnicalStepAction} className="delegate-form delegate-flow">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="mode" value={mode} />
          <section className="delegate-card">
            <span className="tag">Paso 1</span>
            <h2>Parte tecnica</h2>
            <p className="muted">Marca solo las tecnicas que se han trabajado. Despues pasas a asistencia.</p>
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
              <span>Guardar tecnicas y pasar asistencia</span>
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
            <span className="tag">{adultClasses.length ? "Paso 2" : "Paso 1"}</span>
            <h2>Asistencia</h2>
            <p className="muted">Selecciona quienes han venido y envia la clase.</p>
            <label>
              Responsable
              <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
            </label>
            {query.error === "attendance" ? <p className="form-error">Selecciona al menos un asistente.</p> : null}
            {query.error === "submit" ? (
              <p className="form-error">No se ha podido enviar la clase{query.detail ? `: ${query.detail}` : "."}</p>
            ) : null}
          </section>
          {[...adultClasses, ...kidsClasses].map((clase) => {
            const pendingMembers = (members ?? [])
              .filter((member) => member.class === clase.class_group)
              .filter((member) => !attendanceKeys.has(`${clase.id}:${member.id}`));
            return (
              <section className="delegate-step-card" key={clase.id}>
                <h2>{clase.class_group === "adults" ? "Adultos" : "Ninos"}</h2>
                <p className="muted">{clase.name}</p>
                <div className="delegate-check-list">
                  {pendingMembers.length ? pendingMembers.map((member) => (
                    <label className="delegate-check" key={member.id}>
                      <input name={`memberIds:${clase.id}`} type="checkbox" value={member.id} />
                      <span>
                        <strong>{member.display_name}</strong>
                        <small>{member.grade ?? "Sin grado"}</small>
                      </span>
                    </label>
                  )) : <p className="muted">Ya no quedan kenshis pendientes.</p>}
                </div>
              </section>
            );
          })}
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

function delegateModeFromCreatedBy(value: string | null | undefined): DelegateMode | null {
  const [, mode] = String(value ?? "").split(":");
  return normalizeDelegateMode(mode);
}
