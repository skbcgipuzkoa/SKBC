import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectiveTechniqueSummary, type ConsultationTechnique } from "@/lib/technical-consultation-core";

export async function PATCH(request: Request) {
  if (!(await hasInternalAccess())) {
    return NextResponse.json({ error: "Acceso interno requerido." }, { status: 403 });
  }

  const formData = await request.formData();
  const id = String(formData.get("id") ?? "").trim();
  const active = formData.get("active") === "on";
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    grade: String(formData.get("grade") ?? "").trim() || "SIN GRADO",
    base_name: String(formData.get("baseName") ?? "").trim() || null,
    variant: String(formData.get("variant") ?? "").trim() || null,
    variant_note: String(formData.get("variantNote") ?? "").trim() || null,
    category: normalizeTechniqueCategoryInput(String(formData.get("category") ?? "")),
    summary_es: String(formData.get("summaryEs") ?? "").trim(),
    video_url: String(formData.get("videoUrl") ?? "").trim() || null,
    video_title: String(formData.get("videoTitle") ?? "").trim() || null,
    video_id: extractYoutubeVideoId(String(formData.get("videoUrl") ?? "")),
    video_match_status: String(formData.get("videoUrl") ?? "").trim() ? "manual" : "pending",
    video_match_source: String(formData.get("videoUrl") ?? "").trim() ? "manual" : null,
    active,
    active_in_planning: active && formData.get("activeInPlanning") === "on",
    updated_at: new Date().toISOString()
  };

  if (!id || !payload.name || !payload.category) {
    return NextResponse.json({ error: "Faltan nombre, categoria o identificador." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("techniques")
    .update(payload)
    .eq("id", id)
    .select("id,legacy_id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,active,active_in_planning,video_url,video_title,video_id,video_matched_at,video_match_status,video_match_source")
    .single<ConsultationTechnique>();

  if (error || !data) {
    console.error("Error updating consultation technique", error);
    return NextResponse.json({ error: "No se ha podido guardar la tecnica." }, { status: 500 });
  }

  revalidatePath("/consulta-tecnica");
  revalidatePath("/tecnicas");

  return NextResponse.json({
    technique: {
      ...data,
      effective_summary_es: effectiveTechniqueSummary(data)
    }
  });
}

function extractYoutubeVideoId(value: string) {
  const text = value.trim();
  if (!text) return null;
  const watch = text.match(/[?&]v=([^&]+)/);
  if (watch?.[1]) return watch[1];
  const short = text.match(/youtu\.be\/([^?&/]+)/);
  if (short?.[1]) return short[1];
  const shorts = text.match(/youtube\.com\/shorts\/([^?&/]+)/);
  return shorts?.[1] ?? null;
}

function normalizeTechniqueCategoryInput(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["goho", "juho", "seiho", "howa", "ukemi", "randori", "embu", "hokei", "kihon"].includes(normalized)) {
    return normalized;
  }
  return normalized || "goho";
}
