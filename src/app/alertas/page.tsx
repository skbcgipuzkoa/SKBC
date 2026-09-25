import { AlertTriangle, CheckCircle2, ExternalLink, LogOut, ShieldAlert, Trash2 } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { dismissAdminAlertAction, dismissSelectedAdminAlertsAction, logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { isRelevantAbsence, operationalAlertKey } from "@/lib/operational-follow-up";

type AlertLevel = "danger" | "warn" | "info";

type SystemAlert = {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  href?: string;
};

type ClassRow = {
  id: string;
  legacy_id: string | null;
  name: string;
  class_date: string;
  class_group: "kids" | "adults";
  closed: boolean;
  plan_generated: boolean;
  status?: string;
};

type MemberRow = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  ficha_token: string | null;
  photo_url: string | null;
  joined_on: string | null;
};

type ExamRow = {
  id: string;
  exam_date: string;
  grade: string;
  report_url: string | null;
  diploma_url: string | null;
  members: { display_name: string; legacy_id: string | null } | null;
};

export default async function AlertasPage() {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const supabase = createAdminClient();
  const today = todayIso();
  const [
    { data: openOldClasses },
    { data: activeMembers },
    { data: exams },
    { data: failedSync },
    { data: latestBackup },
    { count: restorableTrash },
    { data: dismissedAlerts },
    { data: provisionalMembers },
    { data: importantNotes },
    { data: recentAttendance }
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id,legacy_id,name,class_date,class_group,closed,plan_generated,status")
      .or("closed.eq.false,status.eq.correction")
      .lt("class_date", today)
      .order("class_date", { ascending: false })
      .limit(30)
      .returns<ClassRow[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,ficha_token,photo_url,joined_on")
      .eq("status", "active")
      .order("class")
      .order("display_name")
      .returns<MemberRow[]>(),
    supabase
      .from("exams")
      .select("id,exam_date,grade,report_url,diploma_url,members(display_name,legacy_id)")
      .order("exam_date", { ascending: false })
      .limit(80)
      .returns<ExamRow[]>(),
    supabase
      .from("legacy_sheet_sync_jobs")
      .select("id,event_type,target_sheet,error_message,created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("backup_runs")
      .select("id,status,completed_at,started_at,error_message")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("trash_items")
      .select("id", { count: "exact", head: true })
      .eq("restore_status", "restorable"),
    supabase
      .from("admin_alert_dismissals")
      .select("alert_key"),
    supabase.from("provisional_members").select("id,display_name,class,created_at").eq("status", "pending"),
    supabase.from("member_notes").select("id,note,created_at,members(display_name,legacy_id)").eq("important", true).is("resolved_at", null),
    supabase.from("attendance_logs").select("member_id,attended_on").order("attended_on", { ascending: false })
  ]);

  const alerts: SystemAlert[] = [];

  for (const provisional of provisionalMembers ?? []) alerts.push({
    id: operationalAlertKey("provisional", provisional.id), level: "warn", title: `Invitado pendiente: ${provisional.display_name}`,
    detail: `${provisional.class === "kids" ? "Ninos" : "Adultos"} · creado ${String(provisional.created_at).slice(0, 10)}. Completa su ficha para consolidar sus asistencias.`, href: "/provisionales"
  });

  for (const note of importantNotes ?? []) {
    const member = Array.isArray(note.members) ? note.members[0] : note.members;
    alerts.push({ id: operationalAlertKey("member-note", note.id), level: "warn", title: `Nota importante: ${member?.display_name ?? "Kenshi"}`, detail: String(note.note).slice(0, 180), href: member?.legacy_id ? `/kenshis/${member.legacy_id}#notas-internas` : "/kenshis" });
  }

  const lastAttendance = new Map<string, string>();
  for (const item of recentAttendance ?? []) if (!lastAttendance.has(item.member_id)) lastAttendance.set(item.member_id, item.attended_on);
  for (const member of activeMembers ?? []) if (isRelevantAbsence({ group: member.class, joinedOn: member.joined_on, lastAttendanceOn: lastAttendance.get(member.id), today })) alerts.push({
    id: operationalAlertKey("absence", member.id, lastAttendance.get(member.id) ?? member.joined_on), level: "info", title: `Sin asistencia reciente: ${member.display_name}`,
    detail: `Ultima asistencia: ${lastAttendance.get(member.id) ?? "sin asistencia registrada"}.`, href: member.legacy_id ? `/kenshis/${member.legacy_id}` : "/kenshis"
  });

  for (const clase of openOldClasses ?? []) {
    alerts.push({
      id: `class-${clase.id}`,
      level: "danger",
      title: clase.status === "correction" ? `Clase en correccion: ${clase.name}` : `Clase antigua abierta: ${clase.name}`,
      detail: `${clase.class_date} - ${clase.class_group === "kids" ? "ninos" : "adultos"}. ${clase.status === "correction" ? "Termina y cierra la correccion pendiente." : "Conviene cerrarla o eliminarla si fue una prueba."}`,
      href: clase.legacy_id ? `/clases/${clase.legacy_id}` : "/clases"
    });
  }

  for (const member of (activeMembers ?? []).filter((item) => !item.ficha_token)) {
    alerts.push({
      id: `ficha-${member.id}`,
      level: "danger",
      title: `Kenshi activo sin ficha: ${member.display_name}`,
      detail: `${member.class === "kids" ? "Nino" : "Adulto"} - ${member.grade ?? "sin grado"}. No podra ver su ficha nueva hasta crear enlace.`,
      href: member.legacy_id ? `/kenshis/${member.legacy_id}` : "/kenshis"
    });
  }

  for (const member of (activeMembers ?? []).filter((item) => !item.photo_url).slice(0, 12)) {
    alerts.push({
      id: `photo-${member.id}`,
      level: "info",
      title: `Sin foto de perfil: ${member.display_name}`,
      detail: "No bloquea el sistema, pero la ficha queda menos completa.",
      href: member.legacy_id ? `/kenshis/${member.legacy_id}` : "/kenshis"
    });
  }

  for (const exam of exams ?? []) {
    if (!exam.report_url) {
      alerts.push({
        id: `report-${exam.id}`,
        level: "warn",
        title: `Examen sin informe: ${exam.members?.display_name ?? "Kenshi"}`,
        detail: `${exam.grade} - ${exam.exam_date}. El historial del alumno no tendra informe disponible.`,
        href: "/examenes?status=pending-report"
      });
    }
    if (!exam.diploma_url) {
      alerts.push({
        id: `diploma-${exam.id}`,
        level: "warn",
        title: `Examen sin diploma: ${exam.members?.display_name ?? "Kenshi"}`,
        detail: `${exam.grade} - ${exam.exam_date}. Falta generar o enlazar diploma.`,
        href: "/examenes?status=pending-diploma"
      });
    }
  }

  for (const job of failedSync ?? []) {
    alerts.push({
      id: `sync-${job.id}`,
      level: "warn",
      title: `Sync legacy fallida: ${job.event_type} - ${job.target_sheet}`,
      detail: String(job.error_message ?? "Sin detalle de error.").slice(0, 180),
      href: "/auditoria"
    });
  }

  if (!latestBackup?.status || latestBackup.status !== "completed") {
    alerts.push({
      id: "backup-latest",
      level: "danger",
      title: "No hay una copia correcta reciente",
      detail: latestBackup?.error_message ?? "Ejecuta una copia manual o revisa el proceso automatico.",
      href: "/backups"
    });
  }

  if ((restorableTrash ?? 0) > 0) {
    alerts.push({
      id: "trash-restorable",
      level: "info",
      title: `${restorableTrash} elementos en papelera`,
      detail: "Hay elementos recuperables por si necesitas deshacer un borrado.",
      href: "/papelera"
    });
  }

  const dismissedKeys = new Set((dismissedAlerts ?? []).map((item) => String(item.alert_key)));
  const visibleAlerts = alerts.filter((item) => !dismissedKeys.has(item.id));
  const dismissedCount = alerts.length - visibleAlerts.length;
  const dangerCount = visibleAlerts.filter((item) => item.level === "danger").length;
  const warnCount = visibleAlerts.filter((item) => item.level === "warn").length;

  return (
    <div className="shell">
      <SidebarNav current="/alertas" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Control preventivo</p>
            <h1>Alertas de incoherencias</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className={dangerCount ? "control-hero control-danger" : warnCount ? "control-hero control-warn" : "control-hero control-ok"}>
          <div>
            <span className="tag">{visibleAlerts.length} revisiones</span>
            <h2>{visibleAlerts.length ? "Hay cosas que merece la pena mirar" : "No veo incoherencias importantes"}</h2>
            <p className="muted">Estas alertas salen de datos reales. Si las borras, solo se ocultan del panel; el dato original queda intacto.</p>
          </div>
          <a className="primary-link secondary-link" href="/control-dia">Ir al cierre del dia</a>
        </section>

        <section className="grid stats compact">
          <article className={dangerCount ? "card attention-card" : "card"}>
            <ShieldAlert aria-hidden="true" size={20} />
            <h2>Criticas</h2>
            <div className="metric">{dangerCount}</div>
          </article>
          <article className={warnCount ? "card attention-card" : "card"}>
            <AlertTriangle aria-hidden="true" size={20} />
            <h2>A revisar</h2>
            <div className="metric">{warnCount}</div>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Visibles</h2>
            <div className="metric">{visibleAlerts.length}</div>
          </article>
          <article className="card">
            <Trash2 aria-hidden="true" size={20} />
            <h2>Borradas</h2>
            <div className="metric">{dismissedCount}</div>
          </article>
        </section>

        <section className="card alert-list-card">
          <div className="section-heading-row">
            <div>
              <h2>Listado</h2>
              <p className="muted">Selecciona varias alertas si quieres limpiar el panel de golpe.</p>
            </div>
            {visibleAlerts.length ? (
              <button className="primary-link danger-link" form="dismiss-alerts-form" type="submit">
                Borrar seleccionadas
              </button>
            ) : null}
          </div>
          <form action={dismissSelectedAdminAlertsAction} className="stack-list" id="dismiss-alerts-form">
            {visibleAlerts.length ? visibleAlerts.map((alert) => (
              <article className={`list-card alert-row alert-${alert.level}`} key={alert.id}>
                <label className="alert-select">
                  <input name="alertKey" type="checkbox" value={alert.id} />
                  <span>Seleccionar</span>
                </label>
                <div className="alert-body">
                  <span className="tag">{levelLabel(alert.level)}</span>
                  <h3>{alert.title}</h3>
                  <p className="muted">{alert.detail}</p>
                </div>
                <div className="row-actions">
                  {alert.href ? <a className="icon-button" href={alert.href} aria-label="Abrir alerta"><ExternalLink size={16} /></a> : null}
                  <button
                    aria-label="Borrar alerta"
                    className="icon-button danger-icon-button"
                    form={`dismiss-alert-${alert.id}`}
                    type="submit"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            )) : <p className="muted">Todo tranquilo en esta revision.</p>}
          </form>
          {visibleAlerts.map((alert) => (
            <form action={dismissAdminAlertAction} id={`dismiss-alert-${alert.id}`} key={`form-${alert.id}`}>
              <input name="alertKey" type="hidden" value={alert.id} />
            </form>
          ))}
        </section>
      </main>
    </div>
  );
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return local.toISOString().slice(0, 10);
}

function levelLabel(level: AlertLevel) {
  return level === "danger" ? "Critica" : level === "warn" ? "Revisar" : "Info";
}
