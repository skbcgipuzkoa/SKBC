import { Award, CheckCircle2, LogOut, Plus, ShieldAlert } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { createBlackBeltSpecialClassAction, logoutAction, saveBlackBeltAttendanceAction, saveBlackBeltEligibilityRosterAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  grade: string | null;
};

type Eligibility = {
  member_id: string;
  active: boolean;
  eligible_from: string;
  eligible_until: string | null;
  reason: string | null;
  notes: string | null;
};

type SpecialClass = {
  id: string;
  class_date: string;
  title: string;
  instructor: string | null;
  closed: boolean;
  notes: string | null;
};

type SpecialAttendance = {
  special_class_id: string;
  member_id: string;
  status: "present" | "justified" | "absent";
  notes: string | null;
};

export default async function BlackBeltClassesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; classId?: string }>;
}) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members }, { data: eligibilities }, { data: sessions }, { data: attendance }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,grade")
      .eq("class", "adults")
      .eq("status", "active")
      .order("grade")
      .order("display_name")
      .returns<Member[]>(),
    supabase
      .from("black_belt_class_eligibility")
      .select("member_id,active,eligible_from,eligible_until,reason,notes")
      .returns<Eligibility[]>(),
    supabase
      .from("black_belt_special_classes")
      .select("id,class_date,title,instructor,closed,notes")
      .order("class_date", { ascending: false })
      .limit(12)
      .returns<SpecialClass[]>(),
    supabase
      .from("black_belt_special_attendance")
      .select("special_class_id,member_id,status,notes")
      .returns<SpecialAttendance[]>()
  ]);

  const eligibilityByMember = new Map((eligibilities ?? []).map((row) => [row.member_id, row]));
  const eligibleMembers = (members ?? []).filter((member) => eligibilityByMember.get(member.id)?.active);
  const selectedSession = (sessions ?? []).find((session) => session.id === params.classId) ?? sessions?.[0] ?? null;
  const attendanceByKey = new Map((attendance ?? []).map((row) => [`${row.special_class_id}:${row.member_id}`, row]));
  const presentCount = (attendance ?? []).filter((row) => row.status === "present").length;
  const absentCount = (attendance ?? []).filter((row) => row.status === "absent").length;
  const selectedAttendance = selectedSession ? (attendance ?? []).filter((row) => row.special_class_id === selectedSession.id) : [];
  const selectedPresentCount = selectedAttendance.filter((row) => row.status === "present").length;
  const selectedJustifiedCount = selectedAttendance.filter((row) => row.status === "justified").length;
  const selectedAbsentCount = selectedAttendance.filter((row) => row.status === "absent").length;

  return (
    <div className="shell">
      <SidebarNav current="/clases-negras" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Cada 15 dias - sabado avanzado</p>
            <h1>Clases Busen</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir"><LogOut aria-hidden="true" size={18} /></button>
          </form>
        </div>

        {params.saved ? <p className="save-ok">Cambios guardados.</p> : null}
        {params.error ? <p className="form-error">No se pudo guardar el cambio.</p> : null}

        <section className="grid stats compact">
          <article className="card"><Award size={20} /><h2>Aptos</h2><div className="metric">{eligibleMembers.length}</div></article>
          <article className="card"><CheckCircle2 size={20} /><h2>Asistencias registradas</h2><div className="metric">{presentCount}</div></article>
          <article className={absentCount ? "card attention-card" : "card"}><ShieldAlert size={20} /><h2>Ausencias</h2><div className="metric">{absentCount}</div></article>
        </section>

        <section className="split-section">
          <article className="card">
            <h2>Crear sesion Busen</h2>
            <form action={createBlackBeltSpecialClassAction} className="quick-form">
              <label>Fecha<input name="classDate" type="date" required /></label>
              <label>Titulo<input name="title" defaultValue="Clase Busen" /></label>
              <label>Instructor<input name="instructor" defaultValue="Alvaro" /></label>
              <label className="wide">Notas<textarea name="notes" rows={3} /></label>
              <button type="submit"><Plus size={16} /> Crear/actualizar sesion</button>
            </form>
          </article>
          <article className="card busen-explain-card">
            <h2>Area Busen</h2>
            <p className="muted">Primero define quienes pertenecen al grupo Busen. Despues, cada sesion registra asistencia solo de ese grupo.</p>
            <p className="muted">Las ausencias Busen son propias de Busen y no se mezclan con las asistencias normales de clase.</p>
          </article>
        </section>

        <details className="card busen-foldable">
          <summary>
            <div>
              <h2>Kenshis del grupo Busen</h2>
              <p className="muted">Activa el switch de quien puede asistir a Busen. Puedes dejar notas internas por kenshi.</p>
            </div>
            <span className="tag">{eligibleMembers.length} activos</span>
          </summary>
          <form action={saveBlackBeltEligibilityRosterAction} className="busen-roster-form">
            <div className="busen-roster-list">
              {(members ?? []).map((member) => {
                const eligibility = eligibilityByMember.get(member.id);
                return (
                  <div className="busen-roster-row" key={member.id}>
                    <input type="hidden" name="memberIds" value={member.id} />
                    <label className="switch-field">
                      <input name="activeMemberIds" type="checkbox" value={member.id} defaultChecked={Boolean(eligibility?.active)} />
                      <span aria-hidden="true" />
                    </label>
                    <strong>{member.display_name}<small>{member.grade ?? "-"}</small></strong>
                    <input name={`reason:${member.id}`} defaultValue={eligibility?.reason ?? ""} placeholder="Motivo: Busen / invitado" />
                    <input name={`notes:${member.id}`} defaultValue={eligibility?.notes ?? ""} placeholder="Nota interna" />
                    <input name={`eligibleFrom:${member.id}`} type="date" defaultValue={eligibility?.eligible_from ?? new Date().toISOString().slice(0, 10)} />
                    <input name={`eligibleUntil:${member.id}`} type="date" defaultValue={eligibility?.eligible_until ?? ""} />
                  </div>
                );
              })}
            </div>
            <button type="submit">Guardar grupo Busen</button>
          </form>
        </details>

        <section className="card">
          <h2>Sesiones</h2>
          <div className="link-stack">
            {(sessions ?? []).map((session) => (
              <a className={selectedSession?.id === session.id ? "mini-action selected" : "mini-action"} href={`/clases-negras?classId=${session.id}`} key={session.id}>
                {session.class_date} {session.closed ? "- cerrada" : ""}
              </a>
            ))}
          </div>
        </section>

        {selectedSession ? (
          <details className="card busen-foldable" open={!selectedSession.closed}>
            <summary>
              <div>
                <h2>{selectedSession.title}</h2>
                <p className="muted">{selectedSession.class_date} - {selectedSession.instructor ?? "Sin instructor"} - {selectedSession.notes ?? "Sin notas"}</p>
              </div>
              <span className="tag">{selectedPresentCount} presentes · {selectedJustifiedCount} just. · {selectedAbsentCount} aus.</span>
            </summary>
            <form action={saveBlackBeltAttendanceAction} className="black-belt-attendance-form">
              <input type="hidden" name="classId" value={selectedSession.id} />
              <div className="attendance-checklist">
                {eligibleMembers.length ? eligibleMembers.map((member) => {
                  const row = attendanceByKey.get(`${selectedSession.id}:${member.id}`);
                  return (
                    <div className="black-belt-row" key={member.id}>
                      <strong>{member.display_name}<small>{member.grade ?? "-"}</small></strong>
                      <select name={`status:${member.id}`} defaultValue={row?.status ?? "absent"}>
                        <option value="present">Presente</option>
                        <option value="justified">Justificado</option>
                        <option value="absent">Ausente</option>
                      </select>
                      <input name={`notes:${member.id}`} defaultValue={row?.notes ?? ""} placeholder="Nota / justificacion" />
                    </div>
                  );
                }) : <p className="muted">Primero activa kenshis en el grupo Busen.</p>}
              </div>
              <label className="checkbox-field"><input name="close" type="checkbox" defaultChecked={selectedSession.closed} /> Cerrar sesion</label>
              <button type="submit">Guardar asistencia especial</button>
            </form>
          </details>
        ) : <p className="muted">Crea una sesion especial para registrar asistencia.</p>}
      </main>
    </div>
  );
}
