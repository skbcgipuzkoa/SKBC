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
    .select("id,legacy_id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,active,active_in_planning")
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

function normalizeTechniqueCategoryInput(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["goho", "juho", "seiho", "howa", "ukemi", "randori", "embu", "hokei", "kihon"].includes(normalized)) {
    return normalized;
  }
  return normalized || "goho";
}
