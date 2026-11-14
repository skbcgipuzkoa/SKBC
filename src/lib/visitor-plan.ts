import { normalizeGrade } from "@/lib/adult-groups";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { createAdminClient } from "@/lib/supabase/admin";

export async function prepareVisitorPlan(host: string, id: string, visitorsOnly = false) {
  const db = createAdminClient();
  const { data: session, error } = await db.from("classes").select("id")
    .eq("id", id).eq("dojo_slug", host).eq("class_group", "adults")
    .eq("closed", false).eq("status", "pending").maybeSingle();
  if (error || !session) throw error ?? new Error("Clase no disponible");
  const [roster, groups] = await Promise.all([
    db.rpc("dojo_class_roster", { p_slug: host, p_class: id }),
    db.from("class_technical_groups").select("grade").eq("class_id", id)
  ]);
  if (roster.error || groups.error) throw roster.error ?? groups.error;
  const members = (Array.isArray(roster.data) ? roster.data : []) as { member_id: string; visit_id: string | null }[];
  const ids = members.filter(row => !visitorsOnly || row.visit_id).map(row => row.member_id);
  if (!ids.length) return;
  const { data, error: memberError } = await db.from("members").select("grade").in("id", ids);
  if (memberError) throw memberError;
  const existing = new Set(groups.data.map(row => normalizeGrade(row.grade)));
  const grades = new Set(data.map(row => normalizeGrade(row.grade)).filter(Boolean));
  const missing = [...grades].filter(grade => !existing.has(grade));
  if (missing.length) {
    const { error: insertError } = await db.from("class_technical_groups")
      .insert(missing.map(grade => ({ class_id: id, grade })));
    if (insertError) throw insertError;
  }
  if (grades.size || (!visitorsOnly && existing.size)) {
    await generateAdultTechnicalPlan(id, true, visitorsOnly ? grades : undefined);
  }
}
