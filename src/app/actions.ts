"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { closeAdultClass, setPlanTechniqueCompleted } from "@/lib/adult-class-close";
import { generateAdultTechnicalGroups, resolveWorkGrade } from "@/lib/adult-groups";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { grantInternalAccess, hasInternalAccess, revokeInternalAccess } from "@/lib/auth";
import { generateDiplomaForExam } from "@/lib/diplomas";
import { deleteExam, registerExam, saveExamReport } from "@/lib/exams";
import { recalculateClassExamStatus, recalculateMemberExamStatus } from "@/lib/member-exam-status";
import { uploadMemberPhoto } from "@/lib/member-photo";
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

async function getNextSkbcLegacyId(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase
    .from("members")
    .select("legacy_id")
    .not("legacy_id", "is", null)
    .limit(10000)
    .returns<{ legacy_id: string | null }[]>();

  if (error) throw error;

  const highest = data.reduce((max, row) => {
    const id = row.legacy_id?.trim();
    if (!id || !/^\d+$/.test(id)) return max;
    return Math.max(max, Number(id));
  }, 0);

  return String(highest + 1);
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
  let photoUrl: string | null = null;
  try {
    photoUrl = await uploadMemberPhoto(getPhotoFile(formData), legacyId);
  } catch (error) {
    console.error("Error uploading kenshi photo", error);
    redirect(`/kenshis/${legacyId}?error=photo`);
  }
  const updatePayload = photoUrl ? { ...payload, photo_url: photoUrl } : payload;
  const { error } = await supabase.from("members").update(updatePayload).eq("id", memberId);

  if (error) {
    redirect(`/kenshis/${legacyId}?error=kenshi`);
  }

  try {
    await recalculateMemberExamStatus(memberId);
  } catch (error) {
    console.error("Error recalculating kenshi exam status", error);
  }

  redirect(`/kenshis/${legacyId}?saved=kenshi`);
}

