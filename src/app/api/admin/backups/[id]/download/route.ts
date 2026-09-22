import { hasInternalAccess } from "@/lib/auth";
import { downloadDriveFile, getGoogleDriveAccessToken } from "@/lib/google-drive-api";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await hasInternalAccess())) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();
  const { data: backup, error } = await supabase
    .from("backup_runs")
    .select("id,status,storage_bucket,storage_path,storage_provider,drive_file_id,completed_at,started_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      storage_bucket: string;
      storage_path: string | null;
      storage_provider: string | null;
      drive_file_id: string | null;
      completed_at: string | null;
      started_at: string | null;
    }>();

  if (error) throw error;
  if (!backup || backup.status !== "completed") {
    return new NextResponse("Copia no disponible", { status: 404 });
  }

  let bytes: Buffer;
  if (backup.storage_provider === "google_drive") {
    if (!backup.drive_file_id) return new NextResponse("Copia de Drive no disponible", { status: 404 });
    try {
      bytes = await downloadDriveFile(await getGoogleDriveAccessToken(), backup.drive_file_id);
    } catch (error) {
      return new NextResponse(error instanceof Error ? error.message : "No se pudo descargar la copia de Drive", { status: 500 });
    }
  } else {
    if (!backup.storage_path) return new NextResponse("Copia no disponible", { status: 404 });
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(backup.storage_bucket)
      .download(backup.storage_path);

    if (downloadError || !fileData) {
      return new NextResponse(downloadError?.message ?? "No se pudo descargar la copia", { status: 500 });
    }
    bytes = Buffer.from(await fileData.arrayBuffer());
  }

  const stamp = (backup.completed_at ?? backup.started_at ?? new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const fileName = `SKBC-backup-${stamp}-${backup.id}.json`;

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
