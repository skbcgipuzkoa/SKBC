import { createAdminClient } from "@/lib/supabase/admin";

const BACKUP_BUCKET = "skbc-backups";
const COMPLETED_BACKUPS_TO_KEEP = 1;
const BACKUP_TABLES = [
  "members",
  "classes",
  "class_technical_groups",
  "technical_plans",
  "attendance_logs",
  "member_technique_assignments",
  "dojo_technical_history",
  "member_technical_history",
  "attendance_technical_overrides",
  "techniques",
  "exams",
  "courses",
  "child_rankings",
  "child_notes",
  "child_behavior_reports",
  "skbc_exam_calls",
  "skbc_exam_requirements",
  "skbc_calendar_closures",
  "adult_ranking_bonuses",
  "black_belt_class_eligibility",
  "black_belt_special_classes",
  "black_belt_special_attendance",
  "shakujo_classes",
  "shakujo_attendance",
  "distribution_campaigns",
  "distribution_campaign_items",
  "distribution_delivery_checks",
  "technical_area_links",
  "internal_notices",
  "telegram_notification_settings",
  "telegram_notification_logs",
  "email_notification_logs",
  "legacy_sheets",
  "legacy_rows",
  "legacy_sheet_sync_jobs"
];

type BackupRun = {
  id: string;
};

export async function runSkbcBackup(triggerSource: "manual" | "cron" = "manual", createdBy = "Sistema SKBC") {
  const supabase = createAdminClient();
  await ensureBackupBucket(supabase);

  const { data: run, error: runError } = await supabase
    .from("backup_runs")
    .insert({
      status: "running",
      trigger_source: triggerSource,
      storage_bucket: BACKUP_BUCKET,
      created_by: createdBy
    })
    .select("id")
    .single<BackupRun>();

  if (runError || !run) {
    throw runError ?? new Error("No se ha podido crear el registro de backup.");
  }

  try {
    const startedAt = new Date().toISOString();
    const tableCounts: Record<string, number> = {};
    const tableErrors: Record<string, string> = {};
    const tables: Record<string, unknown[]> = {};

    for (const table of BACKUP_TABLES) {
      try {
        const rows = await exportTable(supabase, table);
        tables[table] = rows;
        tableCounts[table] = rows.length;
      } catch (error) {
        tableErrors[table] = describeBackupError(error);
        tables[table] = [];
        tableCounts[table] = 0;
      }
    }

    const completedAt = new Date().toISOString();
    const payload = {
      schema: "skbc-logical-backup-v1",
      backup_id: run.id,
      trigger_source: triggerSource,
      started_at: startedAt,
      completed_at: completedAt,
      tables
    };
    const json = JSON.stringify(payload);
    const path = `${completedAt.slice(0, 10)}/${run.id}.json`;

    const { error: uploadError } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(path, new Blob([json], { type: "application/json" }), {
        contentType: "application/json",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const status = Object.keys(tableErrors).length ? "failed" : "completed";
    const { error: updateError } = await supabase
      .from("backup_runs")
      .update({
        status,
        storage_path: path,
        table_counts: tableCounts,
        table_errors: tableErrors,
        file_size_bytes: Buffer.byteLength(json, "utf8"),
        completed_at: completedAt,
        error_message: status === "failed" ? "Algunas tablas no se pudieron exportar." : null
      })
      .eq("id", run.id);

    if (updateError) throw updateError;
    if (status === "completed") {
      await pruneOldCompletedBackups(supabase);
    }
    return { id: run.id, status, path, tableCounts, tableErrors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await supabase
      .from("backup_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message
      })
      .eq("id", run.id);
    return { id: run.id, status: "failed" as const, error: message };
  }
}

async function pruneOldCompletedBackups(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("backup_runs")
    .select("id,storage_bucket,storage_path")
    .eq("status", "completed")
    .not("storage_path", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .range(COMPLETED_BACKUPS_TO_KEEP, 500)
    .returns<Array<{ id: string; storage_bucket: string; storage_path: string | null }>>();

  if (error || !data?.length) return;

  const byBucket = new Map<string, string[]>();
  for (const run of data) {
    if (!run.storage_path) continue;
    const paths = byBucket.get(run.storage_bucket) ?? [];
    paths.push(run.storage_path);
    byBucket.set(run.storage_bucket, paths);
  }

  for (const [bucket, paths] of byBucket) {
    if (!paths.length) continue;
    await supabase.storage.from(bucket).remove(paths);
  }

  await supabase
    .from("backup_runs")
    .update({
      storage_path: null,
      file_size_bytes: null,
      error_message: `Archivo eliminado automaticamente. Se conservan las ultimas ${COMPLETED_BACKUPS_TO_KEEP} copias correctas.`
    })
    .in("id", data.map((run) => run.id));
}

function describeBackupError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint, candidate.code]
      .filter(Boolean)
      .map(String);
    if (parts.length) return parts.join(" - ");
    return JSON.stringify(error);
  }
  return "Error desconocido";
}

async function exportTable(supabase: ReturnType<typeof createAdminClient>, table: string) {
  const pageSize = 1000;
  const rows: unknown[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, to);

    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
}

async function ensureBackupBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((bucket) => bucket.name === BACKUP_BUCKET)) return;

  const { error: createError } = await supabase.storage.createBucket(BACKUP_BUCKET, {
    public: false,
    fileSizeLimit: 1024 * 1024 * 50
  });
  if (createError) throw createError;
}
