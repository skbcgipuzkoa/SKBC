import { adultGrades } from "@/lib/grades";
import { createAdminClient } from "@/lib/supabase/admin";

type MemberRow = {
  grade: string | null;
};

type TechniqueRow = {
  grade: string;
};

export async function generateAdultTechnicalGroups(classId: string) {
  const supabase = createAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("class_technical_groups")
    .select("id")
    .eq("class_id", classId)
    .limit(1);

  if (existingError) throw existingError;
  if ((existing ?? []).length) {
    throw new Error("La clase ya tiene grupos tecnicos.");
  }

  const [{ data: members, error: membersError }, { data: techniques, error: techniquesError }] =
    await Promise.all([
      supabase
        .from("members")
        .select("grade")
        .eq("class", "adults")
        .eq("status", "active")
        .returns<MemberRow[]>(),
      supabase
        .from("techniques")
        .select("grade")
        .eq("active", true)
        .eq("active_in_planning", true)
        .returns<TechniqueRow[]>()
    ]);

  if (membersError) throw membersError;
  if (techniquesError) throw techniquesError;
  if (!members?.length) throw new Error("No hay adultos activos.");

  const techniqueGrades = new Set((techniques ?? []).map((item) => resolveWorkGrade(item.grade)));
  if (techniqueGrades.has("5 KYU")) techniqueGrades.add("MINARAI");

  const normalMemberGrades = new Set(
    members
      .map((member) => resolveTrainingGroupGrade(member.grade))
      .filter(Boolean)
  );

  const normalGroups = adultGrades
    .filter((grade) => normalMemberGrades.has(grade))
    .filter((grade) => techniqueGrades.has(grade));

  const groupGrades = normalGroups;
  if (!groupGrades.length) throw new Error("No hay grupos tecnicos que generar.");

  const inserts = groupGrades.map((grade, index) => ({
    class_id: classId,
    legacy_id: grade === "REPASO" ? "GRP_REPASO" : `GRP_${String(index + 1).padStart(3, "0")}`,
    grade,
    active: true
  }));

  const { error: insertError } = await supabase.from("class_technical_groups").insert(inserts);
  if (insertError) throw insertError;

  return inserts.length;
}

export function resolveWorkGrade(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  return normalized === "MINARAI" ? "5 KYU" : normalized;
}

export function resolveTrainingGroupGrade(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  if (!normalized) return "";
  if (normalized === "MINARAI") return "MINARAI";
  const index = adultGrades.findIndex((item) => item === normalized);
  if (index <= 0) return normalized;
  return adultGrades[index - 1];
}

export function normalizeGrade(grade: string | null | undefined) {
  return String(grade ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}
