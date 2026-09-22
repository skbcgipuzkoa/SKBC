import {
  AlertTriangle,
  CheckCircle2,
  CloudDownload,
  DatabaseBackup,
  LogOut,
  PlayCircle,
  XCircle
} from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { SubmitButton } from "@/app/components/SubmitButton";
import { logoutAction, runManualBackupAction, runSeasonBackupAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type BackupRun = {
  id: string;
  status: "running" | "completed" | "failed";
  trigger_source: "manual" | "cron";
  storage_bucket: string;
  storage_path: string | null;
  storage_provider: "supabase" | "google_drive" | null;
  drive_url: string | null;
  table_counts: Record<string, number> | null;
  table_errors: Record<string, string> | null;
  file_size_bytes: number | null;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_by: string | null;
};

export const dynamic = "force-dynamic";

export default async function BackupsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; detail?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const { data: backups, error } = await supabase
    .from("backup_runs")
    .select("id,status,trigger_source,storage_bucket,storage_path,storage_provider,drive_url,table_counts,table_errors,file_size_bytes,started_at,completed_at,error_message,created_by")
    .order("started_at", { ascending: false })
    .limit(40)
    .returns<BackupRun[]>();

  if (error) throw error;

  const runs = backups ?? [];
  const latestOk = runs.find((run) => run.status === "completed") ?? null;
  const latest = runs[0] ?? null;
  const failed = runs.filter((run) => run.status === "failed").length;
  const defaultSeason = getDefaultSeason();

  return (
    <div className="shell">
      <SidebarNav current="/backups" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Backups y tranquilidad</p>
            <h1>Copias de seguridad</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        {params.saved === "backup" ? <p className="save-ok">Copia creada correctamente.</p> : null}
        {params.saved === "season" ? <p className="save-ok">Cierre de temporada guardado en Drive correctamente.</p> : null}
        {params.error === "backup" ? (
          <p className="form-error">No se pudo crear la copia{params.detail ? `: ${params.detail}` : "."}</p>
        ) : null}
        {params.error === "season" ? (
          <p className="form-error">No se pudo guardar el cierre de temporada{params.detail ? `: ${params.detail}` : "."}</p>
        ) : null}

        <section className={`control-hero ${latestOk ? "control-ok" : "control-warn"}`}>
          <div>
            <span className="tag">{latestOk ? "Ultima copia correcta" : "Sin copia correcta todavia"}</span>
            <h2>{latestOk ? formatDateTime(latestOk.completed_at ?? latestOk.started_at) : "Crea la primera copia ahora"}</h2>
            <p className="muted">
              Guarda una copia logica en Google Drive con las tablas importantes del club. Supabase solo conserva el registro ligero y limpia archivos antiguos.
            </p>
          </div>
          <form action={runManualBackupAction}>
            <SubmitButton pendingLabel="Creando copia...">
              <PlayCircle aria-hidden="true" size={18} /> Crear copia ahora
            </SubmitButton>
          </form>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Final de temporada</p>
              <h2>Guardar archivo externo en Drive</h2>
              <p className="muted">
                Usalo antes de cualquier limpieza fuerte. Crea una copia completa fuera de Supabase para poder conservar la memoria historica sin ocupar espacio dentro del proyecto.
              </p>
            </div>
          </div>
          <form className="form-grid" action={runSeasonBackupAction}>
            <label>
              Nombre del cierre
              <input name="seasonName" defaultValue={defaultSeason.name} />
            </label>
            <label>
              Desde
              <input name="periodFrom" type="date" defaultValue={defaultSeason.from} />
            </label>
            <label>
              Hasta
              <input name="periodTo" type="date" defaultValue={defaultSeason.to} />
            </label>
            <div className="form-actions wide">
              <SubmitButton pendingLabel="Guardando en Drive...">
                <CloudDownload aria-hidden="true" size={18} /> Guardar cierre de temporada
              </SubmitButton>
            </div>
          </form>
        </section>

        <section className="grid stats compact">
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Ultima correcta</h2>
            <div className="metric small">{latestOk ? relativeDate(latestOk.completed_at ?? latestOk.started_at) : "-"}</div>
          </article>
          <article className={failed ? "card attention-card" : "card"}>
            <XCircle aria-hidden="true" size={20} />
            <h2>Fallos recientes</h2>
            <div className="metric">{failed}</div>
          </article>
          <article className="card">
            <DatabaseBackup aria-hidden="true" size={20} />
            <h2>Copias registradas</h2>
            <div className="metric">{runs.length}</div>
          </article>
          <article className="card">
            <CloudDownload aria-hidden="true" size={20} />
            <h2>Ultimo tamano</h2>
            <div className="metric small">{latest?.file_size_bytes ? formatBytes(latest.file_size_bytes) : "-"}</div>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Historial de copias</h2>
              <p className="muted">Cada fila es una foto de seguridad del sistema nuevo en ese momento.</p>
            </div>
          </div>
          <div className="backup-run-list">
            {runs.length ? runs.map((run) => {
              const tableCount = Object.keys(run.table_counts ?? {}).length;
              const rowCount = Object.values(run.table_counts ?? {}).reduce((sum, count) => sum + Number(count ?? 0), 0);
              const errorCount = Object.keys(run.table_errors ?? {}).length;
              return (
                <article className={`backup-run-card backup-${run.status}`} key={run.id}>
                  <div className="backup-run-head">
                    <div>
                      <span className={`state-badge ${statusClass(run.status)}`}>{statusLabel(run.status)}</span>
                      <h3>{formatDateTime(run.started_at)}</h3>
                    </div>
                    <span className="pill">{run.trigger_source === "cron" ? "Automatico" : "Manual"}</span>
                  </div>
                  <div className="backup-run-meta">
                    <span>{tableCount} tablas</span>
                    <span>{rowCount} filas</span>
                    <span>{formatBytes(run.file_size_bytes)}</span>
                    <span>{run.storage_provider === "google_drive" ? "Drive" : "Supabase"}</span>
                    {errorCount ? <span>{errorCount} errores</span> : null}
                  </div>
                  {run.error_message ? <p className="form-error">{run.error_message}</p> : null}
                  {errorCount ? (
                    <details className="advanced-details">
                      <summary>Ver tablas con error</summary>
                      <div className="compact-stack">
                        {Object.entries(run.table_errors ?? {}).map(([table, message]) => (
                          <p key={table}><strong>{table}</strong>: {message}</p>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <div className="form-actions">
                    {run.status === "completed" && (run.storage_path || run.drive_url) ? (
                      <a
                        className="secondary-link"
                        href={`/api/admin/backups/${run.id}/download`}
                        download
                      >
                        Descargar JSON
                      </a>
                    ) : (
                      <span className="muted">Sin archivo descargable.</span>
                    )}
                    {run.drive_url ? (
                      <a className="text-link" href={run.drive_url} target="_blank">Abrir en Drive</a>
                    ) : null}
                  </div>
                </article>
              );
            }) : (
              <p className="muted">Todavia no hay copias registradas.</p>
            )}
          </div>
        </section>

        <section className="card">
          <h2>Que incluye</h2>
          <p className="muted">
            Kenshis, clases, asistencias, plan tecnico, historial tecnico, examenes, cursos, taikai,
            calendario, rankings, Busen, Shakujo, entregas, avisos y notificaciones del sistema nuevo.
            Los registros historicos se mantienen. El archivo pesado de copia queda fuera de Supabase, en Drive, y se conserva solo la ultima copia correcta.
          </p>
        </section>
      </main>
    </div>
  );
}

function statusLabel(status: BackupRun["status"]) {
  if (status === "completed") return "Correcta";
  if (status === "running") return "En curso";
  return "Fallida";
}

function statusClass(status: BackupRun["status"]) {
  if (status === "completed") return "state-completada";
  if (status === "running") return "state-en-progreso";
  return "state-pendiente";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function relativeDate(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.floor(ms / 1000 / 60 / 60);
  if (hours < 1) return "Hace menos de 1 h";
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} dias`;
}

function formatBytes(value: number | null) {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getDefaultSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 9 ? year : year - 1;
  const endYear = startYear + 1;
  return {
    name: `Temporada ${startYear}-${endYear}`,
    from: `${startYear}-09-01`,
    to: `${endYear}-06-30`
  };
}