export async function createKenshiAction(formData: FormData) {
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
    ficha_token: createFichaToken()
  };

  if (!payload.first_name || !payload.class || !payload.status) {
    redirect("/kenshis/nuevo?error=kenshi");
  }

  const supabase = createAdminClient();
  let nextLegacyId: string;
  try {
    nextLegacyId = await getNextSkbcLegacyId(supabase);
  } catch (error) {
    console.error("Error resolving next SKBC legacy id", error);
    redirect("/kenshis/nuevo?error=kenshi");
  }

  const { data, error } = await supabase
    .from("members")
    .insert({ ...payload, legacy_id: nextLegacyId })
    .select("id,legacy_id")
    .single();

  if (error || !data?.legacy_id) {
    redirect("/kenshis/nuevo?error=kenshi");
  }

  try {
    const photoUrl = await uploadMemberPhoto(getPhotoFile(formData), data.legacy_id);
    if (photoUrl) {
      const { error: photoError } = await supabase
        .from("members")
        .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (photoError) throw photoError;
    }
  } catch (error) {
    console.error("Error uploading kenshi photo", error);
    redirect(`/kenshis/${data.legacy_id}?error=photo`);
  }

  try {
    await recalculateMemberExamStatus(data.id);
  } catch (error) {
    console.error("Error recalculating new kenshi exam status", error);
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
    redirect(`/clases/${legacyId}?error=plan&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect(`/clases/${legacyId}?saved=plan`);
}

export async function prepareAdultClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  const supabase = createAdminClient();
  const [{ data: groups }, { data: plan }] = await Promise.all([
    supabase.from("class_technical_groups").select("id").eq("class_id", classId).limit(1),
    supabase.from("technical_plans").select("id").eq("class_id", classId).limit(1)
  ]);

  try {
    if (!(groups?.length)) {
      await generateAdultTechnicalGroups(classId);
    }
    if (!(plan?.length)) {
      await generateAdultTechnicalPlan(classId);
    }
  } catch (error) {
    console.error("Error preparing adult class", error);
    redirect(`/clases/${legacyId}?error=prepare&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect(`/clases/${legacyId}?saved=prepare`);
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
    .select("id,legacy_id")
    .single<{ id: string; legacy_id: string | null }>();

  if (error || !data?.legacy_id) {
    redirect("/clases/nueva?error=class");
  }

  if (classGroup === "adults") {
    try {
      await generateAdultTechnicalGroups(data.id);
      await generateAdultTechnicalPlan(data.id);
    } catch (prepareError) {
      console.error("Error auto preparing adult class", prepareError);
      redirect(`/clases/${data.legacy_id}?saved=class&error=prepare&detail=${encodeURIComponent(errorMessage(prepareError))}`);
    }
  }

  redirect(`/clases/${data.legacy_id}?saved=${classGroup === "adults" ? "class-prepared" : "class"}`);
}

export async function updateClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const classDate = parseDateInput(String(formData.get("classDate") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const classType = String(formData.get("classType") ?? "").trim() || null;
  const responsible = String(formData.get("responsible") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const closed = String(formData.get("closed") ?? "") === "true";

  if (!classId || !legacyId || !classDate || !name) {
    redirect(`/clases/${legacyId || ""}?error=class`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("classes")
    .update({
      class_date: classDate,
      name,
      class_type: classType,
      responsible,
      notes,
      closed,
      status: closed ? "completed" : "pending",
      updated_at: new Date().toISOString()
    })
    .eq("id", classId);

  if (error) {
    redirect(`/clases/${legacyId}?error=class`);
  }

  redirect(`/clases/${legacyId}?saved=class-updated`);
}

export async function deleteClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const confirmText = String(formData.get("confirmText") ?? "").trim().toUpperCase();

  if (!classId || !legacyId || confirmText !== "ELIMINAR") {
    redirect(`/clases/${legacyId || ""}?error=delete`);
  }

  const supabase = createAdminClient();
  const deletions = [
    supabase.from("member_technical_history").delete().eq("class_id", classId),
    supabase.from("dojo_technical_history").delete().eq("class_id", classId),
    supabase.from("member_technique_assignments").delete().eq("class_id", classId),
    supabase.from("attendance_logs").delete().eq("class_id", classId),
    supabase.from("technical_plans").delete().eq("class_id", classId),
    supabase.from("class_technical_groups").delete().eq("class_id", classId)
  ];

  const results = await Promise.all(deletions);
  if (results.some((result) => result.error)) {
    console.error("Error deleting class related rows", results.map((result) => result.error).filter(Boolean));
    redirect(`/clases/${legacyId}?error=delete`);
  }

  const { error } = await supabase.from("classes").delete().eq("id", classId);
  if (error) {
    redirect(`/clases/${legacyId}?error=delete`);
  }

  redirect("/clases?saved=deleted");
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

export async function addBulkAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const memberIds = formData.getAll("memberIds").map((value) => String(value)).filter(Boolean);

  if (!classId || !legacyId || !memberIds.length) {
    redirect(`/clases/${legacyId || ""}?error=attendance`);
  }

  const supabase = createAdminClient();
  const [{ data: clase, error: classError }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("classes")
      .select("class_date,class_group")
      .eq("id", classId)
      .single<{ class_date: string; class_group: "kids" | "adults" }>(),
    supabase
      .from("members")
      .select("id,grade")
      .in("id", memberIds)
      .returns<{ id: string; grade: string | null }[]>()
  ]);

  if (classError || !clase || membersError || !members?.length) {
    redirect(`/clases/${legacyId}?error=attendance`);
  }

  const rows = members.map((member) => {
    const officialGrade = member.grade || "";
    const trainedGrade = clase.class_group === "adults" ? resolveWorkGrade(officialGrade) : officialGrade;
    return {
      legacy_id: `NEW-ASIS-${classId}-${member.id}`,
      class_id: classId,
      member_id: member.id,
      attended_on: clase.class_date,
      official_grade: officialGrade || null,
      trained_grade: trainedGrade || null,
      technical_role: "student",
      use_for_history: true
    };
  });

  const { error } = await supabase.from("attendance_logs").upsert(rows, { onConflict: "legacy_id" });

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
    await recalculateClassExamStatus(classId);
  } catch (error) {
    console.error("Error closing adult class", error);
    redirect(`/clases/${legacyId}?error=close`);
  }

  redirect(`/clases/${legacyId}?saved=close`);
}

export async function closeKidsClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("classes")
    .update({ closed: true, status: "completed", updated_at: new Date().toISOString() })
    .eq("id", classId)
    .eq("class_group", "kids");

  if (error) {
    redirect(`/clases/${legacyId}?error=close`);
  }

  try {
    await recalculateClassExamStatus(classId);
  } catch (error) {
    console.error("Error recalculating kids class exam status", error);
  }

  redirect(`/clases/${legacyId}?saved=close`);
}

export async function registerExamAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "");
  const examDate = parseDateInput(String(formData.get("examDate") ?? ""));
  const grade = String(formData.get("grade") ?? "").trim();
  const examiner = String(formData.get("examiner") ?? "").trim() || null;

  if (!memberId || !examDate || !grade) {
    redirect("/examenes?error=exam");
  }

  let memberLegacyId: string | null = null;
  try {
    const result = await registerExam({
      memberId,
      examDate,
      grade,
      examiner,
      registeredBy: "WEB SKBC"
    });
    memberLegacyId = result.memberLegacyId;
  } catch (error) {
    console.error("Error registering exam", error);
    redirect("/examenes?error=exam");
  }

  redirect(memberLegacyId ? `/kenshis/${memberLegacyId}?saved=exam` : "/examenes?saved=exam");
}

