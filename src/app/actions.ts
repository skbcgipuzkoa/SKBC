"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { closeAdultClass, setPlanTechniqueCompleted } from "@/lib/adult-class-close";
import { generateAdultTechnicalGroups, resolveWorkGrade } from "@/lib/adult-groups";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { grantInternalAccess, hasInternalAccess, revokeInternalAccess } from "@/lib/auth";
import { generateDiplomaForExam } from "@/lib/diplomas";
import { deleteExam, registerExam, saveExamReport } from "@/lib/exams";
import { retryLegacySheetSyncJob, syncLegacyAttendance, syncLegacyChildBehavior, syncLegacyChildNote, syncLegacyCourse } from "@/lib/legacy-sheet-sync";
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

export async function recalculateAllExamStatusesAction() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("status", "active")
    .returns<Array<{ id: string }>>();

  if (error) {
    console.error("Error loading members for exam recalculation", error);
    redirect("/proximos-examenes?error=recalculate");
  }

  for (const member of data ?? []) {
    await recalculateMemberExamStatus(member.id);
  }

  redirect("/proximos-examenes?saved=recalculate");
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

export async function updateTechniqueAction(formData: FormData) {
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  if (!(await hasInternalAccess()) || !legacyId) {
    redirect("/tecnicas?error=technique");
  }

  const active = formData.get("active") === "on";
  const activeInPlanning = active && formData.get("activeInPlanning") === "on";
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    grade: String(formData.get("grade") ?? "").trim() || "SIN GRADO",
    base_name: String(formData.get("baseName") ?? "").trim() || null,
    variant: String(formData.get("variant") ?? "").trim() || null,
    variant_note: String(formData.get("variantNote") ?? "").trim() || null,
    category: normalizeTechniqueCategoryInput(String(formData.get("category") ?? "")),
    content_type: String(formData.get("contentType") ?? "").trim() || null,
    summary_es: String(formData.get("summaryEs") ?? "").trim() || null,
    active,
    active_in_planning: activeInPlanning,
    updated_at: new Date().toISOString()
  };

  if (!payload.name || !payload.category) {
    redirect(`/tecnicas?error=technique&edit=${encodeURIComponent(legacyId)}`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("techniques")
    .update(payload)
    .eq("legacy_id", legacyId);

  if (error) {
    console.error("Error updating technique", error);
    redirect(`/tecnicas?error=technique&edit=${encodeURIComponent(legacyId)}`);
  }

  redirect(`/tecnicas?saved=technique&edit=${encodeURIComponent(legacyId)}`);
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

export async function createClassDelegateLinkAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const mode = normalizeDelegateMode(String(formData.get("mode") ?? ""));
  const hours = Math.min(168, Math.max(2, Number.parseInt(String(formData.get("hours") ?? "48"), 10) || 48));

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  const supabase = createAdminClient();
  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,class_date,class_group,closed")
    .eq("id", classId)
    .single<{ id: string; class_date: string; class_group: "kids" | "adults"; closed: boolean }>();

  if (classError || !clase || clase.closed) {
    redirect(`/clases/${legacyId}?error=delegate`);
  }

  let primaryClassId = clase.id;
  if (mode === "adults" && clase.class_group !== "adults") {
    primaryClassId = await findOpenClassIdForDelegate(supabase, clase.class_date, "adults", legacyId);
  }
  if (mode === "kids" && clase.class_group !== "kids") {
    primaryClassId = await findOpenClassIdForDelegate(supabase, clase.class_date, "kids", legacyId);
  }
  if (mode === "combined") {
    primaryClassId = await findOpenClassIdForDelegate(supabase, clase.class_date, "adults", legacyId);
    await findOpenClassIdForDelegate(supabase, clase.class_date, "kids", legacyId);
  }

  const token = createDelegateToken();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("class_delegate_links").insert({
    class_id: primaryClassId,
    token,
    expires_at: expiresAt,
    created_by: `WEB SKBC:${mode}`
  });

  if (error) {
    console.error("Error creating delegate link", error);
    redirect(`/clases/${legacyId}?error=delegate`);
  }

  redirect(`/clases/${legacyId}?saved=delegate&delegateMode=${mode}`);
}

export async function startDelegateClassAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const mode = normalizeDelegateMode(String(formData.get("mode") ?? ""));
  const delegateName = String(formData.get("delegateName") ?? "").trim() || null;

  if (!token) {
    redirect("/delegado/error");
  }

  try {
    const { link, classes } = await getValidDelegateContext(token, mode);
    for (const clase of classes.filter((item) => item.class_group === "adults")) {
      await ensureAdultClassPrepared(clase.id);
    }
    const supabase = createAdminClient();
    await supabase
      .from("class_delegate_links")
      .update({ delegate_name: delegateName, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", link.id);
  } catch (error) {
    console.error("Error starting delegate class", error);
    redirect(`/delegado/${token}?mode=${mode}&error=start`);
  }

  const nextStep = mode === "kids" ? "attendance" : "technical";
  redirect(`/delegado/${token}?mode=${mode}&started=1&step=${nextStep}`);
}

export async function saveDelegateTechnicalStepAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const mode = normalizeDelegateMode(String(formData.get("mode") ?? ""));
  const delegateName = String(formData.get("delegateName") ?? "").trim() || null;
  const planIds = formData.getAll("planIds").map((value) => String(value)).filter(Boolean);

  if (!token) {
    redirect("/delegado/error");
  }

  try {
    const { link, classes } = await getValidDelegateContext(token, mode);
    for (const clase of classes.filter((item) => item.class_group === "adults")) {
      await ensureAdultClassPrepared(clase.id);
      await setDelegatePlanCompleted(clase.id, planIds);
    }
    const supabase = createAdminClient();
    await supabase
      .from("class_delegate_links")
      .update({ delegate_name: delegateName, started_at: link.started_at ?? new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", link.id);
  } catch (error) {
    console.error("Error saving delegate technical step", error);
    redirect(`/delegado/${token}?mode=${mode}&step=technical&error=technical&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect(`/delegado/${token}?mode=${mode}&started=1&step=attendance`);
}

export async function submitDelegateClassAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const mode = normalizeDelegateMode(String(formData.get("mode") ?? ""));
  const delegateName = String(formData.get("delegateName") ?? "").trim() || null;
  const memberIdsByClass = getDelegateMemberIdsByClass(formData);
  const totalMembers = [...memberIdsByClass.values()].reduce((count, ids) => count + ids.length, 0);

  if (!token || !totalMembers) {
    redirect(`/delegado/${token || "error"}?mode=${mode}&step=attendance&error=attendance`);
  }

  try {
    const { link, classes } = await getValidDelegateContext(token, mode);
    for (const clase of classes) {
      const memberIds = memberIdsByClass.get(clase.id) ?? [];
      if (memberIds.length) {
        await addAttendanceRows(clase.id, memberIds);
      }
      if (clase.class_group === "adults") {
        await closeAdultClass(clase.id);
      } else {
        const supabase = createAdminClient();
        const { error } = await supabase
          .from("classes")
          .update({ closed: true, status: "completed", updated_at: new Date().toISOString() })
          .eq("id", clase.id)
          .eq("class_group", "kids");
        if (error) throw error;
      }
      await recalculateClassExamStatus(clase.id);
    }

    const supabase = createAdminClient();
    await supabase
      .from("class_delegate_links")
      .update({ delegate_name: delegateName, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", link.id);
  } catch (error) {
    console.error("Error submitting delegate class", error);
    redirect(`/delegado/${token}?mode=${mode}&step=attendance&error=submit&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect(`/delegado/${token}?mode=${mode}&saved=sent`);
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

  const { data: attendanceRow, error } = await supabase.from("attendance_logs").upsert(
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
  ).select("id").single<{ id: string }>();

  if (error) {
    redirect(`/clases/${legacyId}?error=attendance`);
  }

  try {
    if (attendanceRow?.id) await syncLegacyAttendance(attendanceRow.id);
  } catch (syncError) {
    console.error("Error syncing attendance to legacy sheet", syncError);
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

  const { data: attendanceRows, error } = await supabase
    .from("attendance_logs")
    .upsert(rows, { onConflict: "legacy_id" })
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    redirect(`/clases/${legacyId}?error=attendance`);
  }

  try {
    await Promise.all((attendanceRows ?? []).map((row) => syncLegacyAttendance(row.id)));
  } catch (syncError) {
    console.error("Error syncing bulk attendance to legacy sheet", syncError);
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

export async function transitionChildToAdultAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  const transitionedOn = parseDateInput(String(formData.get("transitionedOn") ?? "")) ?? new Date().toISOString().slice(0, 10);
  const adultGrade = String(formData.get("adultGrade") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const createdBy = String(formData.get("createdBy") ?? "").trim() || "Alvaro";

  if (!memberId || !legacyId || !adultGrade) {
    redirect(`/kenshis/${legacyId || ""}?error=transition`);
  }

  const supabase = createAdminClient();
  const [
    { data: member, error: memberError },
    { data: ranking },
    { data: childNotes },
    { data: childNotices },
    { data: behavior },
    { data: attendance },
    { data: exams }
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,joined_on,ficha_token")
      .eq("id", memberId)
      .single<{ id: string; legacy_id: string | null; display_name: string; class: "kids" | "adults"; grade: string | null; joined_on: string | null; ficha_token: string | null }>(),
    supabase
      .from("child_rankings")
      .select("attendance_30d,attendance_90d,last_attendance_on,days_without_attendance,score,position,level,constancy_status,motivational_message")
      .eq("member_id", memberId)
      .maybeSingle(),
    supabase
      .from("child_notes")
      .select("note_date,note_type,note,visible_family,author")
      .eq("member_id", memberId)
      .order("note_date", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from("child_notices")
      .select("notice_date,title,body,color,active,source")
      .eq("member_id", memberId)
      .order("notice_date", { ascending: false, nullsFirst: false })
      .limit(20),
    supabase
      .from("child_behavior_reports")
      .select("report_date,attitude,attention,respect,effort,companionship,observation")
      .eq("member_id", memberId)
      .order("report_date", { ascending: false, nullsFirst: false })
      .limit(10),
    supabase
      .from("attendance_logs")
      .select("attended_on,official_grade,trained_grade,classes(name,class_group)")
      .eq("member_id", memberId)
      .order("attended_on", { ascending: false })
      .limit(60),
    supabase
      .from("exams")
      .select("exam_date,grade,cycle_attendance,examiner,registered_by,diploma_url,report_url")
      .eq("member_id", memberId)
      .order("exam_date", { ascending: false })
  ]);

  if (memberError || !member || member.class !== "kids") {
    redirect(`/kenshis/${legacyId}?error=transition`);
  }

  const childSummary = {
    member: {
      legacy_id: member.legacy_id,
      display_name: member.display_name,
      ficha_token: member.ficha_token
    },
    ranking,
    notes: childNotes ?? [],
    notices: childNotices ?? [],
    behavior: behavior ?? [],
    attendance: attendance ?? [],
    exams: exams ?? []
  };

  const { error: insertError } = await supabase.from("child_adult_transitions").insert({
    member_id: memberId,
    legacy_id: legacyId,
    transitioned_on: transitionedOn,
    child_grade: member.grade,
    adult_grade: adultGrade,
    child_joined_on: member.joined_on,
    child_summary: childSummary,
    notes,
    created_by: createdBy
  });

  if (insertError) {
    console.error("Error archiving child profile before adult transition", insertError);
    redirect(`/kenshis/${legacyId}?error=transition`);
  }

  const { error: updateError } = await supabase
    .from("members")
    .update({
      class: "adults",
      grade: adultGrade,
      updated_at: new Date().toISOString()
    })
    .eq("id", memberId);

  if (updateError) {
    console.error("Error transitioning child to adult", updateError);
    redirect(`/kenshis/${legacyId}?error=transition`);
  }

  try {
    await recalculateMemberExamStatus(memberId);
  } catch (error) {
    console.error("Error recalculating transitioned kenshi", error);
  }

  redirect(`/kenshis/${legacyId}?saved=transition`);
}

export async function undoChildToAdultTransitionAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  if (!memberId || !legacyId) {
    redirect(`/kenshis/${legacyId || ""}?error=transition-undo`);
  }

  const supabase = createAdminClient();
  const [{ data: member, error: memberError }, { data: transition, error: transitionError }] = await Promise.all([
    supabase
      .from("members")
      .select("id,class")
      .eq("id", memberId)
      .single<{ id: string; class: "kids" | "adults" }>(),
    supabase
      .from("child_adult_transitions")
      .select("id,child_grade,notes")
      .eq("member_id", memberId)
      .order("transitioned_on", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; child_grade: string | null; notes: string | null }>()
  ]);

  if (memberError || transitionError || !member || member.class !== "adults" || !transition) {
    redirect(`/kenshis/${legacyId}?error=transition-undo`);
  }

  const { error: updateError } = await supabase
    .from("members")
    .update({
      class: "kids",
      grade: transition.child_grade,
      updated_at: new Date().toISOString()
    })
    .eq("id", memberId);

  if (updateError) {
    console.error("Error undoing child to adult transition", updateError);
    redirect(`/kenshis/${legacyId}?error=transition-undo`);
  }

  await supabase
    .from("child_adult_transitions")
    .update({
      notes: [transition.notes, `DESHECHO: restaurado a ninos el ${new Date().toISOString().slice(0, 10)}`].filter(Boolean).join("\n"),
      updated_at: new Date().toISOString()
    })
    .eq("id", transition.id);

  try {
    await recalculateMemberExamStatus(memberId);
  } catch (error) {
    console.error("Error recalculating restored child kenshi", error);
  }

  redirect(`/kenshis/${legacyId}?saved=transition-undo`);
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

  try {
    await syncLegacyChildNote({ memberId, legacyId, noteDate, noteType, note, visibleFamily, author });
  } catch (syncError) {
    console.error("Error syncing child note to legacy sheet", syncError);
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

  try {
    await syncLegacyChildBehavior({ memberId, legacyId, reportDate, attitude, attention, respect, effort, companionship, observation });
  } catch (syncError) {
    console.error("Error syncing child behavior to legacy sheet", syncError);
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

export async function retryLegacySheetSyncAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const jobId = String(formData.get("jobId") ?? "").trim();
  if (!jobId) {
    redirect("/auditoria?error=legacy-sync");
  }

  try {
    await retryLegacySheetSyncJob(jobId);
  } catch (error) {
    console.error("Error retrying legacy sheet sync", error);
    redirect("/auditoria?error=legacy-sync");
  }

  redirect("/auditoria?saved=legacy-sync");
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

  const { data: insertedCourses, error } = await supabase
    .from("courses")
    .insert(rows)
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) {
    console.error("Error creating course", error);
    redirect("/cursos?error=course");
  }

  try {
    await Promise.all((insertedCourses ?? []).map((course) => syncLegacyCourse(course.id)));
  } catch (syncError) {
    console.error("Error syncing course to legacy sheet", syncError);
  }

  await Promise.all(selectedMemberIds.map((memberId) => recalculateMemberExamStatus(memberId)));

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

  const affectedMemberIds = Array.from(new Set([...memberIds, ...existing.map((row) => row.member_id)]));
  await Promise.all(affectedMemberIds.map((memberId) => recalculateMemberExamStatus(memberId)));

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

export async function updateBeltOrderStatusAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const lineId = String(formData.get("lineId") ?? "").trim();
  const status = normalizeBeltStatus(String(formData.get("status") ?? ""));
  if (!lineId || !status) {
    redirect("/pedidos-cinturones?error=belt-status");
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateFields =
    status === "ordered" ? { ordered_on: today } :
    status === "received" ? { received_on: today } :
    status === "delivered" ? { delivered_on: today } :
    {};

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("belt_order_lines")
    .update({ status, ...dateFields, updated_at: new Date().toISOString() })
    .eq("id", lineId);

  if (error) {
    console.error("Error updating belt order status", error);
    redirect("/pedidos-cinturones?error=belt-status");
  }

  redirect("/pedidos-cinturones?saved=belt-status");
}

export async function saveBlackBeltEligibilityAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const memberId = String(formData.get("memberId") ?? "").trim();
  const active = formData.get("active") === "on";
  const payload = {
    member_id: memberId,
    eligible_from: parseDateInput(String(formData.get("eligibleFrom") ?? "")) ?? new Date().toISOString().slice(0, 10),
    eligible_until: parseDateInput(String(formData.get("eligibleUntil") ?? "")),
    active,
    reason: String(formData.get("reason") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    updated_at: new Date().toISOString()
  };

  if (!memberId) redirect("/clases-negras?error=eligibility");
  const { error } = await createAdminClient()
    .from("black_belt_class_eligibility")
    .upsert(payload, { onConflict: "member_id" });

  if (error) {
    console.error("Error saving black belt eligibility", error);
    redirect("/clases-negras?error=eligibility");
  }
  redirect("/clases-negras?saved=eligibility");
}

export async function saveBlackBeltEligibilityRosterAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const memberIds = formData.getAll("memberIds").map((value) => String(value).trim()).filter(Boolean);
  const activeIds = new Set(formData.getAll("activeMemberIds").map((value) => String(value).trim()).filter(Boolean));

  if (!memberIds.length) redirect("/clases-negras?error=eligibility");

  const rows = memberIds.map((memberId) => ({
    member_id: memberId,
    active: activeIds.has(memberId),
    eligible_from: parseDateInput(String(formData.get(`eligibleFrom:${memberId}`) ?? "")) ?? today,
    eligible_until: parseDateInput(String(formData.get(`eligibleUntil:${memberId}`) ?? "")),
    reason: String(formData.get(`reason:${memberId}`) ?? "").trim() || null,
    notes: String(formData.get(`notes:${memberId}`) ?? "").trim() || null,
    updated_at: now
  }));

  const { error } = await createAdminClient()
    .from("black_belt_class_eligibility")
    .upsert(rows, { onConflict: "member_id" });

  if (error) {
    console.error("Error saving black belt eligibility roster", error);
    redirect("/clases-negras?error=eligibility");
  }
  redirect("/clases-negras?saved=eligibility");
}

export async function createBlackBeltSpecialClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classDate = parseDateInput(String(formData.get("classDate") ?? ""));
  if (!classDate) redirect("/clases-negras?error=session");

  const { error } = await createAdminClient()
    .from("black_belt_special_classes")
    .upsert({
      class_date: classDate,
      title: String(formData.get("title") ?? "").trim() || "Clase Busen",
      instructor: String(formData.get("instructor") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "class_date" });

  if (error) {
    console.error("Error creating black belt special class", error);
    redirect("/clases-negras?error=session");
  }
  redirect("/clases-negras?saved=session");
}

export async function saveBlackBeltAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classId = String(formData.get("classId") ?? "").trim();
  const statuses = ["present", "justified", "absent"];
  if (!classId) redirect("/clases-negras?error=attendance");

  const rows = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("status:"))
    .map(([key, value]) => {
      const memberId = key.replace("status:", "");
      const status = statuses.includes(String(value)) ? String(value) : "absent";
      return {
        special_class_id: classId,
        member_id: memberId,
        status,
        notes: String(formData.get(`notes:${memberId}`) ?? "").trim() || null,
        updated_at: new Date().toISOString()
      };
    });

  const supabase = createAdminClient();
  if (rows.length) {
    const { error } = await supabase
      .from("black_belt_special_attendance")
      .upsert(rows, { onConflict: "special_class_id,member_id" });
    if (error) {
      console.error("Error saving black belt attendance", error);
      redirect("/clases-negras?error=attendance");
    }
  }

  if (formData.get("close") === "on") {
    await supabase
      .from("black_belt_special_classes")
      .update({ closed: true, updated_at: new Date().toISOString() })
      .eq("id", classId);
  }

  await Promise.all(rows.map((row) => recalculateMemberExamStatus(row.member_id)));

  redirect("/clases-negras?saved=attendance");
}

export async function createShakujoClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classDate = parseDateInput(String(formData.get("classDate") ?? ""));
  if (!classDate) redirect("/shakujo?error=session");

  const { error } = await createAdminClient()
    .from("shakujo_classes")
    .upsert({
      class_date: classDate,
      title: String(formData.get("title") ?? "").trim() || "Clase Shakujo",
      instructor: String(formData.get("instructor") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      updated_at: new Date().toISOString()
    }, { onConflict: "class_date" });

  if (error) {
    console.error("Error creating shakujo class", error);
    redirect("/shakujo?error=session");
  }
  redirect("/shakujo?saved=session");
}

export async function saveShakujoAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classId = String(formData.get("classId") ?? "").trim();
  if (!classId) redirect("/shakujo?error=attendance");

  const memberIds = formData.getAll("memberIds").map((value) => String(value).trim()).filter(Boolean);
  const now = new Date().toISOString();
  const supabase = createAdminClient();

  const { error: deleteError } = await supabase
    .from("shakujo_attendance")
    .delete()
    .eq("shakujo_class_id", classId);

  if (deleteError) {
    console.error("Error clearing shakujo attendance", deleteError);
    redirect("/shakujo?error=attendance");
  }

  if (memberIds.length) {
    const rows = memberIds.map((memberId) => ({
      shakujo_class_id: classId,
      member_id: memberId,
      notes: String(formData.get(`notes:${memberId}`) ?? "").trim() || null,
      updated_at: now
    }));
    const { error } = await supabase.from("shakujo_attendance").insert(rows);
    if (error) {
      console.error("Error saving shakujo attendance", error);
      redirect("/shakujo?error=attendance");
    }
  }

  if (formData.get("close") === "on") {
    await supabase
      .from("shakujo_classes")
      .update({ closed: true, updated_at: now })
      .eq("id", classId);
  }

  await Promise.all(memberIds.map((memberId) => recalculateMemberExamStatus(memberId)));

  redirect("/shakujo?saved=attendance");
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

function normalizeBeltStatus(value: string) {
  return ["pending", "ordered", "received", "delivered"].includes(value) ? value : null;
}

function normalizeTechniqueCategoryInput(value: string) {
  const normalized = value.trim().toLowerCase();
  const allowed = ["goho", "juho", "seiho", "ukemi", "randori", "embu", "hokei", "kihon"];
  return allowed.includes(normalized) ? normalized : null;
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

function createDelegateToken() {
  return randomBytes(24).toString("base64url");
}

async function ensureAdultClassPrepared(classId: string) {
  const supabase = createAdminClient();
  const [{ data: groups }, { data: plan }] = await Promise.all([
    supabase.from("class_technical_groups").select("id").eq("class_id", classId).limit(1),
    supabase.from("technical_plans").select("id").eq("class_id", classId).limit(1)
  ]);

  if (!(groups?.length)) {
    await generateAdultTechnicalGroups(classId);
  }
  if (!(plan?.length)) {
    await generateAdultTechnicalPlan(classId);
  }
}

async function getValidDelegateClass(token: string) {
  const supabase = createAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("class_delegate_links")
    .select("id,class_id,expires_at,closed_at,revoked_at")
    .eq("token", token)
    .single<{ id: string; class_id: string; expires_at: string; closed_at: string | null; revoked_at: string | null }>();

  if (linkError || !link) throw new Error("Enlace no encontrado.");
  if (link.revoked_at) throw new Error("Este enlace ha sido anulado.");
  if (link.closed_at) throw new Error("Esta clase ya fue enviada por el sustituto.");
  if (new Date(link.expires_at).getTime() < Date.now()) throw new Error("Este enlace ha caducado.");

  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,closed")
    .eq("id", link.class_id)
    .single<{ id: string; legacy_id: string | null; class_date: string; name: string; class_group: "kids" | "adults"; closed: boolean }>();

  if (classError || !clase) throw new Error("Clase no encontrada.");
  if (clase.closed) throw new Error("Esta clase ya esta cerrada.");

  return { link, clase };
}

type DelegateMode = "adults" | "kids" | "combined";

type DelegateClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  name: string;
  class_group: "kids" | "adults";
  closed: boolean;
};

async function getValidDelegateContext(token: string, requestedMode: DelegateMode) {
  const supabase = createAdminClient();
  const { data: link, error: linkError } = await supabase
    .from("class_delegate_links")
    .select("id,class_id,expires_at,closed_at,revoked_at,started_at,created_by")
    .eq("token", token)
    .single<{
      id: string;
      class_id: string;
      expires_at: string;
      closed_at: string | null;
      revoked_at: string | null;
      started_at: string | null;
      created_by: string | null;
    }>();

  if (linkError || !link) throw new Error("Enlace no encontrado.");
  if (link.revoked_at) throw new Error("Este enlace ha sido anulado.");
  if (link.closed_at) throw new Error("Esta clase ya fue enviada por el sustituto.");
  if (new Date(link.expires_at).getTime() < Date.now()) throw new Error("Este enlace ha caducado.");

  const { data: primary, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,closed")
    .eq("id", link.class_id)
    .single<DelegateClassRow>();

  if (classError || !primary) throw new Error("Clase no encontrada.");

  const storedMode = delegateModeFromCreatedBy(link.created_by);
  const mode = requestedMode || storedMode;
  const classGroups: Array<"kids" | "adults"> =
    mode === "combined" ? ["adults", "kids"] : [mode === "kids" ? "kids" : "adults"];

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,name,class_group,closed")
    .eq("class_date", primary.class_date)
    .in("class_group", classGroups)
    .order("class_group")
    .returns<DelegateClassRow[]>();

  if (classesError) throw classesError;
  const openClasses = (classes ?? []).filter((clase) => !clase.closed);
  if (!openClasses.length) throw new Error("No hay clases abiertas para este enlace.");
  if (mode === "combined" && openClasses.length < 2) {
    throw new Error("El enlace combinado necesita una clase de adultos y otra de ninos abiertas en el mismo dia.");
  }

  return { link, classes: openClasses, mode };
}

async function findOpenClassIdForDelegate(
  supabase: ReturnType<typeof createAdminClient>,
  classDate: string,
  classGroup: "kids" | "adults",
  legacyId: string
) {
  const { data, error } = await supabase
    .from("classes")
    .select("id")
    .eq("class_date", classDate)
    .eq("class_group", classGroup)
    .eq("closed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error || !data?.id) {
    redirect(`/clases/${legacyId}?error=delegate`);
  }

  return data.id;
}

function normalizeDelegateMode(value: string | null | undefined): DelegateMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["kids", "ninos", "niños"].includes(normalized)) return "kids";
  if (["combined", "combinado"].includes(normalized)) return "combined";
  return "adults";
}

function delegateModeFromCreatedBy(value: string | null | undefined): DelegateMode {
  const [, mode] = String(value ?? "").split(":");
  return normalizeDelegateMode(mode);
}

function getDelegateMemberIdsByClass(formData: FormData) {
  const byClass = new Map<string, string[]>();
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("memberIds:")) continue;
    const classId = key.slice("memberIds:".length);
    const current = byClass.get(classId) ?? [];
    current.push(String(value));
    byClass.set(classId, current);
  }

  if (!byClass.size) {
    const legacyIds = formData.getAll("memberIds").map((value) => String(value)).filter(Boolean);
    const classId = String(formData.get("classId") ?? "");
    if (classId && legacyIds.length) byClass.set(classId, legacyIds);
  }

  return byClass;
}

async function setDelegatePlanCompleted(classId: string, planIds: string[]) {
  const supabase = createAdminClient();
  const { error: resetError } = await supabase
    .from("technical_plans")
    .update({ completed: false, updated_at: new Date().toISOString() })
    .eq("class_id", classId);

  if (resetError) throw resetError;
  if (!planIds.length) return;

  const { error } = await supabase
    .from("technical_plans")
    .update({ completed: true, updated_at: new Date().toISOString() })
    .eq("class_id", classId)
    .in("id", planIds);

  if (error) throw error;
}

async function addAttendanceRows(classId: string, memberIds: string[]) {
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
    throw new Error("No se ha podido guardar la asistencia.");
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
      technical_note: "REGISTRADO POR SUSTITUTO",
      use_for_history: true
    };
  });

  const { data: attendanceRows, error } = await supabase
    .from("attendance_logs")
    .upsert(rows, { onConflict: "legacy_id" })
    .select("id")
    .returns<Array<{ id: string }>>();

  if (error) throw error;

  try {
    await Promise.all((attendanceRows ?? []).map((row) => syncLegacyAttendance(row.id)));
  } catch (syncError) {
    console.error("Error syncing delegate attendance to legacy sheet", syncError);
  }
}
