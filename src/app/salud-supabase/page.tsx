import {
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  LogOut,
  TrendingUp
} from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

type DatabaseHealthRow = {
  database_name: string;
  database_size_bytes: number;
};

type TableHealthRow = {
  table_name: string;
  row_estimate: number | null;
  total_bytes: number;
  table_bytes: number;
  index_bytes: number;
  toast_bytes: number;
};

type StorageObjectRow = {
  bucket_id: string;
  metadata: { size?: number | string } | null;
};

const FREE_DB_LIMIT_BYTES = 500 * 1024 * 1024;
const FREE_STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
const BASE_YEARLY_GROWTH_FOR_100_MEMBERS = 60 * 1024 * 1024;

export const dynamic = "force-dynamic";

export default async function SupabaseHealthPage() {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const supabase = createAdminClient();
  const [
    databaseHealth,
    tableHealth,
    storageHealth,
    activeMembers,
    backupRows
  ] = await Promise.all([
    supabase.rpc("skbc_database_health").returns<DatabaseHealthRow[]>(),
    supabase.rpc("skbc_table_health").returns<TableHealthRow[]>(),
    loadStorageUsage(supabase),
    supabase
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("backup_runs")
      .select("file_size_bytes,started_at,status")
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(8)
  ]);

  const databaseRows = toRows<DatabaseHealthRow>(databaseHealth.data);
  const tables = toRows<TableHealthRow>(tableHealth.data);
  const dbBytes = databaseRows[0]?.database_size_bytes ?? 0;
  const members = activeMembers.count ?? 0;
  const estimatedYearlyGrowth = Math.max(
    30 * 1024 * 1024,
    Math.round((Math.max(members, 1) / 100) * BASE_YEARLY_GROWTH_FOR_100_MEMBERS)
  );
  const dbRemainingBytes = Math.max(0, FREE_DB_LIMIT_BYTES - dbBytes);
  const estimatedYears = dbRemainingBytes / estimatedYearlyGrowth;
  const dbPercent = percent(dbBytes, FREE_DB_LIMIT_BYTES);
  const storagePercent = percent(storageHealth.totalBytes, FREE_STORAGE_LIMIT_BYTES);
  const status = dbPercent >= 85 || storagePercent >= 85 ? "warning" : dbPercent >= 65 || storagePercent >= 65 ? "attention" : "ok";
  const latestBackupSize = backupRows.data?.[0]?.file_size_bytes ?? null;

  return (
    <div className="shell">
      <SidebarNav current="/salud-supabase" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Capacidad y tranquilidad</p>
            <h1>Salud Supabase</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className={`control-hero ${status === "ok" ? "control-ok" : "control-warn"}`}>
          <div>
            <span className="tag">{status === "ok" ? "Margen saludable" : "Revisar crecimiento"}</span>
            <h2>{formatYears(estimatedYears)} estimados en Free</h2>
            <p className="muted">
              Estimacion prudente con {members} kenshis activos y crecimiento aproximado de {formatBytes(estimatedYearlyGrowth)} al ano.
              El limite Free de base de datos es 500 MB, por eso conviene vigilarlo sin esperar a que avise tarde.
            </p>
          </div>
          <a className="primary-link" href="/backups">Ver backups</a>
        </section>

        <section className="grid stats compact">
          <article className={dbPercent >= 85 ? "card attention-card" : "card"}>
            <Database aria-hidden="true" size={20} />
            <h2>Base de datos</h2>
            <div className="metric small">{formatBytes(dbBytes)}</div>
            <p className="muted">{dbPercent}% de 500 MB Free.</p>
          </article>
          <article className={storagePercent >= 85 ? "card attention-card" : "card"}>
            <HardDrive aria-hidden="true" size={20} />
            <h2>Storage</h2>
            <div className="metric small">{formatBytes(storageHealth.totalBytes)}</div>
            <p className="muted">{storagePercent}% de 1 GB Free.</p>
          </article>
          <article className="card">
            <TrendingUp aria-hidden="true" size={20} />
            <h2>Crecimiento estimado</h2>
            <div className="metric small">{formatBytes(estimatedYearlyGrowth)}/ano</div>
            <p className="muted">Calculo conservador para uso normal del club.</p>
          </article>
          <article className="card">
            <CheckCircle2 aria-hidden="true" size={20} />
            <h2>Ultimo backup</h2>
            <div className="metric small">{latestBackupSize ? formatBytes(latestBackupSize) : "-"}</div>
            <p className="muted">El backup sirve como referencia, no como limite real de Supabase.</p>
          </article>
        </section>

        <section className="card">
          <div className="section-heading-row">
            <div>
              <h2>Uso por tablas</h2>
              <p className="muted">Las filas son estimadas por PostgreSQL; el tamano si es real. Sirve para detectar que tabla empieza a crecer demasiado.</p>
            </div>
          </div>
          <div className="table-health-list">
            {tables.slice(0, 18).map((table) => (
              <article className="table-health-row" key={table.table_name}>
                <div>
                  <strong>{table.table_name}</strong>
                  <span>{formatNumber(table.row_estimate ?? 0)} filas aprox.</span>
                </div>
                <div className="table-health-meter" aria-label={`${table.table_name} ${formatBytes(table.total_bytes)}`}>
                  <span style={{ width: `${Math.min(100, percent(table.total_bytes, Math.max(dbBytes, 1)))}%` }} />
                </div>
                <div className="table-health-size">
                  <strong>{formatBytes(table.total_bytes)}</strong>
                  <small>indices {formatBytes(table.index_bytes)}</small>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid workflow">
          <article className="card">
            <AlertTriangle aria-hidden="true" size={22} />
            <h2>Que puede disparar el uso</h2>
            <p className="muted">Fotos grandes, PDFs guardados en Supabase, logs eternos o backups dentro del propio proyecto. El sistema actual intenta evitarlo.</p>
          </article>
          <article className="card">
            <Database aria-hidden="true" size={22} />
            <h2>Lectura recomendada</h2>
            <p className="muted">Mientras la base este por debajo del 65%, no haria nada. Entre 65% y 85%, limpiar historicos. Por encima del 85%, archivar datos antiguos.</p>
          </article>
          <article className="card">
            <HardDrive aria-hidden="true" size={22} />
            <h2>Storage por buckets</h2>
            {storageHealth.byBucket.length ? (
              <div className="compact-stack">
                {storageHealth.byBucket.map((bucket) => (
                  <p key={bucket.bucket}><strong>{bucket.bucket}</strong>: {formatBytes(bucket.bytes)}</p>
                ))}
              </div>
            ) : (
              <p className="muted">No hay archivos pesados registrados o no se pudo leer storage.</p>
            )}
          </article>
        </section>
      </main>
    </div>
  );
}

async function loadStorageUsage(supabase: ReturnType<typeof createAdminClient>) {
  try {
    const { data, error } = await supabase
      .schema("storage")
      .from("objects")
      .select("bucket_id,metadata")
      .returns<StorageObjectRow[]>();
    if (error) throw error;

    const byBucketMap = new Map<string, number>();
    for (const object of data ?? []) {
      const bytes = Number(object.metadata?.size ?? 0);
      byBucketMap.set(object.bucket_id, (byBucketMap.get(object.bucket_id) ?? 0) + (Number.isFinite(bytes) ? bytes : 0));
    }
    const byBucket = [...byBucketMap.entries()]
      .map(([bucket, bytes]) => ({ bucket, bytes }))
      .sort((a, b) => b.bytes - a.bytes);
    return {
      totalBytes: byBucket.reduce((sum, item) => sum + item.bytes, 0),
      byBucket
    };
  } catch {
    return { totalBytes: 0, byBucket: [] as { bucket: string; bytes: number }[] };
  }
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function toRows<T>(value: T | T[] | null | undefined | { Error: string }) {
  if (!value || (typeof value === "object" && "Error" in value)) return [] as T[];
  return Array.isArray(value) ? value : [value];
}

function formatYears(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "menos de 1 ano";
  if (value > 20) return "mas de 20 anos";
  if (value < 1) return "menos de 1 ano";
  return `${value.toFixed(value >= 10 ? 0 : 1).replace(".", ",")} anos`;
}

function formatBytes(value: number | null | undefined) {
  const bytes = Number(value ?? 0);
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(value));
}