export async function saveExamReportAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const examId = String(formData.get("examId") ?? "");
  const reportUrl = String(formData.get("reportUrl") ?? "").trim();
  const reportType = String(formData.get("reportType") ?? "").trim() || null;
  const reportFileName = String(formData.get("reportFileName") ?? "").trim() || null;

  if (!examId || !reportUrl) {
    redirect("/examenes?error=report");
  }

  try {
    await saveExamReport({
      examId,
      reportUrl,
      reportType,
      reportFileName,
      createdBy: "WEB SKBC"
    });
  } catch (error) {
    console.error("Error saving exam report", error);
    redirect("/examenes?error=report");
  }

  redirect("/examenes?saved=report");
}

export async function generateDiplomaAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const examId = String(formData.get("examId") ?? "").trim();
  if (!examId) {
    redirect("/examenes?error=diploma");
  }

  try {
    await generateDiplomaForExam(examId);
  } catch (error) {
    console.error("Error generating diploma", error);
    redirect(`/examenes?error=diploma&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect("/examenes?saved=diploma");
}

export async function deleteExamAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const examId = String(formData.get("examId") ?? "").trim();
  if (!examId) {
    redirect("/examenes?error=delete");
  }

  try {
    await deleteExam(examId);
  } catch (error) {
    console.error("Error deleting exam", error);
    redirect(`/examenes?error=delete&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect("/examenes?saved=delete");
}

export async function ensureFichaTokenAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  if (!memberId || !legacyId) {
    redirect("/kenshis?error=ficha");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ ficha_token: createFichaToken(), updated_at: new Date().toISOString() })
    .eq("id", memberId)
    .is("ficha_token", null);

  if (error) {
    console.error("Error creating ficha token", error);
    redirect(`/kenshis/${legacyId}?error=ficha`);
  }

  redirect(`/kenshis/${legacyId}?saved=ficha`);
}

