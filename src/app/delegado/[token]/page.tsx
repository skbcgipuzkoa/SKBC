import { Check, Play, Send } from "lucide-react";
import { notFound } from "next/navigation";
import { startDelegateClassAction, submitDelegateClassAction } from "@/app/actions";
import { createAdminClient } from "@/lib/supabase/admin";

type LinkRow = {
  id: string;
  class_id: string;
  token: string;
  delegate_name: string | null;
  expires_at: string;
  started_at: string | null;
  closed_at: string | null;
  revoked_at: string | null;
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
  group_grade: string | null;
  target_grade: string | null;
  technique_name: string;
  category: string | null;
  proposal_type: string | null;
  completed: boolean;
};

type AttendanceRow = {
  member_id: string;
};

type MemberOption = {
  id: string;
  display_name: string;
  grade: string | null;
};

export default async function DelegateClassPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ started?: string; saved?: string; error?: string; detail?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const supabase = createAdminClient();

  const { data: link, error: linkError } = await supabase
    .from("class_delegate_links")
    .select("id,class_id,token,delegate_name,expires_at,started_at,closed_at,revoked_at")
    .eq("token", token)
    .single<LinkRow>();

  if (linkError || !link) notFound();

  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,class_date,name,class_group,closed,status")
    .eq("id", link.class_id)
    .single<ClassRow>();

  if (classError || !clase) notFound();

  const isExpired = new Date(link.expires_at).getTime() < Date.now();
  const isUnavailable = Boolean(link.revoked_at || link.closed_at || clase.closed || isExpired);
  const hasStarted = Boolean(link.started_at || query.started || clase.class_group === "kids");

  const [{ data: plan }, { data: attendance }, { data: classMembers }] = await Promise.all([
    supabase
      .from("technical_plans")
      .select("id,group_grade,target_grade,technique_name,category,proposal_type,completed")
      .eq("class_id", clase.id)
      .order("group_grade")
      .order("suggested_order")
      .returns<PlanRow[]>(),
    supabase
      .from("attendance_logs")
      .select("member_id")
      .eq("class_id", clase.id)
      .returns<AttendanceRow[]>(),
    supabase
      .from("members")
      .select("id,display_name,grade")
      .eq("class", clase.class_group)
      .eq("status", "active")
      .order("display_name")
      .returns<MemberOption[]>()
  ]);

  const attendanceMemberIds = new Set((attendance ?? []).map((item) => item.member_id));
  const pendingMembers = (classMembers ?? []).filter((member) => !attendanceMemberIds.has(member.id));
  const groupedPlan = groupPlanByGrade(plan ?? []);

  return (
    <main className="delegate-page">
      <section className="delegate-hero">
        <span>{clase.class_group === "adults" ? "Clase adultos" : "Clase ninos"}</span>
        <h1>{clase.name}</h1>
        <p>{clase.class_date}</p>
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
          <p className="muted">
            Este enlace ha caducado, ha sido usado o la clase ya esta cerrada.
          </p>
        </section>
      ) : !hasStarted ? (
        <section className="delegate-card">
          <h2>Iniciar clase</h2>
          <p className="muted">
            Pulsa iniciar. El sistema preparara automaticamente los grupos y el plan tecnico adulto.
          </p>
          {query.error ? <p className="form-error">No se ha podido iniciar la clase.</p> : null}
          <form action={startDelegateClassAction} className="delegate-form">
            <input type="hidden" name="token" value={token} />
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
      ) : (
        <form action={submitDelegateClassAction} className="delegate-form delegate-flow">
          <input type="hidden" name="token" value={token} />
          <section className="delegate-card">
            <h2>Responsable</h2>
            <label>
              Tu nombre
              <input name="delegateName" defaultValue={link.delegate_name ?? ""} placeholder="Nombre del sustituto" />
            </label>
          </section>

          {clase.class_group === "adults" ? (
            <section className="delegate-step-card">
              <div>
                <span className="tag">1</span>
                <h2>Tecnicas realizadas</h2>
                <p className="muted">Marca solo las tecnicas que se han trabajado hoy.</p>
              </div>
              {groupedPlan.length ? groupedPlan.map(([grade, items]) => (
                <article className="delegate-plan-group" key={grade}>
                  <h3>{grade}</h3>
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
              )) : (
                <p className="muted">El plan aun se esta preparando. Vuelve a pulsar iniciar clase.</p>
              )}
            </section>
          ) : null}

          <section className="delegate-step-card">
            <div>
              <span className="tag">{clase.class_group === "adults" ? "2" : "1"}</span>
              <h2>Asistencia</h2>
              <p className="muted">Selecciona quienes han venido a clase.</p>
            </div>
            {query.error === "attendance" ? <p className="form-error">Selecciona al menos un asistente.</p> : null}
            {query.error === "submit" ? (
              <p className="form-error">No se ha podido enviar la clase{query.detail ? `: ${query.detail}` : "."}</p>
            ) : null}
            <div className="delegate-check-list">
              {pendingMembers.length ? pendingMembers.map((member) => (
                <label className="delegate-check" key={member.id}>
                  <input name="memberIds" type="checkbox" value={member.id} />
                  <span>
                    <strong>{member.display_name}</strong>
                    <small>{member.grade ?? "Sin grado"}</small>
                  </span>
                </label>
              )) : <p className="muted">Ya no quedan kenshis pendientes de asistencia.</p>}
            </div>
          </section>

          <section className="delegate-submit-bar">
            <div>
              <strong>Enviar y cerrar</strong>
              <span>Guarda en el sistema nuevo y deja la clase cerrada.</span>
            </div>
            <button type="submit" disabled={!pendingMembers.length}>
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
