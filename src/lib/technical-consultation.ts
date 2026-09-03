import { createAdminClient } from "@/lib/supabase/admin";
import { compareConsultationTechniques, effectiveTechniqueSummary, type ConsultationTechnique } from "@/lib/technical-consultation-core";

export async function loadConsultationTechniques() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("techniques")
    .select("id,legacy_id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,active,active_in_planning")
    .order("name", { ascending: true })
    .limit(1200)
    .returns<ConsultationTechnique[]>();

  if (error) throw error;

  return (data ?? []).sort(compareConsultationTechniques).map((technique) => ({
    ...technique,
    effective_summary_es: effectiveTechniqueSummary(technique)
  }));
}
