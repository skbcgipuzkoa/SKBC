import { getGoogleDriveAccessToken, uploadJsonToDrive } from "@/lib/google-drive-api";
import { createAdminClient } from "@/lib/supabase/admin";

type ArchiveRun = {
  id: string;
};

export async function archiveLegacyRowsToDrive(createdBy = "Alvaro") {
  const folderId = legacyArchiveDriveFolderId();
  if (!folderId) {
    return {
      status: "failed" as const,
      error: "Falta configurar una carpeta de Drive para guardar el archivo legacy_rows."
    };
  }

  const supabase = createAdminClient();
  const { data: run, error: runError } = await supabase
    .from("legacy_rows_archive_runs")
    .insert({ status: "running", created_by: createdBy })
    .select("id")
    .single<ArchiveRun>();

  if (runError || !run) {
    throw runError ?? new Error("No se ha podido crear el registro de archivado.");
  }

  try {
    const startedAt = new Date().toISOString();
    const [legacySpreadsheets, legacySheets, legacyRows] = await Promise.all([
      exportTable(supabase, "legacy_spreadsheets"),
      exportTable(supabase, "legacy_sheets"),
      exportTable(supabase, "legacy_rows")
    ]);
    const completedAt = new Date().toISOString();
    const payload = {
      schema: "skbc-legacy-rows-archive-v1",
      archive_id: run.id,
      started_at: startedAt,
      completed_at: completedAt,
      note: "Archivo historico de legacy_rows. La base nueva sigue funcionando con tablas normalizadas.",
      tables: {
        legacy_spreadsheets: legacySpreadsheets,
        legacy_sheets: legacySheets,
        legacy_rows: legacyRows
      }
    };
    const json = JSON.stringify(payload);
    const accessToken = await getGoogleDriveAccessToken();
    const driveFile = await uploadJsonToDrive({
      accessToken,
      folderId,
      fileName: `SKBC-legacy-rows-${completedAt.slice(0, 10)}-${run.id}.json`,
      json
    });
    const driveUrl = `https://drive.google.com/file/d/${driveFile.id}/view`;
    const { data: removedRows, error: clearError } = await supabase.rpc("clear_legacy_rows_after_archive");
    if (clearError) throw clearError;

    const rowCount = Number(removedRows ?? legacyRows.length);
    const { error: updateError } = await supabase
      .from("legacy_rows_archive_runs")
      .update({
        status: "completed",
        row_count: rowCount,
        file_size_bytes: Buffer.byteLength(json, "utf8"),
        drive_file_id: driveFile.id,
        drive_url: driveUrl,
        completed_at: new Date().toISOString(),
        error_message: null
      })
      .eq("id", run.id);

    if (updateError) throw updateError;
    return {
      id: run.id,
      status: "completed" as const,
      rowCount,
      driveUrl
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await supabase
      .from("legacy_rows_archive_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_message: message
      })
      .eq("id", run.id);
    return { id: run.id, status: "failed" as const, error: message };
  }
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

function legacyArchiveDriveFolderId() {
  return cleanEnv(process.env.SKBC_LEGACY_ARCHIVE_DRIVE_FOLDER_ID)
    || cleanEnv(process.env.SKBC_BACKUP_DRIVE_FOLDER_ID)
    || cleanEnv(process.env.BACKUP_DRIVE_FOLDER_ID)
    || cleanEnv(process.env.DIPLOMA_EXAMEN_FOLDER_ID)
    || null;
}

function cleanEnv(value: string | undefined) {
  return value?.replace(/^\uFEFF/, "").trim() || "";
}
