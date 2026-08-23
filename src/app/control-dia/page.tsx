import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  LogOut,
  RefreshCw,
  Users,
  XCircle
} from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { redirect } from "next/navigation";
import { logoutAction, recalculateAllExamStatusesAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  closed: boolean;
  status: string;
  plan_generated: boolean;
  updated_at: string;
};

type AttendanceRow = {
  id: string;
  class_id: string | null;
  member_id: string;
  attended_on: string;
  members: {
    display_name: string;
    class: "kids" | "adults";
    ficha_token: string | null;
    updated_at: string;
  } | null;
};

type SyncJob = {
  id: string;
  event_type: string;
  target_sheet: string;
  source_table: string;
  status: string;
  error_message: string | null;
  created_at: string;
};

type ChildRanking = {
  member_id: string;
  calculated_at: string;
};

type DayStatus = "ok" | "warn" | "danger" | "neutral";

export default async function ControlDiaPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; saved?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const selectedDate = validDate(params.date) ?? todayIso();
  const supabase = createAdminClient();

  const [
    { data: classes, error: classesError },
    { data: attendance, error: attendanceError },
    { data: syncJobs },
    { data: childRankings },
    { count: activeAdults },
    { count: activeKids }
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id,legacy_id,class_date,name,class_group,closed,status,plan_generated,updated_at")
      .eq("class_date", selectedDate)
      .order("class_group")
      .order("name")
      .returns<ClassRow[]>(),
    supabase
      .from("attendance_logs")
      .select("id,class_id,member_id,attended_on,members(display_name,class,ficha_token,updated_at)")
      .eq("attended_on", selectedDate)
      .returns<AttendanceRow[]>(),
    supabase
      .from("legacy_sheet_sync_jobs")
      .select("id,event_type,target_sheet,source_table,status,error_message,created_at")
      .gte("created_at", `${selectedDate}T00:00:00`)
      .lte("created_at", `${selectedDate}T23:59:59`)
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<SyncJob[]>(),
    supabase
      .from("child_rankings")
      .select("member_id,calculated_at")
      .returns<ChildRanking[]>(),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active").eq("class", "adults"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active").eq("class", "kids")
  ]);

  if (classesError || attendanceError) {
    throw classesError ?? attendanceError;
  }

  const dayClasses = classes ?? [];
  const dayAttendance = attendance ?? [];
  const adultClass = dayClasses.find((item) => item.class_group === "adults") ?? null;
  const kidsClass = dayClasses.find((item) => item.class_group === "kids") ?? null;
  const adultAttendance = dayAttendance.filter((row) => row.members?.class === "adults");
  const kidsAttendance = dayAttendance.filter((row) => row.members?.class === "kids");
  const syncFailed = (syncJobs ?? []).filter((job) => job.status === "failed");
  const syncPending = (syncJobs ?? []).filter((job) => job.status !== "completed" && job.status !== "failed");
  const latestAttendanceTime = `${selectedDate}T00:00:00`;
  const fichasStale = dayAttendance.filter((row) => row.members?.ficha_token && row.members.updated_at < latestAttendanceTime);
  const kidsWithFreshRanking = kidsAttendance.filter((row) => {
    const ranking = (childRankings ?? []).find((item) => item.member_id === row.member_id);
    return ranking?.calculated_at && ranking.calculated_at >= latestAttendanceTime;
  }).length;

  const checks = [
    buildCheck({
      label: "Clase adultos",
      detail: adultClass ? `${adultClass.name} - ${adultClass.closed ? "cerrada" : "abierta"}` : "No hay clase adulta creada",
      status: adultClass ? "ok" : "warn",
      href: adultClass?.legacy_id ? `/clases/${adultClass.legacy_id}` : "/clases/nueva"
    }),
    buildCheck({
      label: "Plan tecnico adulto",
      detail: !adultClass ? "Sin clase adulta" : adultClass.plan_generated ? "Plan generado" : "Plan pendiente",
      status: !adultClass ? "neutral" : adultClass.plan_generated ? "ok" : "danger",
      href: adultClass?.legacy_id ? `/clases/${adultClass.legacy_id}?step=tecnicas` : undefined
    }),
    buildCheck({
      label: "Asistencia adultos",
      detail: `${adultAttendance.length}/${activeAdults ?? 0} registrados`,
      status: adultAttendance.length > 0 ? "ok" : adultClass ? "danger" : "neutral",
      href: adultClass?.legacy_id ? `/clases/${adultClass.legacy_id}?step=asistencia` : undefined
    }),
    buildCheck({
      label: "Clase ninos",
      detail: kidsClass ? `${kidsClass.name} - ${kidsClass.closed ? "cerrada" : "abierta"}` : "No hay clase infantil creada",
      status: kidsClass ? "ok" : "warn",
      href: kidsClass?.legacy_id ? `/clases/${kidsClass.legacy_id}` : "/clases/nueva"
    }),
    buildCheck({
      label: "Asistencia ninos",
      detail: `${kidsAttendance.length}/${activeKids ?? 0} registrados`,
      status: kidsAttendance.length > 0 ? "ok" : kidsClass ? "danger" : "neutral",
      href: kidsClass?.legacy_id ? `/clases/${kidsClass.legacy_id}?step=asistencia` : undefined
    }),
    buildCheck({
      label: "Ranking infantil",
      detail: kidsAttendance.length ? `${kidsWithFreshRanking}/${kidsAttendance.length} asistentes con ranking recalculado` : "Sin asistencia infantil hoy",
      status: !kidsAttendance.length ? "neutral" : kidsWithFreshRanking === kidsAttendance.length ? "ok" : "warn"
    }),
    buildCheck({
      label: "Fichas afectadas",
      detail: fichasStale.length ? `${fichasStale.length} fichas podrian necesitar recalculo` : `${dayAttendance.length} asistencias visibles en fichas`,
      status: fichasStale.length ? "warn" : dayAttendance.length ? "ok" : "neutral"
    }),
    buildCheck({
      label: "Sync legacy",
      detail: syncFailed.length ? `${syncFailed.length} fallos` : syncPending.length ? `${syncPending.length} pendientes` : `${(syncJobs ?? []).length} eventos sin fallo`,
      status: syncFailed.length ? "danger" : syncPending.length ? "warn" : "ok",
      href: "/auditoria"
    })
  ];

  const overall = checks.some((item) => item.status === "danger")
    ? "danger"
    : checks.some((item) => item.status === "warn")
      ? "warn"
      : "ok";

  return (
    <div className="shell">
      <SidebarNav current="/control-dia" />
      <main className="main control-day-main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Auditoria real del dia</p>
            <h1>Control del dia</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className={`control-hero control-${overall}`}>
          <div>
            <span className="tag">{formatDate(selectedDate)}</span>
            <h2>{overall === "ok" ? "Todo lo importante esta grabado" : overall === "warn" ? "Hay puntos para revisar" : "Hay incidencias que corregir"}</h2>
            <p className="muted">Esta pantalla lee directamente Supabase: clases, asistencia, tecnicas, fichas, rankings y sincronizacion legacy.</p>
          </div>
          <form className="control-date-form" action="/control-dia" method="get">
            <label>
              Fecha
              <input name="date" type="date" defaultValue={selectedDate} />
            </label>
            <button type="submit">Ver</button>
          </form>
        </section>

        <section className="control-summary-grid">
          <MetricCard icon={CalendarCheck} label="Clases del dia" value={String(dayClasses.length)} tone={dayClasses.length ? "ok" : "warn"} />
          <MetricCard icon={Users} label="Adultos" value={String(adultAttendance.length)} tone={adultAttendance.length ? "ok" : "neutral"} />
          <MetricCard icon={Users} label="Ninos" value={String(kidsAttendance.length)} tone={kidsAttendance.length ? "ok" : "neutral"} />
          <MetricCard icon={ClipboardCheck} label="Sync fallidos" value={String(syncFailed.length)} tone={syncFailed.length ? "danger" : "ok"} />
        </section>

        <section className="control-check-grid">
          {checks.map((check) => (
            <article className={`control-check control-${check.status}`} key={check.label}>
              <StatusIcon status={check.status} />
              <div>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
              {check.href ? <a href={check.href} aria-label={`Abrir ${check.label}`}><ExternalLink size={16} /></a> : null}
            </article>
          ))}
        </section>

        <section className="split-section control-actions-section">
          <article className="card">
            <h2>Acciones rapidas</h2>
            <div className="quick-action-grid">
              <a className="primary-link" href={adultClass?.legacy_id ? `/clases/${adultClass.legacy_id}` : "/clases/nueva"}>Abrir clase adultos</a>
              <a className="primary-link secondary-link" href={kidsClass?.legacy_id ? `/clases/${kidsClass.legacy_id}` : "/clases/nueva"}>Abrir clase ninos</a>
              <a className="primary-link secondary-link" href="/auditoria">Ver sync legacy</a>
              <form action={recalculateAllExamStatusesAction}>
                <button className="primary-link button-reset" type="submit">
                  <RefreshCw aria-hidden="true" size={16} /> Recalcular
                </button>
              </form>
            </div>
          </article>

          <article className="card">
            <h2>Asistentes registrados</h2>
            <div className="control-attendance-list">
              {dayAttendance.length ? dayAttendance.slice(0, 12).map((row) => (
                <div className="control-person-row" key={row.id}>
                  <span>{row.members?.display_name ?? "Kenshi"}</span>
                  <small>{row.members?.class === "kids" ? "Nino" : "Adulto"}</small>
                  {row.members?.ficha_token ? <a href={`/ficha/${row.members.ficha_token}?admin=1&returnTo=${encodeURIComponent("/control-dia")}`} target="_blank">Ficha</a> : null}
                </div>
              )) : <p className="muted">Todavia no hay asistencias registradas para esta fecha.</p>}
              {dayAttendance.length > 12 ? <p className="muted">Y {dayAttendance.length - 12} asistentes mas.</p> : null}
            </div>
          </article>
        </section>

        {syncFailed.length ? (
          <section className="card">
            <h2>Fallos de sincronizacion legacy</h2>
            <div className="stack-list compact-stack">
              {syncFailed.map((job) => (
                <div className="closure-row" key={job.id}>
                  <strong>{job.event_type} - {job.target_sheet}</strong>
                  <span>{job.source_table} - {job.created_at.slice(0, 16).replace("T", " ")}</span>
                  <p>{job.error_message ?? "Sin detalle"}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function buildCheck(input: { label: string; detail: string; status: DayStatus; href?: string }) {
  return input;
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof CalendarCheck; label: string; value: string; tone: DayStatus }) {
  return (
    <article className={`card control-metric control-${tone}`}>
      <Icon aria-hidden="true" size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StatusIcon({ status }: { status: DayStatus }) {
  if (status === "ok") return <CheckCircle2 aria-hidden="true" size={22} />;
  if (status === "danger") return <XCircle aria-hidden="true" size={22} />;
  if (status === "warn") return <AlertTriangle aria-hidden="true" size={22} />;
  return <ClipboardCheck aria-hidden="true" size={22} />;
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
