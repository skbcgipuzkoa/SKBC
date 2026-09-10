import { AlertTriangle, Bell, CheckCircle2, LogOut, Pin } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { SeasonReviewSelector } from "@/app/avisos/SeasonReviewSelector";
import { createInternalNoticeAction, logoutAction, markFreeTrialNoticeReadAction, updateInternalNoticeStatusAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type InternalNotice = {
  id: string;
  title: string;
  body: string | null;
  area: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "in_progress" | "done" | "archived";
  due_on: string | null;
  pinned: boolean;
  created_by: string | null;
  resolved_on: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

type FreeTrialMember = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  joined_on: string | null;
  free_trial_started_on: string | null;
  free_trial_ends_on: string | null;
  free_trial_notice_read_at: string | null;
};

type ExamNoticeMember = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  joined_on: string | null;
  birth_date: string | null;
  semaphore: string | null;
  next_exam_on: string | null;
  exam_notice: string | null;
  attendance_count: number | null;
  minimum_attendance: number | null;
  missing_attendance: number | null;
};

type TransitionCandidate = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  grade: string | null;
  joined_on: string | null;
  birth_date: string | null;
};

type BusenAttendance = {
  member_id: string;
  status: "present" | "justified" | "absent";
  black_belt_special_classes: { class_date: string } | null;
};

type ShakujoAttendance = {
  member_id: string;
  shakujo_classes: { class_date: string } | null;
};

type ReviewMember = {
  id: string;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  joined_on: string | null;
};

export const dynamic = "force-dynamic";

