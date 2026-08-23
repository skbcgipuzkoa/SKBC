import { Bell, LogOut, PauseCircle, PlayCircle, Send } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction, sendTelegramNotificationAction, updateTelegramNotificationSettingAction, updateTelegramScheduledPauseAction } from "@/app/actions";
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

type NotificationSetting = {
  notification_type: string;
  enabled: boolean;
  paused_reason: string | null;
  pause_starts_on: string | null;
  pause_ends_on: string | null;
  updated_at: string;
};

const quickActions = [
  { type: "test", label: "Enviar prueba", detail: "Comprueba bot y chat de Telegram.", configurable: false },
  { type: "daily_ranking", label: "Enviar parte diario", detail: "Ranking, clase del dia, aptos y proximos a examen.", configurable: true },
  { type: "monthly_stats", label: "Enviar mensual", detail: "Estadisticas del mes anterior.", configurable: true },
  { type: "semester_stats", label: "Enviar semestral", detail: "Resumen de enero-junio o julio-diciembre.", configurable: true },
  { type: "yearly_stats", label: "Enviar anual", detail: "Resumen completo del ano.", configurable: true }
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
  const [logsResult, settingsResult] = await Promise.all([
    supabase
      .from("telegram_notification_logs")
      .select("id,notification_type,period_start,period_end,status,error_message,sent_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .returns<NotificationLog[]>(),
    supabase
      .from("telegram_notification_settings")
      .select("notification_type,enabled,paused_reason,pause_starts_on,pause_ends_on,updated_at")
      .returns<NotificationSetting[]>()
  ]);
  const data = logsResult.data;
  const error = logsResult.error;
  const settings = settingsResult.error ? [] : settingsResult.data ?? [];

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
        {params.error ? (
          <p className="form-error">
            {params.error === "settings" ? "No se pudo guardar el ajuste de notificaciones." : `No se pudo enviar Telegram${params.detail ? `: ${params.detail}` : "."}`}
          </p>
        ) : null}

        <section className="card notifications-hero">
          <Bell aria-hidden="true" size={24} />
          <div>
            <h2>Digest automatico</h2>
            <p className="muted">
              El parte diario incluye rankings y kenshis listos para examen si los hay. Los resumenes mensuales, semestrales y anuales quedan preparados para Vercel Cron.
            </p>
          </div>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Pausas individuales</h2>
              <p className="muted">Pausa solo el aviso que quieras. Los envios manuales siguen funcionando desde los botones de abajo.</p>
            </div>
          </div>
          {settingsResult.error ? (
            <p className="form-error">Falta aplicar la migracion de ajustes de notificaciones.</p>
          ) : null}
          <div className="notification-settings-grid">
            {quickActions.filter((action) => action.configurable).map((action) => {
              const setting = settings.find((item) => item.notification_type === action.type);
              const enabled = setting?.enabled ?? true;
              const scheduled = setting?.pause_starts_on && setting.pause_ends_on
                ? `Pausa programada: ${formatDate(setting.pause_starts_on)} - ${formatDate(setting.pause_ends_on)}`
                : "Sin pausa programada";
              return (
                <article className={`notification-setting ${enabled ? "enabled" : "paused"}`} key={action.type}>
                  <div>
                    <h2>{action.label}</h2>
                    <p className="muted">
                      {enabled ? "Activa" : `Pausada${setting?.paused_reason ? `: ${setting.paused_reason}` : ""}`}
                    </p>
                    <p className="muted">{scheduled}</p>
                  </div>
                  <form action={updateTelegramNotificationSettingAction}>
                    <input type="hidden" name="type" value={action.type} />
                    <input type="hidden" name="enabled" value={enabled ? "" : "on"} />
                    <input
                      name="reason"
                      placeholder="Motivo de pausa manual"
                      defaultValue={enabled ? "Vacaciones / pausa temporal" : setting?.paused_reason ?? ""}
                    />
                    <button type="submit" className={enabled ? "secondary-button danger-button" : "secondary-button"}>
                      {enabled ? <PauseCircle aria-hidden="true" size={16} /> : <PlayCircle aria-hidden="true" size={16} />}
                      {enabled ? "Pausar manualmente" : "Reactivar manual"}
                    </button>
                  </form>
                  <form action={updateTelegramScheduledPauseAction}>
                    <input type="hidden" name="type" value={action.type} />
                    <input type="hidden" name="enabled" value={enabled ? "on" : ""} />
                    <input
                      name="reason"
                      placeholder="Motivo de pausa programada"
                      defaultValue={setting?.paused_reason ?? "Vacaciones / pausa temporal"}
                    />
                    <div className="notification-date-row">
                      <label>
                        Desde
                        <input name="pauseStartsOn" type="date" defaultValue={setting?.pause_starts_on ?? ""} />
                      </label>
                      <label>
                        Hasta
                        <input name="pauseEndsOn" type="date" defaultValue={setting?.pause_ends_on ?? ""} />
                      </label>
                    </div>
                    <div className="notification-button-row">
                      <button type="submit" className="secondary-button">
                        Guardar pausa programada
                      </button>
                      <button type="submit" className="secondary-button" name="clear" value="on">
                        Quitar fechas
                      </button>
                    </div>
                  </form>
                </article>
              );
            })}
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
