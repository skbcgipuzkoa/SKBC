import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

await loadEnvFile(process.argv[2] || ".env.local");

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const folderId = cleanEnv(process.env.SKBC_LEGACY_ARCHIVE_DRIVE_FOLDER_ID)
  || cleanEnv(process.env.SKBC_BACKUP_DRIVE_FOLDER_ID)
  || cleanEnv(process.env.BACKUP_DRIVE_FOLDER_ID)
  || cleanEnv(process.env.DIPLOMA_EXAMEN_FOLDER_ID);

if (!folderId) throw new Error("Falta SKBC_LEGACY_ARCHIVE_DRIVE_FOLDER_ID, SKBC_BACKUP_DRIVE_FOLDER_ID o DIPLOMA_EXAMEN_FOLDER_ID.");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const { data: run, error: runError } = await supabase
  .from("legacy_rows_archive_runs")
  .insert({ status: "running", created_by: "Codex local" })
  .select("id")
  .single();

if (runError || !run) throw runError ?? new Error("No se ha podido crear legacy_rows_archive_runs.");

try {
  const startedAt = new Date().toISOString();
  await markArchiveProgress(run.id, "Exportando legacy_rows por bloques pequenos.");
  const [legacySpreadsheets, legacySheets, legacyRows] = await Promise.all([
    exportTable("legacy_spreadsheets"),
    exportTable("legacy_sheets"),
    exportTable("legacy_rows")
  ]);
  const completedAt = new Date().toISOString();
  const json = JSON.stringify({
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
  });
  await markArchiveProgress(run.id, "Subiendo archivo historico a Google Drive.");
  const accessToken = await getGoogleDriveAccessToken();
  const driveFile = await uploadJsonToDrive({
    accessToken,
    folderId,
    fileName: `SKBC-legacy-rows-${completedAt.slice(0, 10)}-${run.id}.json`,
    json
  });
  await markArchiveProgress(run.id, "Archivo subido a Drive. Vaciando legacy_rows.");
  const { data: removedRows, error: clearError } = await supabase.rpc("clear_legacy_rows_after_archive");
  if (clearError) throw clearError;

  const rowCount = Number(removedRows ?? legacyRows.length);
  const driveUrl = `https://drive.google.com/file/d/${driveFile.id}/view`;
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
  console.log(JSON.stringify({ status: "completed", rowCount, driveUrl }, null, 2));
} catch (error) {
  const message = describeError(error);
  await supabase
    .from("legacy_rows_archive_runs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: message
    })
    .eq("id", run.id);
  throw error;
}

async function exportTable(table) {
  const pageSize = table === "legacy_rows" ? 100 : 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function markArchiveProgress(id, message) {
  await supabase
    .from("legacy_rows_archive_runs")
    .update({ error_message: message })
    .eq("id", id);
}

async function getGoogleDriveAccessToken() {
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    const body = new URLSearchParams({
      client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
      grant_type: "refresh_token"
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`Google OAuth error ${response.status}: ${await response.text()}`);
    const data = await response.json();
    if (!data.access_token) throw new Error("Google OAuth no devolvio access_token.");
    return data.access_token;
  }

  const clientEmail = requiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) throw new Error(`Google auth error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  if (!data.access_token) throw new Error("Google no devolvio access_token.");
  return data.access_token;
}

async function uploadJsonToDrive({ accessToken, folderId, fileName, json }) {
  const boundary = `skbc_${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: "application/json"
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(json, "utf8"),
    Buffer.from(`\r\n--${boundary}--`)
  ]);
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  if (!response.ok) throw new Error(`Google upload error ${response.status}: ${await response.text()}`);
  return await response.json();
}

async function loadEnvFile(path) {
  try {
    const text = await readFile(path, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // The deployment path provides env vars directly; local runs use .env.local when present.
  }
}

function requiredEnv(name) {
  const value = cleanEnv(process.env[name]);
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function cleanEnv(value) {
  return value?.replace(/^\uFEFF/, "").trim() || "";
}

function describeError(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join(" - ");
    return JSON.stringify(error);
  }
  return String(error || "Error desconocido");
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
