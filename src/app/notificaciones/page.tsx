import { Bell, LogOut, Send } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction, sendTelegramNotificationAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type NotificationLog = {
  id: string;
  notification_type: string;
  period_start: string | null;
  period_end: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

const quickActions = [
  { type: "test", label: "Enviar prueba", detail: "Comprueba bot y chat de Telegram." },
  { type: "daily_ranking", label: "Enviar parte diario", detail: "Ranking, clase del dia y listos para examen." },
  { type: "monthly_stats", label: "Enviar mensual", detail: "Estadisticas del mes anterior." },
  { type: "semester_stats", label: "Enviar semestral", detail: "Resumen de enero-junio o julio-diciembre." },
  { type: "yearly_stats", label: "Enviar anual", detail: "Resumen completo del ano." }
];

export default async function NotificacionesPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("telegram_notification_logs")
    .select("id,notification_type,period_start,period_end,status,error_message,sent_at,created_at")
    .order("created_at", { ascending: false })
    .limit(30)
    .returns<NotificationLog[]>();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/">Inicio</a>
          <a href="/control-dia">Control dia</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/clases-negras">Busen</a>
          <a href="/shakujo">Shakujo</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/calendario">Calendario</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/notificaciones" aria-current="page">Notificaciones</a>
          <a href="/sistema">Sistema</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Telegram privado</p>
            <h1>Notificaciones SKBC</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved ? <p className="save-ok">Notificacion enviada o registrada correctamente.</p> : null}
        {params.error ? <p className="form-error">No se pudo enviar Telegram{params.detail ? `: ${params.detail}` : "."}</p> : null}

        <section className="card notifications-hero">
          <Bell aria-hidden="true" size={24} />
          <div>
            <h2>Digest automatico</h2>
            <p className="muted">
              El parte diario incluye rankings y kenshis listos para examen si los hay. Los resumenes mensuales, semestrales y anuales quedan preparados para Vercel Cron.
            </p>
          </div>
        </section>

        <section className="notification-action-grid">
          {quickActions.map((action) => (
            <article className="card notification-action" key={action.type}>
              <div>
                <h2>{action.label}</h2>
                <p className="muted">{action.detail}</p>
              </div>
              <form action={sendTelegramNotificationAction}>
                <input type="hidden" name="type" value={action.type} />
                <button type="submit">
                  <Send aria-hidden="true" size={16} />
                  Enviar
                </button>
              </form>
            </article>
          ))}
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Ultimos envios</h2>
              <p className="muted">Registro leido desde Supabase.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Periodo</th>
                  <th>Estado</th>
                  <th>Enviado</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {error ? (
                  <tr><td colSpan={5} className="muted">Falta aplicar la migracion de notificaciones.</td></tr>
                ) : data?.length ? data.map((log) => (
                  <tr key={log.id}>
                    <td data-label="Tipo">{notificationLabel(log.notification_type)}</td>
                    <td data-label="Periodo">{formatPeriod(log.period_start, log.period_end)}</td>
                    <td data-label="Estado"><span className={`pill status-${log.status}`}>{statusLabel(log.status)}</span></td>
                    <td data-label="Enviado">{formatDateTime(log.sent_at ?? log.created_at)}</td>
                    <td data-label="Detalle">{log.error_message ?? "-"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="muted">Aun no hay notificaciones registradas.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function notificationLabel(value: string) {
  const labels: Record<string, string> = {
    daily_ranking: "Parte diario",
    monthly_stats: "Mensual",
    semester_stats: "Semestral",
    yearly_stats: "Anual",
    test: "Prueba"
  };
  return labels[value] ?? value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    sent: "Enviado",
    failed: "Fallido",
    skipped: "Saltado",
    pending: "Pendiente"
  };
  return labels[value] ?? value;
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start || !end) return "-";
  if (start === end) return formatDate(start);
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  return value.slice(0, 16).replace("T", " ");
}
