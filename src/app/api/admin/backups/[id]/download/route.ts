import { hasInternalAccess } from "@/lib/auth";
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
    .select("id,status,storage_bucket,storage_path,completed_at,started_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      status: string;
      storage_bucket: string;
      storage_path: string | null;
      completed_at: string | null;
      started_at: string | null;
    }>();

  if (error) throw error;
  if (!backup || backup.status !== "completed" || !backup.storage_path) {
    return new NextResponse("Copia no disponible", { status: 404 });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from(backup.storage_bucket)
    .download(backup.storage_path);

  if (downloadError || !fileData) {
    return new NextResponse(downloadError?.message ?? "No se pudo descargar la copia", { status: 500 });
  }

  const bytes = Buffer.from(await fileData.arrayBuffer());
  const stamp = (backup.completed_at ?? backup.started_at ?? new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const fileName = `SKBC-backup-${stamp}-${backup.id}.json`;

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
