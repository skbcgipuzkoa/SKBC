import {
  Activity,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Database,
  FileText,
  Bell,
  LogOut,
  Newspaper,
  RefreshCw,
  Users
} from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const systemItems = [
  {
    title: "Auditoria",
    body: "Control del modo paralelo, sincronizacion con el archivo viejo, fallos y revisiones internas.",
    href: "/auditoria",
    icon: Activity
  },
  {
    title: "Importacion",
    body: "Estado de hojas legacy importadas, filas copiadas y datos normalizados desde el archivo viejo.",
    href: "/importacion",
    icon: Database
  },
  {
    title: "Notificaciones",
    body: "Telegram privado: ranking diario, listos para examen y resumenes mensuales, semestrales y anuales.",
    href: "/notificaciones",
    icon: Bell
  },
  {
    title: "Novedades",
    body: "Resumen de bloques incorporados al sistema nuevo durante la construccion.",
    href: "/novedades",
    icon: Newspaper
  }
];

export default async function SistemaPage() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const [
    activeMembers,
    openAdultClasses,
    openKidsClasses,
    pendingPlans,
    pendingReports,
    pendingDiplomas,
    failedLegacySync,
    pendingLegacySync,
    legacySheets
  ] = await Promise.all([
    countRows("members", (query) => query.eq("status", "active")),
    countRows("classes", (query) => query.eq("closed", false).eq("class_group", "adults")),
    countRows("classes", (query) => query.eq("closed", false).eq("class_group", "kids")),
    countRows("classes", (query) => query.eq("closed", false).eq("class_group", "adults").eq("plan_generated", false)),
    countRows("exams", (query) => query.is("report_url", null)),
    countRows("exams", (query) => query.is("diploma_url", null)),
    countRows("legacy_sheet_sync_jobs", (query) => query.eq("status", "failed")),
    countRows("legacy_sheet_sync_jobs", (query) => query.in("status", ["pending", "running"])),
    countRows("legacy_sheets")
  ]);

  const importantPending = pendingPlans + pendingReports + pendingDiplomas + failedLegacySync;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/">Inicio</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/clases-negras">Busen</a>
          <a href="/shakujo">Shakujo</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/calendario">Calendario</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/notificaciones">Notificaciones</a>
          <a href="/sistema" aria-current="page">Sistema</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Panel de control</p>
            <h1>Sistema SKBC</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid stats compact" aria-label="Resumen del sistema">
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Legacy</h2>
            <div className="metric small">Intacto</div>
            <p className="muted">El sistema nuevo trabaja en paralelo y no sustituye el viejo.</p>
          </article>
          <article className={`card ${importantPending ? "attention-card" : ""}`}>
            <AlertTriangle aria-hidden="true" size={20} />
            <h2>Pendientes</h2>
            <div className="metric">{importantPending}</div>
            <p className="muted">Planes, informes, diplomas o sincronizaciones a revisar.</p>
          </article>
          <article className="card">
            <Users aria-hidden="true" size={20} />
            <h2>Kenshis activos</h2>
            <div className="metric">{activeMembers}</div>
            <p className="muted">Adultos y ninos importados al sistema nuevo.</p>
          </article>
          <article className="card">
            <Database aria-hidden="true" size={20} />
            <h2>Hojas copiadas</h2>
            <div className="metric">{legacySheets}</div>
            <p className="muted">Pestanas del archivo viejo disponibles para consulta.</p>
          </article>
        </section>

        <h2 className="section-title">Acciones rapidas</h2>
        <section className="grid workflow">
          <a className="card system-card" href="/clases">
            <CalendarDays aria-hidden="true" size={22} />
            <h2>Clases abiertas</h2>
            <p className="muted">{openAdultClasses} adultos - {openKidsClasses} ninos. Revisa asistencia, plan tecnico y cierre.</p>
            <span className="text-link">Ir a clases</span>
          </a>
          <a className="card system-card" href="/clases">
            <Activity aria-hidden="true" size={22} />
            <h2>Planes pendientes</h2>
            <p className="muted">{pendingPlans} clases adultas abiertas sin plan tecnico generado.</p>
            <span className="text-link">Preparar clases</span>
          </a>
          <a className="card system-card" href="/examenes?status=pending-report">
            <FileText aria-hidden="true" size={22} />
            <h2>Informes de examen</h2>
            <p className="muted">{pendingReports} examenes sin informe enlazado en el historial del alumno.</p>
            <span className="text-link">Revisar informes</span>
          </a>
          <a className="card system-card" href="/examenes?status=pending-diploma">
            <FileText aria-hidden="true" size={22} />
            <h2>Diplomas</h2>
            <p className="muted">{pendingDiplomas} examenes sin diploma guardado o enlazado.</p>
            <span className="text-link">Revisar diplomas</span>
          </a>
          <a className={`card system-card ${failedLegacySync ? "attention-card" : ""}`} href="/auditoria">
            <RefreshCw aria-hidden="true" size={22} />
            <h2>Sincronizacion legacy</h2>
            <p className="muted">{failedLegacySync} fallidas - {pendingLegacySync} pendientes. Controla la copia al archivo viejo.</p>
            <span className="text-link">Abrir auditoria</span>
          </a>
          <a className="card system-card" href="/calendario">
            <CalendarDays aria-hidden="true" size={22} />
            <h2>Calendario del club</h2>
            <p className="muted">Festivos y cierres que no penalizan rankings ni proximos examenes.</p>
            <span className="text-link">Editar calendario</span>
          </a>
        </section>

        <h2 className="section-title">Herramientas tecnicas</h2>
        <section className="grid workflow">
          {systemItems.map((item) => {
            const Icon = item.icon;
            return (
              <a className="card system-card" href={item.href} key={item.title}>
                <Icon aria-hidden="true" size={22} />
                <h2>{item.title}</h2>
                <p className="muted">{item.body}</p>
                <span className="text-link">Abrir</span>
              </a>
            );
          })}
        </section>
      </main>
    </div>
  );

  async function countRows(table: string, refine?: (query: any) => any) {
    const baseQuery = supabase.from(table).select("*", { count: "exact", head: true });
    const query = refine ? refine(baseQuery) : baseQuery;
    const { count, error } = await query;
    return error ? 0 : count ?? 0;
  }
}