export default async function AvisosPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; status?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const selectedStatus = params.status ?? "active";
  const supabase = createAdminClient();
  const readArchiveLimit = addDays(today(), -30);
  const trialEnd = addDays(today(), 7);
  const [
    { data, error },
    trialResult,
    examResult,
    busenEligibilityResult,
    busenAttendanceResult,
    shakujoAttendanceResult,
    reviewMembersResult
  ] = await Promise.all([
    supabase
      .from("internal_notices")
      .select("id,title,body,area,priority,status,due_on,pinned,created_by,resolved_on,resolved_by,created_at,updated_at")
      .order("pinned", { ascending: false })
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<InternalNotice[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,joined_on,free_trial_started_on,free_trial_ends_on,free_trial_notice_read_at")
      .eq("status", "active")
      .eq("free_trial_enabled", true)
      .not("free_trial_ends_on", "is", null)
      .lte("free_trial_ends_on", trialEnd)
      .order("free_trial_ends_on", { ascending: true })
      .returns<FreeTrialMember[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,joined_on,birth_date,semaphore,next_exam_on,exam_notice,attendance_count,minimum_attendance,missing_attendance")
      .eq("status", "active")
      .order("next_exam_on", { ascending: true, nullsFirst: false })
      .returns<ExamNoticeMember[]>(),
    supabase
      .from("black_belt_class_eligibility")
      .select("member_id,active,eligible_from,eligible_until")
      .eq("active", true)
      .returns<Array<{ member_id: string; active: boolean; eligible_from: string; eligible_until: string | null }>>(),
    supabase
      .from("black_belt_special_attendance")
      .select("member_id,status,black_belt_special_classes(class_date)")
      .gte("created_at", addDays(today(), -180))
      .returns<BusenAttendance[]>(),
    supabase
      .from("shakujo_attendance")
      .select("member_id,shakujo_classes(class_date)")
      .gte("created_at", addDays(today(), -180))
      .returns<ShakujoAttendance[]>(),
    supabase
      .from("members")
      .select("id,display_name,class,grade,joined_on")
      .eq("status", "active")
      .order("class", { ascending: false })
      .order("display_name", { ascending: true })
      .returns<ReviewMember[]>()
  ]);

  if (error) throw error;
  if (trialResult.error) throw trialResult.error;
  if (examResult.error) throw examResult.error;
  if (busenEligibilityResult.error) throw busenEligibilityResult.error;
  if (busenAttendanceResult.error) throw busenAttendanceResult.error;
  if (shakujoAttendanceResult.error) throw shakujoAttendanceResult.error;
  if (reviewMembersResult.error) throw reviewMembersResult.error;

  const notices = data ?? [];
  const examMembers = examResult.data ?? [];
  const trialNotices = (trialResult.data ?? []).filter((member) => !member.free_trial_notice_read_at || member.free_trial_notice_read_at.slice(0, 10) >= readArchiveLimit);
  const unreadTrialNotices = trialNotices.filter((member) => !member.free_trial_notice_read_at);
  const transitionCandidates = buildTransitionCandidates(examMembers);
  const upcomingExamNotices = buildUpcomingExamNotices(examMembers);
  const busenNotices = buildBusenNotices(examMembers, busenEligibilityResult.data ?? [], busenAttendanceResult.data ?? []);
  const shakujoNotices = buildShakujoNotices(examMembers, shakujoAttendanceResult.data ?? []);
  const active = notices.filter((notice) => ["open", "in_progress"].includes(notice.status));
  const overdue = active.filter((notice) => notice.due_on && notice.due_on < today());
  const visible = selectedStatus === "done"
    ? notices.filter((notice) => notice.status === "done")
    : selectedStatus === "archived"
      ? notices.filter((notice) => notice.status === "archived")
      : active;

  return (
    <div className="shell">
      <SidebarNav current="/avisos" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Recordatorios internos</p>
            <h1>Avisos del club</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "notice" ? <p className="save-ok">Aviso actualizado correctamente.</p> : null}
        {params.saved === "trial" ? <p className="save-ok">Aviso de mes gratis marcado como leido.</p> : null}
        {params.error === "notice" ? <p className="form-error">No se ha podido guardar el aviso.</p> : null}
        {params.error === "trial" ? <p className="form-error">No se ha podido actualizar el aviso de mes gratis.</p> : null}

        <section className="grid stats compact">
          <article className={active.length ? "card attention-card" : "card"}>
            <Bell aria-hidden="true" size={20} />
            <h2>Activos</h2>
            <div className="metric">{active.length}</div>
            <p className="muted">Avisos abiertos o en curso.</p>
          </article>
          <article className={overdue.length ? "card attention-card" : "card"}>
            <AlertTriangle aria-hidden="true" size={20} />
            <h2>Vencidos</h2>
            <div className="metric">{overdue.length}</div>
            <p className="muted">Tienen fecha anterior a hoy.</p>
          </article>
          <article className="card">
            <Pin aria-hidden="true" size={20} />
            <h2>Fijados</h2>
            <div className="metric">{active.filter((notice) => notice.pinned).length}</div>
            <p className="muted">Prioridad visual arriba.</p>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Cerrados</h2>
            <div className="metric">{notices.filter((notice) => notice.status === "done").length}</div>
            <p className="muted">Quedan guardados como historial.</p>
          </article>
        </section>

        <SeasonReviewSelector members={reviewMembersResult.data ?? []} />

        <section className={unreadTrialNotices.length ? "card attention-card blink-alert" : "card"}>
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Promocion primer mes</p>
              <h2>Mes gratis por revisar</h2>
              <p className="muted">Altas activas cuyo mes de prueba vence esta semana o vencio recientemente. Tambien entra en el parte diario de Telegram.</p>
            </div>
            <span className={unreadTrialNotices.length ? "state-badge state-pendiente" : "state-badge state-completada"}>
              {unreadTrialNotices.length} sin leer
            </span>
          </div>
          {trialNotices.length ? (
            <div className="notice-admin-list compact-list">
              {trialNotices.map((member) => {
                const state = trialState(member.free_trial_ends_on);
                return (
                  <article className={`notice-admin-card ${state.className}`} key={member.id}>
                    <div className="notice-admin-head">
                      <div>
                        <span className="notice-admin-meta">{member.class === "kids" ? "Ninos" : "Adultos"} · {member.grade ?? "Sin grado"}</span>
                        <h2>{member.display_name}</h2>
                      </div>
                      <span className={`state-badge ${state.badge}`}>{state.label}</span>
                    </div>
                    <p>
                      Ingreso: {member.joined_on ? formatShortDate(member.joined_on) : "-"} ·
                      Fin mes gratis: {member.free_trial_ends_on ? formatShortDate(member.free_trial_ends_on) : "-"}
                    </p>
                    <div className="notice-action-row">
                      {member.legacy_id ? <a className="secondary-button" href={`/kenshis/${member.legacy_id}`}>Abrir kenshi</a> : null}
                      {member.free_trial_notice_read_at ? (
                        <span className="muted">Leido {formatDate(member.free_trial_notice_read_at)}</span>
                      ) : (
                        <form action={markFreeTrialNoticeReadAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <input type="hidden" name="returnPath" value="/avisos" />
                          <SubmitButton pendingLabel="Marcando...">Marcar leido</SubmitButton>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="muted">No hay meses gratis venciendo ahora.</p>
          )}
        </section>

        <section className={transitionCandidates.length ? "card attention-card" : "card"}>
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Cambio de etapa</p>
              <h2>Niños a revisar para pasar a adultos</h2>
              <p className="muted">Candidatos por edad, grado avanzado o mucha antiguedad infantil. Si falta fecha de nacimiento, queda como revision manual.</p>
            </div>
            <span className={transitionCandidates.length ? "state-badge state-en-progreso" : "state-badge state-completada"}>
              {transitionCandidates.length} candidatos
            </span>
          </div>
          <NoticeMemberList rows={transitionCandidates} empty="No hay niños candidatos ahora mismo." />
        </section>

        <section className={upcomingExamNotices.length ? "card attention-card" : "card"}>
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Convocatorias</p>
              <h2>Proximos a examen</h2>
              <p className="muted">Kenshis dentro de ventana de convocatoria o cerca de estar listos. Incluye que les falta de forma resumida.</p>
            </div>
            <a className="secondary-button" href="/proximos-examenes">Ver semaforos</a>
          </div>
          <NoticeMemberList rows={upcomingExamNotices} empty="No hay kenshis cerca de examen ahora mismo." />
        </section>

        <section className={(busenNotices.length || shakujoNotices.length) ? "card attention-card" : "card"}>
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Implicacion avanzada</p>
              <h2>Busen y Shakujo</h2>
              <p className="muted">Avisos internos para no perder de vista ausencias Busen y participacion Shakujo.</p>
            </div>
            <div className="notice-action-row">
              <a className="secondary-button" href="/clases-negras">Busen</a>
              <a className="secondary-button" href="/shakujo">Shakujo</a>
            </div>
          </div>
          <div className="notice-split-list">
            <div>
              <h3>Busen</h3>
              <NoticeMemberList rows={busenNotices} empty="Sin avisos Busen." compact />
            </div>
            <div>
              <h3>Shakujo</h3>
              <NoticeMemberList rows={shakujoNotices} empty="Sin avisos Shakujo." compact />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Crear aviso interno</h2>
              <p className="muted">Para cosas que no deben olvidarse: revisar una ficha, corregir datos, preparar diplomas, hablar con una familia o cualquier tarea del club.</p>
            </div>
          </div>
          <form className="form-grid" action={createInternalNoticeAction}>
            <label className="wide">Titulo<input name="title" placeholder="Ej. Revisar asistencia de la clase del jueves" required /></label>
            <label>
              Area
              <select name="area" defaultValue="general">
                <option value="general">General</option>
                <option value="clases">Clases</option>
                <option value="kenshis">Kenshis</option>
                <option value="examenes">Examenes</option>
                <option value="cursos">Cursos</option>
                <option value="entregas">Entregas</option>
                <option value="fichas">Fichas</option>
                <option value="sistema">Sistema</option>
              </select>
            </label>
            <label>
              Prioridad
              <select name="priority" defaultValue="normal">
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label>Fecha limite<input type="date" name="dueOn" /></label>
            <label>Responsable<input name="createdBy" defaultValue="Alvaro" /></label>
            <label className="checkbox-line">
              <input type="checkbox" name="pinned" />
              Fijar arriba
            </label>
            <label className="wide">Detalle<textarea name="body" rows={4} placeholder="Contexto, alumno afectado, que hay que comprobar..." /></label>
            <div className="form-actions wide">
              <SubmitButton pendingLabel="Guardando aviso...">Crear aviso</SubmitButton>
            </div>
          </form>
        </section>

        <div className="segmented-tabs">
          <a className={selectedStatus === "active" ? "active" : ""} href="/avisos">Activos</a>
          <a className={selectedStatus === "done" ? "active" : ""} href="/avisos?status=done">Cerrados</a>
          <a className={selectedStatus === "archived" ? "active" : ""} href="/avisos?status=archived">Archivados</a>
        </div>

        <section className="notice-admin-list">
          {visible.length ? visible.map((notice) => (
            <article className={`notice-admin-card notice-priority-${notice.priority}`} key={notice.id}>
              <div className="notice-admin-head">
                <div>
                  <span className="notice-admin-meta">{areaLabel(notice.area)} · {priorityLabel(notice.priority)}</span>
                  <h2>{notice.title}</h2>
                </div>
                <span className={`state-badge ${statusClass(notice.status)}`}>{statusLabel(notice.status)}</span>
              </div>
              {notice.body ? <p>{notice.body}</p> : <p className="muted">Sin detalle.</p>}
              <div className="notice-admin-foot">
                <span>Creado por {notice.created_by ?? "-"} · {formatDate(notice.created_at)}</span>
                <span>{notice.due_on ? `Limite ${formatShortDate(notice.due_on)}` : "Sin fecha limite"}</span>
                {notice.pinned ? <span>Fijado</span> : null}
              </div>
              <div className="notice-action-row">
                {notice.status !== "open" ? <StatusForm id={notice.id} status="open" label="Reabrir" /> : null}
                {notice.status !== "in_progress" && notice.status !== "done" && notice.status !== "archived" ? <StatusForm id={notice.id} status="in_progress" label="En curso" /> : null}
                {notice.status !== "done" && notice.status !== "archived" ? <StatusForm id={notice.id} status="done" label="Cerrar" primary /> : null}
                {notice.status !== "archived" ? <StatusForm id={notice.id} status="archived" label="Archivar" /> : null}
              </div>
            </article>
          )) : (
            <article className="card">
              <p className="muted">No hay avisos en esta vista.</p>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

function StatusForm({ id, status, label, primary = false }: { id: string; status: string; label: string; primary?: boolean }) {
  return (
    <form action={updateInternalNoticeStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="resolvedBy" value="Alvaro" />
      <SubmitButton className={primary ? undefined : "secondary-button"} pendingLabel="Guardando...">{label}</SubmitButton>
    </form>
  );
}

type NoticeMemberRow = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  grade: string | null;
  detail: string;
  tone?: "danger" | "warn" | "info" | "ok";
};

function NoticeMemberList({ rows, empty, compact = false }: { rows: NoticeMemberRow[]; empty: string; compact?: boolean }) {
  if (!rows.length) return <p className="muted">{empty}</p>;

  return (
    <div className={compact ? "notice-member-list compact-list" : "notice-member-list"}>
      {rows.map((row) => (
        <article className={`notice-member-row notice-member-${row.tone ?? "info"}`} key={`${row.id}-${row.detail}`}>
          <div>
            <h3>{row.display_name}</h3>
            <p className="muted">{row.grade ?? "Sin grado"} - {row.detail}</p>
          </div>
          {row.legacy_id ? <a className="secondary-button" href={`/kenshis/${row.legacy_id}`}>Abrir</a> : null}
        </article>
      ))}
    </div>
  );
}

function buildTransitionCandidates(members: ExamNoticeMember[]): NoticeMemberRow[] {
  return members
    .filter((member) => member.class === "kids")
    .flatMap((member) => {
      const joinedYears = member.joined_on ? yearsBetween(member.joined_on, today()) : 0;
      const age = member.birth_date ? yearsBetween(member.birth_date, today()) : 0;
      const grade = normalizeText(member.grade);
      const advancedGrade = ["1 KYU", "2 KYU", "3 KYU", "AZUL Y MARRON", "VERDE Y AZUL", "1 DAN"].includes(grade);
      const transitionAge = age >= 12;
      if (!transitionAge && !advancedGrade && joinedYears < 5) return [];
      return [{
        id: member.id,
        legacy_id: member.legacy_id,
        display_name: member.display_name,
        grade: member.grade,
        detail: transitionAge
          ? transitionAgeText(age)
          : advancedGrade
          ? "grado avanzado infantil; revisar si toca preparar paso a adultos"
          : `${joinedYears} años en niños; revisar continuidad de etapa`,
        tone: age >= 14 ? "danger" as const : "warn" as const
      }];
    })
    .slice(0, 20);
}

function transitionAgeText(age: number) {
  if (age >= 14) return `${age} anos; revisar paso a clase de adultos`;
  if (age >= 13) return `${age} anos; preparar paso a adultos durante esta temporada`;
  return `${age} anos; empezar seguimiento para futuro paso a adultos`;
}

function buildUpcomingExamNotices(members: ExamNoticeMember[]): NoticeMemberRow[] {
  const limit = addDays(today(), 120);
  return members
    .filter((member) => {
      if (!member.next_exam_on) return false;
      const semaphore = normalizeText(member.semaphore);
      if (isJustAfterExamCall(member.next_exam_on)) return semaphore !== "INACTIVO" && semaphore !== "GRIS";
      if (member.next_exam_on > limit) return false;
      return semaphore !== "VERDE" && semaphore !== "INACTIVO" && semaphore !== "GRIS";
    })
    .map((member) => ({
      id: member.id,
      legacy_id: member.legacy_id,
      display_name: member.display_name,
      grade: member.grade,
      detail: `${member.class === "kids" ? "niños" : "adultos"} - ${member.semaphore ?? "-"} - ${formatShortDate(member.next_exam_on ?? today())} - ${examMissingText(member)}`,
      tone: member.semaphore === "ROJO" ? "danger" as const : "warn" as const
    }))
    .slice(0, 20);
}

function buildBusenNotices(members: ExamNoticeMember[], eligibility: Array<{ member_id: string }>, attendance: BusenAttendance[]): NoticeMemberRow[] {
  const membersById = new Map(members.map((member) => [member.id, member]));
  const recentLimit = addDays(today(), -120);
  return eligibility
    .flatMap((row) => {
      const member = membersById.get(row.member_id);
      if (!member) return [];
      const rows = attendance.filter((item) => item.member_id === row.member_id);
      const absences = rows.filter((item) => item.status === "absent").length;
      const presents = rows.filter((item) => item.status === "present").length;
      const lastPresent = rows
        .filter((item) => item.status === "present")
        .map((item) => item.black_belt_special_classes?.class_date)
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1);
      if (absences < 2 && lastPresent && lastPresent >= recentLimit) return [];
      return [{
        id: member.id,
        legacy_id: member.legacy_id,
        display_name: member.display_name,
        grade: member.grade,
        detail: absences >= 2
          ? `${absences} ausencias Busen en 180 dias (${presents} presentes)`
          : `sin presencia Busen reciente desde ${lastPresent ? formatShortDate(lastPresent) : "sin registros"}`,
        tone: absences >= 2 ? "danger" as const : "warn" as const
      }];
    })
    .slice(0, 20);
}

function buildShakujoNotices(members: ExamNoticeMember[], attendance: ShakujoAttendance[]): NoticeMemberRow[] {
  const activeAdults = members.filter((member) => member.class === "adults");
  const countByMember = new Map<string, { total: number; last: string | null }>();
  for (const row of attendance) {
    const date = row.shakujo_classes?.class_date ?? null;
    const current = countByMember.get(row.member_id) ?? { total: 0, last: null };
    current.total += 1;
    if (date && (!current.last || date > current.last)) current.last = date;
    countByMember.set(row.member_id, current);
  }

  return activeAdults
    .flatMap((member) => {
      const stats = countByMember.get(member.id) ?? { total: 0, last: null };
      if (stats.total > 0) return [];
      return [{
        id: member.id,
        legacy_id: member.legacy_id,
        display_name: member.display_name,
        grade: member.grade,
        detail: "sin asistencia Shakujo registrada en los ultimos 180 dias",
        tone: "info" as const
      }];
    })
    .slice(0, 12);
}

function examMissingText(member: ExamNoticeMember) {
  const afterCall = member.next_exam_on ? justAfterExamCallText(member.next_exam_on) : "";
  if (afterCall) return afterCall;
  const missing = member.missing_attendance ?? 0;
  if (missing > 0) return `faltan ${missing} asistencias (${member.attendance_count ?? 0}/${member.minimum_attendance ?? "-"})`;
  if (member.exam_notice?.toLowerCase().includes("tecnico")) return "revisar progreso tecnico";
  if (member.exam_notice?.toLowerCase().includes("tiempo")) return "todavia falta tiempo minimo";
  return "revisar condiciones de convocatoria";
}

function isJustAfterExamCall(value: string) {
  return Boolean(justAfterExamCallText(value));
}

function justAfterExamCallText(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const calls = examCallsAround(date.getFullYear());
  const previousCall = calls
    .filter((call) => call.getTime() < date.getTime())
    .sort((a, b) => b.getTime() - a.getTime())[0];
  if (!previousCall) return "";
  const daysAfter = Math.round((date.getTime() - previousCall.getTime()) / 86400000);
  if (daysAfter <= 0 || daysAfter > 45) return "";
  return `vence ${daysAfter} dias despues de la convocatoria ${formatShortDate(previousCall.toISOString().slice(0, 10))}; revisar si merece adelantar`;
}

function examCallsAround(year: number) {
  return [year - 1, year, year + 1].flatMap((item) => [
    new Date(`${item}-06-27T00:00:00`),
    new Date(`${item}-12-05T00:00:00`)
  ]);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function trialState(endOn: string | null) {
  const now = today();
  if (!endOn) return { label: "Sin fecha", badge: "state-pendiente", className: "notice-priority-normal" };
  if (endOn < now) return { label: "Vencido", badge: "state-pendiente", className: "notice-priority-urgent" };
  if (endOn === now) return { label: "Vence hoy", badge: "state-en-progreso", className: "notice-priority-high" };
  return { label: "Proximo", badge: "state-completada", className: "notice-priority-normal" };
}

function areaLabel(value: string) {
  const labels: Record<string, string> = {
    general: "General",
    clases: "Clases",
    kenshis: "Kenshis",
    examenes: "Examenes",
    cursos: "Cursos",
    entregas: "Entregas",
    fichas: "Fichas",
    sistema: "Sistema"
  };
  return labels[value] ?? "General";
}

function priorityLabel(value: string) {
  if (value === "urgent") return "Urgente";
  if (value === "high") return "Alta";
  if (value === "low") return "Baja";
  return "Normal";
}

function statusLabel(value: string) {
  if (value === "in_progress") return "En curso";
  if (value === "done") return "Cerrado";
  if (value === "archived") return "Archivado";
  return "Abierto";
}

function statusClass(value: string) {
  if (value === "done") return "state-completada";
  if (value === "in_progress") return "state-en-progreso";
  return "state-pendiente";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function yearsBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  let years = end.getFullYear() - start.getFullYear();
  if (end.getMonth() < start.getMonth() || (end.getMonth() === start.getMonth() && end.getDate() < start.getDate())) years -= 1;
  return years;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}