export async function saveChildNoteAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  const noteDate = parseDateInput(String(formData.get("noteDate") ?? "")) ?? new Date().toISOString().slice(0, 10);
  const noteType = String(formData.get("noteType") ?? "").trim() || "NOTA DEL SENSEI";
  const note = String(formData.get("note") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim() || "Alvaro";
  const visibleFamily = String(formData.get("visibleFamily") ?? "") === "on";

  if (!memberId || !legacyId || !note) {
    redirect(`/kenshis/${legacyId || ""}?error=child-note`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("child_notes").upsert(
    {
      member_id: memberId,
      legacy_id: `MANUAL-NOTE-${legacyId}`,
      note_date: noteDate,
      note_type: noteType,
      note,
      visible_family: visibleFamily,
      author,
      updated_at: new Date().toISOString()
    },
    { onConflict: "legacy_id" }
  );

  if (error) {
    console.error("Error saving child note", error);
    redirect(`/kenshis/${legacyId}?error=child-note`);
  }

  redirect(`/kenshis/${legacyId}?saved=child-note`);
}

export async function saveChildBehaviorAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  const reportDate = parseDateInput(String(formData.get("reportDate") ?? "")) ?? new Date().toISOString().slice(0, 10);
  const attitude = String(formData.get("attitude") ?? "").trim() || null;
  const attention = String(formData.get("attention") ?? "").trim() || null;
  const respect = String(formData.get("respect") ?? "").trim() || null;
  const effort = String(formData.get("effort") ?? "").trim() || null;
  const companionship = String(formData.get("companionship") ?? "").trim() || null;
  const observation = String(formData.get("observation") ?? "").trim() || null;

  if (!memberId || !legacyId) {
    redirect(`/kenshis/${legacyId || ""}?error=child-behavior`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("child_behavior_reports").upsert(
    {
      member_id: memberId,
      legacy_id: `MANUAL-BEHAVIOR-${legacyId}`,
      report_date: reportDate,
      attitude,
      attention,
      respect,
      effort,
      companionship,
      observation,
      updated_at: new Date().toISOString()
    },
    { onConflict: "legacy_id" }
  );

  if (error) {
    console.error("Error saving child behavior", error);
    redirect(`/kenshis/${legacyId}?error=child-behavior`);
  }

  redirect(`/kenshis/${legacyId}?saved=child-behavior`);
}

export async function addAdultRankingBonusAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const bonusDate = parseDateInput(String(formData.get("bonusDate") ?? "")) ?? new Date().toISOString().slice(0, 10);
  const points = Number.parseInt(String(formData.get("points") ?? ""), 10);
  const reason = String(formData.get("reason") ?? "").trim();

  if (!memberId || !Number.isFinite(points) || points === 0 || !reason) {
    redirect("/rankings?error=bonus");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("adult_ranking_bonuses").insert({
    member_id: memberId,
    bonus_date: bonusDate,
    points,
    reason,
    active: true,
    permanent: true,
    created_by: "WEB SKBC"
  });

  if (error) {
    console.error("Error adding adult ranking bonus", error);
    redirect("/rankings?error=bonus");
  }

  redirect("/rankings?saved=bonus");
}

export async function deactivateAdultRankingBonusAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const bonusId = String(formData.get("bonusId") ?? "").trim();
  if (!bonusId) {
    redirect("/rankings?error=bonus");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("adult_ranking_bonuses")
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq("id", bonusId);

  if (error) {
    console.error("Error deactivating adult ranking bonus", error);
    redirect("/rankings?error=bonus");
  }

  redirect("/rankings?saved=bonus");
}

export async function createCourseAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberIds = formData.getAll("memberIds").map((value) => String(value).trim()).filter(Boolean);
  const fallbackMemberId = String(formData.get("memberId") ?? "").trim();
  const kind = normalizeCourseKind(String(formData.get("kind") ?? ""));
  const courseDate = parseDateInput(String(formData.get("courseDate") ?? ""));
  const location = String(formData.get("location") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sensei = String(formData.get("sensei") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const selectedMemberIds = memberIds.length ? memberIds : fallbackMemberId ? [fallbackMemberId] : [];

  if (!selectedMemberIds.length || !kind || !courseDate || !location || !title) {
    redirect("/cursos?error=course");
  }

  const supabase = createAdminClient();
  const batchId = Date.now();
  const rows = selectedMemberIds.map((memberId, index) => ({
    kind,
    course_date: courseDate,
    member_id: memberId,
    location,
    title,
    sensei,
    notes,
    legacy_id: `CURS-${batchId}-${index + 1}`
  }));

  const { error } = await supabase.from("courses").insert(rows);

  if (error) {
    console.error("Error creating course", error);
    redirect("/cursos?error=course");
  }

  redirect("/cursos?saved=course");
}

export async function updateCourseGroupAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const courseIds = String(formData.get("courseIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const memberIds = formData.getAll("memberIds").map((value) => String(value).trim()).filter(Boolean);
  const kind = normalizeCourseKind(String(formData.get("kind") ?? ""));
  const courseDate = parseDateInput(String(formData.get("courseDate") ?? ""));
  const location = String(formData.get("location") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const sensei = String(formData.get("sensei") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!courseIds.length || !memberIds.length || !kind || !courseDate || !location || !title) {
    redirect("/cursos?error=course");
  }

  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("courses")
    .select("id,member_id")
    .in("id", courseIds)
    .returns<Array<{ id: string; member_id: string }>>();

  if (existingError || !existing?.length) {
    redirect("/cursos?error=course");
  }

  const selected = new Set(memberIds);
  const existingMemberIds = new Set(existing.map((row) => row.member_id));
  const removeIds = existing.filter((row) => !selected.has(row.member_id)).map((row) => row.id);
  const addMemberIds = memberIds.filter((memberId) => !existingMemberIds.has(memberId));

  const { error: updateError } = await supabase
    .from("courses")
    .update({ kind, course_date: courseDate, location, title, sensei, notes })
    .in("id", courseIds);

  if (updateError) {
    console.error("Error updating course group", updateError);
    redirect("/cursos?error=course");
  }

  if (removeIds.length) {
    const { error: deleteError } = await supabase.from("courses").delete().in("id", removeIds);
    if (deleteError) {
      console.error("Error removing course attendees", deleteError);
      redirect("/cursos?error=course");
    }
  }

  if (addMemberIds.length) {
    const batchId = Date.now();
    const rows = addMemberIds.map((memberId, index) => ({
      kind,
      course_date: courseDate,
      member_id: memberId,
      location,
      title,
      sensei,
      notes,
      legacy_id: `CURS-EDIT-${batchId}-${index + 1}`
    }));
    const { error: insertError } = await supabase.from("courses").insert(rows);
    if (insertError) {
      console.error("Error adding course attendees", insertError);
      redirect("/cursos?error=course");
    }
  }

  redirect("/cursos?saved=course");
}

export async function createBeltOrderLineAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim() || null;
  const studentName = String(formData.get("studentName") ?? "").trim();
  const examTitle = String(formData.get("examTitle") ?? "").trim() || null;
  const program = String(formData.get("program") ?? "").trim() || null;
  const grade = String(formData.get("grade") ?? "").trim() || null;
  const item = String(formData.get("item") ?? "").trim() || "Cinturon";
  const color = String(formData.get("color") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const quantity = Math.max(1, Number.parseInt(String(formData.get("quantity") ?? "1"), 10) || 1);
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if ((!memberId && !studentName) || !item || !color || !size) {
    redirect("/pedidos-cinturones?error=belt");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("belt_order_lines").insert({
    exam_title: examTitle,
    program,
    grade,
    member_id: memberId,
    student_name: studentName || null,
    item,
    color,
    size,
    quantity,
    notes,
    created_by: "WEB SKBC"
  });

  if (error) {
    console.error("Error creating belt order line", error);
    redirect("/pedidos-cinturones?error=belt");
  }

  redirect("/pedidos-cinturones?saved=belt");
}

function normalizeClass(value: string) {
  return value === "kids" || value === "adults" ? value : null;
}

function normalizeCourseKind(value: string) {
  return value === "national" || value === "international" ? value : null;
}

function normalizeStatus(value: string) {
  return value === "active" || value === "inactive" ? value : null;
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function getPhotoFile(formData: FormData) {
  const file = formData.get("profilePhoto");
  return file instanceof File ? file : null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.details, record.hint, record.code]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join(" - ");
    return JSON.stringify(record);
  }
  return String(error || "Error desconocido.");
}

function createFichaToken() {
  return randomBytes(18).toString("base64url");
}
