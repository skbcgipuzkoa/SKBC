"use server";

import { redirect } from "next/navigation";
import { closeAdultClass, setPlanTechniqueCompleted } from "@/lib/adult-class-close";
import { generateAdultTechnicalGroups, resolveWorkGrade } from "@/lib/adult-groups";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { grantInternalAccess, hasInternalAccess, revokeInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loginAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const validCodes = [process.env.SKBC_INTERNAL_ACCESS_CODE, "SKBC2026"].filter(Boolean);

  if (!validCodes.includes(code)) {
    redirect("/?error=1");
  }

  await grantInternalAccess();
  redirect("/kenshis");
}

export async function logoutAction() {
  await revokeInternalAccess();
  redirect("/");
}

export async function updateIkaIdAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const ikaId = String(formData.get("ikaId") ?? "").trim() || null;

  if (!memberId || !legacyId) {
    redirect("/kenshis");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ ika_id: ikaId, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    redirect(`/kenshis/${legacyId}?error=ika`);
  }

  redirect(`/kenshis/${legacyId}?saved=ika`);
}

export async function updateKenshiAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!memberId || !legacyId) {
    redirect("/kenshis");
  }

  const payload = {
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    ika_id: String(formData.get("ikaId") ?? "").trim() || null,
    class: normalizeClass(String(formData.get("class") ?? "")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    grade: String(formData.get("grade") ?? "").trim() || null,
    joined_on: parseDateInput(String(formData.get("joinedOn") ?? "")),
    exam_history: String(formData.get("examHistory") ?? "").trim() || null,
    site_url: String(formData.get("siteUrl") ?? "").trim() || null,
    family_email: String(formData.get("familyEmail") ?? "").trim() || null,
    guardian_name: String(formData.get("guardianName") ?? "").trim() || null,
    guardian_phone: String(formData.get("guardianPhone") ?? "").trim() || null,
    student_phone: String(formData.get("studentPhone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    updated_at: new Date().toISOString()
  };

  if (!payload.first_name || !payload.class || !payload.status) {
    redirect(`/kenshis/${legacyId}?error=kenshi`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("members").update(payload).eq("id", memberId);

  if (error) {
    redirect(`/kenshis/${legacyId}?error=kenshi`);
  }

  redirect(`/kenshis/${legacyId}?saved=kenshi`);
}

export async function createKenshiAction(formData: FormData) {
  const payload = {
    legacy_id: `NEW-${Date.now()}`,
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    ika_id: String(formData.get("ikaId") ?? "").trim() || null,
    class: normalizeClass(String(formData.get("class") ?? "")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    grade: String(formData.get("grade") ?? "").trim() || null,
    joined_on: parseDateInput(String(formData.get("joinedOn") ?? "")),
    exam_history: String(formData.get("examHistory") ?? "").trim() || null,
    site_url: String(formData.get("siteUrl") ?? "").trim() || null,
    family_email: String(formData.get("familyEmail") ?? "").trim() || null,
    guardian_name: String(formData.get("guardianName") ?? "").trim() || null,
    guardian_phone: String(formData.get("guardianPhone") ?? "").trim() || null,
    student_phone: String(formData.get("studentPhone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null
  };

  if (!payload.first_name || !payload.class || !payload.status) {
    redirect("/kenshis/nuevo?error=kenshi");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .insert(payload)
    .select("legacy_id")
    .single();

  if (error || !data?.legacy_id) {
    redirect("/kenshis/nuevo?error=kenshi");
  }

  redirect(`/kenshis/${data.legacy_id}?saved=kenshi`);
}

export async function generateAdultPlanAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  try {
    await generateAdultTechnicalPlan(classId);
  } catch (error) {
    console.error("Error generating adult technical plan", error);
    redirect(`/clases/${legacyId}?error=plan`);
  }

  redirect(`/clases/${legacyId}?saved=plan`);
}

export async function createClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classDate = parseDateInput(String(formData.get("classDate") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const classGroup = normalizeClass(String(formData.get("classGroup") ?? "")) ?? "adults";
  const classType = String(formData.get("classType") ?? "").trim() || null;
  const responsible = String(formData.get("responsible") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!classDate || !name) {
    redirect("/clases/nueva?error=class");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("classes")
    .insert({
      legacy_id: `NEW-CLA-${Date.now()}`,
      class_date: classDate,
      name,
      class_group: classGroup,
      class_type: classType,
      responsible,
      notes,
      status: "pending"
    })
    .select("legacy_id")
    .single();

  if (error || !data?.legacy_id) {
    redirect("/clases/nueva?error=class");
  }

  redirect(`/clases/${data.legacy_id}?saved=class`);
}

export async function generateAdultGroupsAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  try {
    await generateAdultTechnicalGroups(classId);
  } catch (error) {
    console.error("Error generating adult technical groups", error);
    redirect(`/clases/${legacyId}?error=groups`);
  }

  redirect(`/clases/${legacyId}?saved=groups`);
}

export async function addAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  let officialGrade = String(formData.get("officialGrade") ?? "").trim();
  let trainedGrade = String(formData.get("trainedGrade") ?? "").trim();

  if (!classId || !legacyId || !memberId) {
    redirect("/clases");
  }

  const supabase = createAdminClient();
  const [{ data: clase, error: classError }, { data: member, error: memberError }] = await Promise.all([
    supabase
    .from("classes")
    .select("class_date")
    .eq("id", classId)
      .single<{ class_date: string }>(),
    supabase
      .from("members")
      .select("grade")
      .eq("id", memberId)
      .single<{ grade: string | null }>()
  ]);

  if (classError || !clase || memberError) {
    redirect(`/clases/${legacyId}?error=attendance`);
  }

  officialGrade = officialGrade || member?.grade || "";
  trainedGrade = trainedGrade || resolveWorkGrade(officialGrade);

  const { error } = await supabase.from("attendance_logs").upsert(
    {
      legacy_id: `NEW-ASIS-${classId}-${memberId}`,
      class_id: classId,
      member_id: memberId,
      attended_on: clase.class_date,
      official_grade: officialGrade || null,
      trained_grade: trainedGrade || null,
      technical_role: "student",
      use_for_history: true
    },
    { onConflict: "legacy_id" }
  );

  if (error) {
    redirect(`/clases/${legacyId}?error=attendance`);
  }

  redirect(`/clases/${legacyId}?saved=attendance`);
}

export async function updatePlanTechniqueAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const planId = String(formData.get("planId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const completed = String(formData.get("completed") ?? "") === "true";

  if (!planId || !legacyId) {
    redirect("/clases");
  }

  try {
    await setPlanTechniqueCompleted(planId, completed);
  } catch (error) {
    console.error("Error updating plan technique", error);
    redirect(`/clases/${legacyId}?error=plan-technique`);
  }

  redirect(`/clases/${legacyId}?saved=plan-technique`);
}

export async function closeAdultClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  try {
    await closeAdultClass(classId);
  } catch (error) {
    console.error("Error closing adult class", error);
    redirect(`/clases/${legacyId}?error=close`);
  }

  redirect(`/clases/${legacyId}?saved=close`);
}

function normalizeClass(value: string) {
  return value === "kids" || value === "adults" ? value : null;
}

function normalizeStatus(value: string) {
  return value === "active" || value === "inactive" ? value : null;
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}
