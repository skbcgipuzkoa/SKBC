import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const env = loadEnvFile(".env.local");
const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY);
const targetDir = cleanEnv(process.env.SKBC_LOCAL_BACKUP_DIR ?? env.SKBC_LOCAL_BACKUP_DIR)
  || "C:\\Users\\alvar\\Desktop\\BACKUPS SKBC";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const { data: latest, error } = await supabase
  .from("backup_runs")
  .select("id,storage_bucket,storage_path,completed_at,started_at,file_size_bytes")
  .eq("status", "completed")
  .not("storage_path", "is", null)
  .order("completed_at", { ascending: false, nullsFirst: false })
  .order("started_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) {
  console.error(`Could not load latest backup: ${error.message}`);
  process.exit(1);
}

if (!latest?.storage_path) {
  console.error("No completed downloadable backup found. Create one from /backups first.");
  process.exit(1);
}

const { data: fileData, error: downloadError } = await supabase.storage
  .from(latest.storage_bucket)
  .download(latest.storage_path);

if (downloadError || !fileData) {
  console.error(`Could not download backup file: ${downloadError?.message ?? "unknown error"}`);
  process.exit(1);
}

const bytes = Buffer.from(await fileData.arrayBuffer());
const stamp = (latest.completed_at ?? latest.started_at ?? new Date().toISOString())
  .replace(/[:.]/g, "-")
  .replace("T", "_")
  .slice(0, 19);
const targetPath = path.join(targetDir, `SKBC-backup-${stamp}-${latest.id}.json`);

await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, bytes);

console.log(`Backup descargado correctamente: ${targetPath}`);
console.log(`Tamano: ${formatBytes(bytes.length)}`);

function loadEnvFile(filePath) {
  try {
    const text = Buffer.from(readFileSync(filePath)).toString("utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}

function cleanEnv(value) {
  return value?.replace(/^\uFEFF/, "").trim().replace(/^"|"$/g, "");
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
