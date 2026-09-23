"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { closeAdultClass, setPlanTechniqueCompleted } from "@/lib/adult-class-close";
import { generateAdultTechnicalGroups, resolveTrainingGroupGrade } from "@/lib/adult-groups";
import { generateAdultTechnicalPlan } from "@/lib/adult-plan";
import { runSkbcBackup } from "@/lib/backups";
import { grantInternalAccess, hasInternalAccess, revokeInternalAccess } from "@/lib/auth";
import { generateDiplomaForExam } from "@/lib/diplomas";
import { sendStudentEmailNotification, type EmailAudience } from "@/lib/email-notifications";
import { deleteExam, registerExam, saveExamReport } from "@/lib/exams";
import { createIntegratedExamEvent, finalizeIntegratedExamEvent, submitIntegratedExamScores, type IntegratedExamProgram } from "@/lib/integrated-exams";
import { archiveLegacyRowsToDrive } from "@/lib/legacy-rows-archive";
import { retryLegacySheetSyncJob, syncLegacyAttendance, syncLegacyChildBehavior, syncLegacyChildNote, syncLegacyCourse } from "@/lib/legacy-sheet-sync";
import { recalculateClassExamStatus, recalculateMemberExamStatus } from "@/lib/member-exam-status";
import { uploadMemberPhoto } from "@/lib/member-photo";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTelegramDigest, updateTelegramNotificationSetting } from "@/lib/telegram-notifications";
import { createTrashItem, restoreTrashItem } from "@/lib/trash";
import { kidsGrades } from "@/lib/grades";

export async function loginAction(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  const validCodes = [process.env.SKBC_INTERNAL_ACCESS_CODE, "SKBC2026"].filter(Boolean);

  if (!validCodes.includes(code)) {
    redirect("/skbc-interno?error=1");
  }

  await grantInternalAccess();
  redirect("/kenshis");
}

export async function logoutAction() {
  await revokeInternalAccess();
  redirect("/skbc-interno");
}

export async function runManualBackupAction() {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const result = await runSkbcBackup("manual", "Alvaro");
  if (result.status === "failed") {
    redirect(`/backups?error=backup&detail=${encodeURIComponent(result.error ?? "Error desconocido")}`);
  }

  revalidatePath("/backups");
  revalidatePath("/sistema");
  redirect("/backups?saved=backup");
}

export async function runSeasonBackupAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const seasonName = String(formData.get("seasonName") ?? "").trim() || "Cierre de temporada";
  const periodFrom = String(formData.get("periodFrom") ?? "").trim();
  const periodTo = String(formData.get("periodTo") ?? "").trim();
  const label = [seasonName, periodFrom && periodTo ? `${periodFrom} a ${periodTo}` : ""].filter(Boolean).join(" - ");

  const result = await runSkbcBackup("manual", label);
  if (result.status === "failed") {
    redirect(`/backups?error=season&detail=${encodeURIComponent(result.error ?? "Error desconocido")}`);
  }

  revalidatePath("/backups");
  revalidatePath("/sistema");
  revalidatePath("/salud-supabase");
  redirect("/backups?saved=season");
}

export async function archiveLegacyRowsAction() {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const result = await archiveLegacyRowsToDrive("Alvaro");
  if (result.status === "failed") {
    redirect(`/salud-supabase?error=legacy-archive&detail=${encodeURIComponent(result.error ?? "Error desconocido")}`);
  }

  revalidatePath("/salud-supabase");
  revalidatePath("/backups");
  revalidatePath("/importacion");
  redirect("/salud-supabase?saved=legacy-archive");
}

export async function dismissAdminAlertAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const alertKey = String(formData.get("alertKey") ?? "").trim();
  if (!alertKey) {
    redirect("/alertas?error=dismiss");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admin_alert_dismissals")
    .upsert({ alert_key: alertKey, dismissed_by: "Alvaro" }, { onConflict: "alert_key" });

  if (error) {
    console.error("Error dismissing admin alert", error);
    redirect(`/alertas?error=dismiss&detail=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/alertas");
  revalidatePath("/sistema");
  redirect("/alertas?saved=dismiss");
}

export async function dismissSelectedAdminAlertsAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const alertKeys = formData
    .getAll("alertKey")
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (!alertKeys.length) {
    redirect("/alertas?error=no-selection");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admin_alert_dismissals")
    .upsert(
      alertKeys.map((alertKey) => ({ alert_key: alertKey, dismissed_by: "Alvaro" })),
      { onConflict: "alert_key" }
    );

  if (error) {
    console.error("Error dismissing selected admin alerts", error);
    redirect(`/alertas?error=dismiss&detail=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/alertas");
  revalidatePath("/sistema");
  redirect("/alertas?saved=dismiss-selected");
}

export async function restoreTrashItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const trashId = String(formData.get("trashId") ?? "").trim();
  if (!trashId) {
    redirect("/papelera?error=restore");
  }

  try {
    await restoreTrashItem(trashId);
  } catch (error) {
    console.error("Error restoring trash item", error);
    redirect(`/papelera?error=restore&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath("/papelera");
  revalidatePath("/sistema");
  revalidatePath("/control-dia");
  redirect("/papelera?saved=restore");
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

  const { data: closedAdultClasses, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("class_group", "adults")
    .eq("closed", true)
    .returns<Array<{ id: string }>>();

  if (classError) {
    console.error("Error loading closed adult classes for technical history repair", classError);
    redirect("/proximos-examenes?error=recalculate");
  }

  for (const clase of closedAdultClasses ?? []) {
    await closeAdultClass(clase.id);
  }

  for (const member of data ?? []) {
    await recalculateMemberExamStatus(member.id);
  }
  await recalculateChildRankings();

  redirect("/proximos-examenes?saved=recalculate");
}

export async function sendTelegramNotificationAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const type = String(formData.get("type") ?? "");
  const allowed = ["daily_ranking", "monthly_stats", "semester_stats", "yearly_stats", "test"] as const;
  if (!allowed.includes(type as typeof allowed[number])) {
    redirect("/notificaciones?error=telegram");
  }

  const result = await sendTelegramDigest(type as typeof allowed[number], { force: true });
  if (result.status === "failed") {
    redirect(`/notificaciones?error=telegram&detail=${encodeURIComponent(result.error ?? "Error desconocido")}`);
  }

  redirect(`/notificaciones?saved=${result.status}`);
}

export async function sendStudentEmailNotificationAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const audience = String(formData.get("audience") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const allowed = ["all_active", "adults", "kids", "exam_ready", "exam_upcoming", "inactive"] as const;

  if (!allowed.includes(audience as EmailAudience) || !subject || !body) {
    redirect("/notificaciones?error=email&detail=Faltan%20datos%20del%20email");
  }

  let result: Awaited<ReturnType<typeof sendStudentEmailNotification>>;
  try {
    result = await sendStudentEmailNotification({
      audience: audience as EmailAudience,
      subject,
      body
    });
  } catch (error) {
    console.error("Error sending student email notification", error);
    redirect(`/notificaciones?error=email&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect(`/notificaciones?saved=email&detail=${encodeURIComponent(`${result.sentCount}/${result.recipientCount} emails enviados`)}`);
}

export async function updateTelegramNotificationSettingAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const type = String(formData.get("type") ?? "");
  const enabled = formData.get("enabled") === "on";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const pauseStartsOn = String(formData.get("pauseStartsOn") ?? "").trim() || null;
  const pauseEndsOn = String(formData.get("pauseEndsOn") ?? "").trim() || null;
  const allowed = ["daily_ranking", "monthly_stats", "semester_stats", "yearly_stats"] as const;

  if (!allowed.includes(type as typeof allowed[number])) {
    redirect("/notificaciones?error=settings");
  }

  try {
    await updateTelegramNotificationSetting(type as typeof allowed[number], enabled, reason, pauseStartsOn, pauseEndsOn);
  } catch (error) {
    console.error("Error updating Telegram notification setting", error);
    redirect("/notificaciones?error=settings");
  }

  redirect("/notificaciones?saved=settings");
}

export async function updateTelegramScheduledPauseAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const type = String(formData.get("type") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const pauseStartsOn = String(formData.get("pauseStartsOn") ?? "").trim() || null;
  const pauseEndsOn = String(formData.get("pauseEndsOn") ?? "").trim() || null;
  const enabled = formData.get("clear") === "on" ? true : formData.get("enabled") === "on";
  const allowed = ["daily_ranking", "monthly_stats", "semester_stats", "yearly_stats"] as const;

  if (!allowed.includes(type as typeof allowed[number])) {
    redirect("/notificaciones?error=settings");
  }

  try {
    await updateTelegramNotificationSetting(
      type as typeof allowed[number],
      enabled,
      reason,
      formData.get("clear") === "on" ? null : pauseStartsOn,
      formData.get("clear") === "on" ? null : pauseEndsOn
    );
  } catch (error) {
    console.error("Error updating Telegram scheduled pause", error);
    redirect("/notificaciones?error=settings");
  }

  redirect("/notificaciones?saved=settings");
}

export async function createInternalNoticeAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim() || null;
  const area = normalizeInternalNoticeArea(String(formData.get("area") ?? ""));
  const priority = normalizeInternalNoticePriority(String(formData.get("priority") ?? ""));
  const dueOn = String(formData.get("dueOn") ?? "").trim() || null;
  const pinned = formData.get("pinned") === "on";
  const createdBy = String(formData.get("createdBy") ?? "").trim() || "Alvaro";

  if (!title) {
    redirect("/avisos?error=notice");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("internal_notices").insert({
    title,
    body,
    area,
    priority,
    due_on: dueOn,
    pinned,
    created_by: createdBy
  });

  if (error) {
    console.error("Error creating internal notice", error);
    redirect("/avisos?error=notice");
  }

  revalidatePath("/avisos");
  revalidatePath("/sistema");
  redirect("/avisos?saved=notice");
}

export async function updateInternalNoticeStatusAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const id = String(formData.get("id") ?? "").trim();
  const status = normalizeInternalNoticeStatus(String(formData.get("status") ?? ""));
  const resolvedBy = String(formData.get("resolvedBy") ?? "").trim() || "Alvaro";

  if (!id) {
    redirect("/avisos?error=notice");
  }

  const payload: Record<string, string | null> = {
    status,
    updated_at: new Date().toISOString()
  };
  if (status === "done") {
    payload.resolved_on = new Date().toISOString().slice(0, 10);
    payload.resolved_by = resolvedBy;
  }
  if (status === "open" || status === "in_progress") {
    payload.resolved_on = null;
    payload.resolved_by = null;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("internal_notices").update(payload).eq("id", id);

  if (error) {
    console.error("Error updating internal notice", error);
    redirect("/avisos?error=notice");
  }

  revalidatePath("/avisos");
  revalidatePath("/sistema");
  redirect("/avisos?saved=notice");
}

function normalizeInternalNoticeArea(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["clases", "kenshis", "examenes", "cursos", "entregas", "fichas", "sistema"].includes(normalized)) return normalized;
  return "general";
}

function normalizeInternalNoticePriority(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["low", "normal", "high", "urgent"].includes(normalized)) return normalized;
  return "normal";
}

function normalizeInternalNoticeStatus(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["open", "in_progress", "done", "archived"].includes(normalized)) return normalized;
  return "open";
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
  const returnPath = safeTechniqueReturnPath(String(formData.get("returnPath") ?? ""));
  if (!(await hasInternalAccess()) || !legacyId) {
    redirect("/tecnicas?error=technique");
  }

  const active = formData.get("active") === "on";
  const activeInPlanning = active && formData.get("activeInPlanning") === "on";
  const supabase = createAdminClient();
  const { data: currentTechnique } = await supabase
    .from("techniques")
    .select("summary_es")
    .eq("legacy_id", legacyId)
    .maybeSingle<{ summary_es: string | null }>();
  const now = new Date().toISOString();
  const nextSummary = String(formData.get("summaryEs") ?? "").trim();
  const summaryChanged = (currentTechnique?.summary_es ?? "").trim() !== nextSummary;
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    grade: String(formData.get("grade") ?? "").trim() || "SIN GRADO",
    base_name: String(formData.get("baseName") ?? "").trim() || null,
    variant: String(formData.get("variant") ?? "").trim() || null,
    variant_note: String(formData.get("variantNote") ?? "").trim() || null,
    category: normalizeTechniqueCategoryInput(String(formData.get("category") ?? "")),
    content_type: String(formData.get("contentType") ?? "").trim() || null,
    summary_es: nextSummary,
    active,
    active_in_planning: activeInPlanning,
    updated_at: now,
    ...(summaryChanged ? { summary_updated_at: now, summary_updated_by: "Admin SKBC" } : {})
  };

  if (!payload.name || !payload.category) {
    redirect(addTechniqueParams(returnPath, { error: "technique", edit: legacyId }));
  }

  const { error } = await supabase
    .from("techniques")
    .update(payload)
    .eq("legacy_id", legacyId);

  if (error) {
    console.error("Error updating technique", error);
    redirect(addTechniqueParams(returnPath, { error: "technique", edit: legacyId }));
  }

  revalidatePath("/tecnicas");
  redirect(addTechniqueParams(returnPath, { saved: "technique", technique: legacyId }));
}

function safeTechniqueReturnPath(value: string) {
  const path = value.trim();
  if (!path.startsWith("/tecnicas") || path.startsWith("//")) return "/tecnicas";
  return path;
}

function addTechniqueParams(path: string, values: Record<string, string>) {
  const url = new URL(path, "https://skbc.local");
  url.searchParams.delete("edit");
  url.searchParams.delete("saved");
  url.searchParams.delete("error");
  url.searchParams.delete("technique");
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}`;
}

export async function updateKenshiAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");

  if (!memberId || !legacyId) {
    redirect("/kenshis");
  }

  const joinedOn = parseDateInput(String(formData.get("joinedOn") ?? ""));
  const birthDate = parseDateInput(String(formData.get("birthDate") ?? ""));
  const freeTrial = resolveFreeTrialFields(formData, joinedOn);
  const payload = {
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    ika_id: String(formData.get("ikaId") ?? "").trim() || null,
    class: normalizeClass(String(formData.get("class") ?? "")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    grade: String(formData.get("grade") ?? "").trim() || null,
    joined_on: joinedOn,
    birth_date: birthDate,
    exam_history: String(formData.get("examHistory") ?? "").trim() || null,
    site_url: String(formData.get("siteUrl") ?? "").trim() || null,
    family_email: String(formData.get("familyEmail") ?? "").trim() || null,
    guardian_name: String(formData.get("guardianName") ?? "").trim() || null,
    guardian_phone: String(formData.get("guardianPhone") ?? "").trim() || null,
    student_phone: String(formData.get("studentPhone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    free_trial_enabled: freeTrial.enabled,
    free_trial_started_on: freeTrial.startedOn,
    free_trial_ends_on: freeTrial.endsOn,
    ...(freeTrial.enabled ? {} : { free_trial_notice_read_at: null }),
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
    await recalculateChildRankings();
  } catch (error) {
    console.error("Error recalculating kenshi exam status", error);
  }

  redirect(`/kenshis/${legacyId}?saved=kenshi`);
}

export async function createKenshiAction(formData: FormData) {
  const joinedOn = parseDateInput(String(formData.get("joinedOn") ?? ""));
  const birthDate = parseDateInput(String(formData.get("birthDate") ?? ""));
  const freeTrial = resolveFreeTrialFields(formData, joinedOn);
  const payload = {
    first_name: String(formData.get("firstName") ?? "").trim(),
    last_name: String(formData.get("lastName") ?? "").trim() || null,
    ika_id: String(formData.get("ikaId") ?? "").trim() || null,
    class: normalizeClass(String(formData.get("class") ?? "")),
    status: normalizeStatus(String(formData.get("status") ?? "")),
    grade: String(formData.get("grade") ?? "").trim() || null,
    joined_on: joinedOn,
    birth_date: birthDate,
    exam_history: String(formData.get("examHistory") ?? "").trim() || null,
    site_url: String(formData.get("siteUrl") ?? "").trim() || null,
    family_email: String(formData.get("familyEmail") ?? "").trim() || null,
    guardian_name: String(formData.get("guardianName") ?? "").trim() || null,
    guardian_phone: String(formData.get("guardianPhone") ?? "").trim() || null,
    student_phone: String(formData.get("studentPhone") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    free_trial_enabled: freeTrial.enabled,
    free_trial_started_on: freeTrial.startedOn,
    free_trial_ends_on: freeTrial.endsOn,
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
    await recalculateChildRankings();
  } catch (error) {
    console.error("Error recalculating new kenshi exam status", error);
  }

  redirect(`/kenshis/${data.legacy_id}?saved=kenshi`);
}

export async function markFreeTrialNoticeReadAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const memberId = String(formData.get("memberId") ?? "").trim();
  const returnPath = safeReturnPath(String(formData.get("returnPath") ?? "")) || "/avisos";
  if (!memberId) {
    redirect(`${returnPath}?error=trial`);
  }

  const { error } = await createAdminClient()
    .from("members")
    .update({ free_trial_notice_read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    console.error("Error marking free trial notice as read", error);
    redirect(`${returnPath}?error=trial`);
  }

  revalidatePath("/avisos");
  revalidatePath("/sistema");
  redirect(`${returnPath}?saved=trial`);
}

export async function upsertTechnicalAreaLinkAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const memberClass = normalizeClass(String(formData.get("memberClass") ?? ""));
  const grade = String(formData.get("grade") ?? "").trim();
  const targetGrade = String(formData.get("targetGrade") ?? "").trim() || null;
  const url = String(formData.get("url") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim() || "AREA TECNICA PERSONAL";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const active = formData.get("active") === "on";

  if (!memberClass || !grade || !url) {
    redirect("/areas-tecnicas?error=link");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("technical_area_links")
    .upsert({
      member_class: memberClass,
      grade,
      target_grade: targetGrade,
      url,
      label,
      notes,
      active,
      updated_at: new Date().toISOString()
    }, { onConflict: "member_class,grade" });

  if (error) {
    console.error("Error saving technical area link", error);
    redirect("/areas-tecnicas?error=link");
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/ficha/[token]", "page");
  redirect(`/areas-tecnicas?saved=link&class=${memberClass}`);
}

export async function createTechnicalAreaMaterialAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const memberClass = normalizeTechnicalMaterialClass(String(formData.get("memberClass") ?? ""));
  const grades = formData
    .getAll("grades")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const materialType = normalizeTechnicalMaterialType(String(formData.get("materialType") ?? ""));
  const url = String(formData.get("url") ?? "").trim();
  const section = normalizeTechnicalMaterialSection(formData);
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "100"), 10);

  if (!memberClass || !grades.length || !title || !url) {
    redirect(`/areas-tecnicas?error=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
  }

  const { error } = await createAdminClient()
    .from("technical_area_materials")
    .insert(grades.map((grade) => ({
      member_class: memberClass,
      grade,
      title,
      description,
      material_type: materialType,
      url,
      section,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      active: formData.get("active") !== "off"
    })));

  if (error) {
    console.error("Error creating technical area material", error);
    redirect(`/areas-tecnicas?error=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect(`/areas-tecnicas?saved=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
}

export async function updateTechnicalAreaMaterialAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const id = String(formData.get("id") ?? "").trim();
  const memberClass = normalizeTechnicalMaterialClass(String(formData.get("memberClass") ?? ""));
  const grade = String(formData.get("grade") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const materialType = normalizeTechnicalMaterialType(String(formData.get("materialType") ?? ""));
  const url = String(formData.get("url") ?? "").trim();
  const section = normalizeTechnicalMaterialSection(formData);
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "100"), 10);
  const active = formData.get("active") === "on";

  if (!id || !memberClass || !grade || !title || !url) {
    redirect(`/areas-tecnicas?error=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
  }

  const { error } = await createAdminClient()
    .from("technical_area_materials")
    .update({
      member_class: memberClass,
      grade,
      title,
      description,
      material_type: materialType,
      url,
      section,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      active,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating technical area material", error);
    redirect(`/areas-tecnicas?error=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect(`/areas-tecnicas?saved=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
}

export async function updateTechnicalAreaMaterialGroupAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const ids = String(formData.get("materialIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const memberClass = normalizeTechnicalMaterialClass(String(formData.get("memberClass") ?? ""));
  const selectedClass = normalizeClass(String(formData.get("selectedClass") ?? "")) ?? (memberClass === "kids" ? "kids" : "adults");
  const grades = formData
    .getAll("grades")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const materialType = normalizeTechnicalMaterialType(String(formData.get("materialType") ?? ""));
  const url = String(formData.get("url") ?? "").trim();
  const section = normalizeTechnicalMaterialSection(formData);
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "100"), 10);
  const active = formData.get("active") === "on";

  if (!ids.length || !memberClass || !grades.length || !title || !url) {
    redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);
  }

  const supabase = createAdminClient();
  const { data: existingRows, error: readError } = await supabase
    .from("technical_area_materials")
    .select("id,grade")
    .in("id", ids);

  if (readError || !existingRows?.length) {
    console.error("Error reading technical material group", readError);
    redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);
  }

  const now = new Date().toISOString();
  const payload = {
    member_class: memberClass,
    title,
    description,
    material_type: materialType,
    url,
    section,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
    active,
    updated_at: now
  };
  const existingByGrade = new Map(existingRows.map((row) => [String(row.grade), String(row.id)]));
  const idsToKeep = grades.map((grade) => existingByGrade.get(grade)).filter(Boolean) as string[];
  const idsToDelete = ids.filter((id) => !idsToKeep.includes(id));
  const rowsToInsert = grades
    .filter((grade) => !existingByGrade.has(grade))
    .map((grade) => ({ ...payload, grade }));

  if (idsToDelete.length) {
    const { error } = await supabase.from("technical_area_materials").delete().in("id", idsToDelete);
    if (error) {
      console.error("Error deleting removed technical material grades", error);
      redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);
    }
  }

  if (idsToKeep.length) {
    const { error } = await supabase.from("technical_area_materials").update(payload).in("id", idsToKeep);
    if (error) {
      console.error("Error updating technical material group", error);
      redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);
    }
  }

  if (rowsToInsert.length) {
    const { error } = await supabase.from("technical_area_materials").insert(rowsToInsert);
    if (error) {
      console.error("Error inserting new technical material grades", error);
      redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);
    }
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect(`/areas-tecnicas?saved=material&class=${selectedClass}`);
}

export async function deleteTechnicalAreaMaterialGroupAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const ids = String(formData.get("materialIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const selectedClass = normalizeClass(String(formData.get("selectedClass") ?? "")) ?? "adults";
  if (!ids.length) redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);

  const { error } = await createAdminClient()
    .from("technical_area_materials")
    .delete()
    .in("id", ids);

  if (error) {
    console.error("Error deleting technical material group", error);
    redirect(`/areas-tecnicas?error=material&class=${selectedClass}`);
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect(`/areas-tecnicas?saved=material-deleted&class=${selectedClass}`);
}

export async function deleteTechnicalAreaMaterialAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const id = String(formData.get("id") ?? "").trim();
  const memberClass = normalizeTechnicalMaterialClass(String(formData.get("memberClass") ?? "")) || "adults";
  if (!id) redirect(`/areas-tecnicas?error=material&class=${memberClass === "kids" ? "kids" : "adults"}`);

  const { error } = await createAdminClient()
    .from("technical_area_materials")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting technical area material", error);
    redirect(`/areas-tecnicas?error=material&class=${memberClass === "kids" ? "kids" : "adults"}`);
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect(`/areas-tecnicas?saved=material-deleted&class=${memberClass === "kids" ? "kids" : "adults"}`);
}

export async function createChildSyllabusItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const grade = normalizeChildSyllabusGrade(String(formData.get("grade") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const category = normalizeChildSyllabusCategory(String(formData.get("category") ?? ""));
  const description = String(formData.get("description") ?? "").trim() || null;
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "100"), 10);

  if (!grade || !title) {
    redirect("/areas-tecnicas?error=child-program&class=kids");
  }

  const { error } = await createAdminClient()
    .from("child_syllabus_items")
    .insert({
      grade,
      title,
      category,
      description,
      exam_relevant: formData.get("examRelevant") === "on",
      active: formData.get("active") === "on",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      created_by: "Alvaro",
      updated_by: "Alvaro"
    });

  if (error) {
    console.error("Error creating child syllabus item", error);
    redirect("/areas-tecnicas?error=child-program&class=kids");
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect("/areas-tecnicas?saved=child-program&class=kids");
}

export async function updateChildSyllabusItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const id = String(formData.get("id") ?? "").trim();
  const grade = normalizeChildSyllabusGrade(String(formData.get("grade") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const category = normalizeChildSyllabusCategory(String(formData.get("category") ?? ""));
  const description = String(formData.get("description") ?? "").trim() || null;
  const sortOrder = Number.parseInt(String(formData.get("sortOrder") ?? "100"), 10);

  if (!id || !grade || !title) {
    redirect("/areas-tecnicas?error=child-program&class=kids");
  }

  const { error } = await createAdminClient()
    .from("child_syllabus_items")
    .update({
      grade,
      title,
      category,
      description,
      exam_relevant: formData.get("examRelevant") === "on",
      active: formData.get("active") === "on",
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      updated_by: "Alvaro",
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  if (error) {
    console.error("Error updating child syllabus item", error);
    redirect("/areas-tecnicas?error=child-program&class=kids");
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect("/areas-tecnicas?saved=child-program&class=kids");
}

export async function deleteChildSyllabusItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/skbc-interno");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/areas-tecnicas?error=child-program&class=kids");

  const { error } = await createAdminClient()
    .from("child_syllabus_items")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting child syllabus item", error);
    redirect("/areas-tecnicas?error=child-program&class=kids");
  }

  revalidatePath("/areas-tecnicas");
  revalidatePath("/alumno/area-tecnica/[token]", "page");
  redirect("/areas-tecnicas?saved=child-program-deleted&class=kids");
}

export async function createDistributionCampaignAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const title = String(formData.get("title") ?? "").trim();
  const audience = normalizeDistributionAudience(String(formData.get("audience") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const itemLabels = parseDistributionItemLabels(formData);

  if (!title) redirect("/entregas?error=campaign");

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("distribution_campaigns")
    .insert({
      title,
      audience,
      notes,
      active: true
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data?.id) {
    console.error("Error creating distribution campaign", error);
    redirect("/entregas?error=campaign");
  }

  const { error: itemsError } = await supabase.from("distribution_campaign_items").insert(
    itemLabels.map((label, index) => ({
      campaign_id: data.id,
      label,
      position: index + 1,
      active: true
    }))
  );

  if (itemsError) {
    console.error("Error creating distribution campaign items", itemsError);
    redirect(`/entregas?campaign=${data.id}&error=campaign`);
  }

  revalidatePath("/entregas");
  redirect(`/entregas?campaign=${data.id}&saved=campaign`);
}

export async function updateDistributionCampaignAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const campaignId = String(formData.get("campaignId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const audience = normalizeDistributionAudience(String(formData.get("audience") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const active = formData.get("active") === "on";
  const itemLabels = parseDistributionItemLabels(formData);

  if (!campaignId || !title) redirect("/entregas?error=campaign");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("distribution_campaigns")
    .update({ title, audience, notes, active, updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  if (error) {
    console.error("Error updating distribution campaign", error);
    redirect(`/entregas?campaign=${campaignId}&error=campaign`);
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from("distribution_campaign_items")
    .select("id,label")
    .eq("campaign_id", campaignId)
    .returns<Array<{ id: string; label: string }>>();

  if (existingItemsError) {
    console.error("Error loading distribution campaign items", existingItemsError);
    redirect(`/entregas?campaign=${campaignId}&error=campaign`);
  }

  const existingByLabel = new Map((existingItems ?? []).map((item) => [normalizeDistributionLabelKey(item.label), item]));
  const keptItemIds: string[] = [];

  for (const [index, label] of itemLabels.entries()) {
    const existing = existingByLabel.get(normalizeDistributionLabelKey(label));
    if (existing) {
      keptItemIds.push(existing.id);
      const { error: updateItemError } = await supabase
        .from("distribution_campaign_items")
        .update({ label, position: index + 1, active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (updateItemError) {
        console.error("Error updating distribution campaign item", updateItemError);
        redirect(`/entregas?campaign=${campaignId}&error=campaign`);
      }
    } else {
      const { data: insertedItem, error: insertItemError } = await supabase
        .from("distribution_campaign_items")
        .insert({
          campaign_id: campaignId,
          label,
          position: index + 1,
          active: true
        })
        .select("id")
        .single<{ id: string }>();

      if (insertItemError || !insertedItem?.id) {
        console.error("Error saving distribution campaign item", insertItemError);
        redirect(`/entregas?campaign=${campaignId}&error=campaign`);
      }
      keptItemIds.push(insertedItem.id);
    }
  }

  const removedItems = (existingItems ?? []).filter((item) => !keptItemIds.includes(item.id));
  if (removedItems.length) {
    const { error: deactivateItemsError } = await supabase
      .from("distribution_campaign_items")
      .update({ active: false, updated_at: new Date().toISOString() })
      .in("id", removedItems.map((item) => item.id));

    if (deactivateItemsError) {
      console.error("Error deactivating distribution campaign items", deactivateItemsError);
      redirect(`/entregas?campaign=${campaignId}&error=campaign`);
    }
  }

  revalidatePath("/entregas");
  redirect(`/entregas?campaign=${campaignId}&saved=campaign`);
}

export async function deleteDistributionCampaignAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) redirect("/entregas?error=campaign");

  const supabase = createAdminClient();
  const [{ data: campaign }, { data: items }, { data: checks }] = await Promise.all([
    supabase.from("distribution_campaigns").select("*").eq("id", campaignId).maybeSingle(),
    supabase.from("distribution_campaign_items").select("*").eq("campaign_id", campaignId),
    supabase.from("distribution_delivery_checks").select("*").eq("campaign_id", campaignId)
  ]);

  if (campaign) {
    await createTrashItem({
      supabase,
      entityType: "distribution_campaign",
      entityLabel: String((campaign as { title?: string }).title ?? "Entrega"),
      sourceTable: "distribution_campaigns",
      sourceId: campaignId,
      snapshot: campaign,
      relatedSnapshots: {
        distribution_campaign_items: items ?? [],
        distribution_delivery_checks: checks ?? []
      },
      affectedMemberIds: Array.from(new Set((checks ?? []).map((row: { member_id?: string }) => row.member_id).filter(Boolean) as string[])),
      notes: "Entrega archivada desde el panel."
    });
  }

  const { error } = await supabase
    .from("distribution_campaigns")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  if (error) {
    console.error("Error archiving distribution campaign", error);
    redirect(`/entregas?campaign=${campaignId}&error=campaign`);
  }

  revalidatePath("/entregas");
  redirect("/entregas?saved=deleted");
}

export async function toggleDistributionDeliveryAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const campaignId = String(formData.get("campaignId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const checked = String(formData.get("checked") ?? "") === "1";

  if (!campaignId || !itemId || !memberId) redirect("/entregas?error=delivery");

  const supabase = createAdminClient();
  if (checked) {
    const { error } = await supabase
      .from("distribution_delivery_checks")
      .upsert({
        campaign_id: campaignId,
        item_id: itemId,
        member_id: memberId,
        checked: true,
        checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "item_id,member_id" });

    if (error) {
      console.error("Error marking delivery", error);
      redirect(`/entregas?campaign=${campaignId}&error=delivery`);
    }
  } else {
    const { error } = await supabase
      .from("distribution_delivery_checks")
      .delete()
      .eq("item_id", itemId)
      .eq("member_id", memberId);

    if (error) {
      console.error("Error unmarking delivery", error);
      redirect(`/entregas?campaign=${campaignId}&error=delivery`);
    }
  }

  revalidatePath("/entregas");
  redirect(`/entregas?campaign=${campaignId}&saved=delivery`);
}

function normalizeDistributionAudience(value: string) {
  return value === "kids" || value === "adults" ? value : "all";
}

function parseDistributionItemLabels(formData: FormData) {
  const raw = [
    ...formData.getAll("itemLabels").map((value) => String(value)),
    String(formData.get("itemLabelsText") ?? "")
  ].join("\n");
  const labels = raw
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique = labels.filter((label) => {
    const key = label.toLocaleLowerCase("es");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.length ? unique.slice(0, 12) : ["Entregado"];
}

function normalizeDistributionLabelKey(value: string) {
  return value.trim().toLocaleLowerCase("es");
}

function normalizeActionGrade(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function resolveActionTargetGrade(value: string | null | undefined) {
  const grade = normalizeActionGrade(value);
  const order = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN", "6 DAN", "7 DAN", "8 DAN", "9 DAN"];
  const index = order.indexOf(grade);
  if (index === -1) return grade || null;
  return order[Math.min(index + 1, order.length - 1)];
}

export async function generateAdultPlanAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));

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

export async function addManualClassTechniqueAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const techniqueId = String(formData.get("techniqueId") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const selectedGrades = formData.getAll("grades").map((value) => String(value)).filter(Boolean);

  if (!classId || !legacyId || !techniqueId) {
    redirect(`/clases/${legacyId || ""}?error=manual-technique`);
  }

  const supabase = createAdminClient();

  try {
    const [{ data: clase, error: classError }, { data: technique, error: techniqueError }, { data: groups, error: groupsError }, { data: maxPlan }] =
      await Promise.all([
        supabase
          .from("classes")
          .select("id,class_date,class_group,class_type,closed")
          .eq("id", classId)
          .single<{ id: string; class_date: string; class_group: "kids" | "adults"; class_type: string | null; closed: boolean }>(),
        supabase
          .from("techniques")
          .select("id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,score")
          .eq("id", techniqueId)
          .single<{
            id: string;
            grade: string;
            base_name: string | null;
            name: string;
            variant: string | null;
            variant_note: string | null;
            category: string | null;
            content_type: string | null;
            summary_es: string | null;
            score: number | null;
          }>(),
        supabase
          .from("class_technical_groups")
          .select("id,grade,active")
          .eq("class_id", classId)
          .eq("active", true)
          .returns<Array<{ id: string; grade: string; active: boolean }>>(),
        supabase
          .from("technical_plans")
          .select("suggested_order")
          .eq("class_id", classId)
          .order("suggested_order", { ascending: false })
          .limit(1)
          .returns<Array<{ suggested_order: number | null }>>()
      ]);

    if (classError || !clase) throw classError ?? new Error("Clase no encontrada.");
    if (techniqueError || !technique) throw techniqueError ?? new Error("Tecnica no encontrada.");
    if (groupsError) throw groupsError;
    if (clase.closed || clase.class_group !== "adults") throw new Error("Solo se pueden anadir tecnicas manuales a clases adultas abiertas.");

    const normalizedSelected = new Set(selectedGrades.map(normalizeActionGrade));
    const targetGroups = (groups ?? []).filter((group) => !normalizedSelected.size || normalizedSelected.has(normalizeActionGrade(group.grade)));
    if (!targetGroups.length) throw new Error("No hay grupos tecnicos para ese alcance.");

    const baseOrder = (maxPlan?.[0]?.suggested_order ?? 0) + 1;
    const legacyPrefix = `PLA_MAN_${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const inserts = targetGroups.map((group, index) => ({
      legacy_id: `${legacyPrefix}_${String(index + 1).padStart(3, "0")}`,
      class_id: clase.id,
      technical_group_id: group.id,
      class_date: clase.class_date,
      session_type: clase.class_type,
      grade: group.grade,
      group_grade: group.grade,
      target_grade: resolveActionTargetGrade(group.grade),
      technique_id: technique.id,
      technique_grade: technique.grade,
      technique_base: technique.base_name,
      technique_name: technique.name,
      variant: technique.variant,
      variant_note: technique.variant_note,
      category: normalizeTechniqueCategoryInput(technique.category ?? ""),
      content_type: technique.content_type,
      summary_es: technique.summary_es,
      proposal_type: "COMUN MANUAL",
      focus: "TECNICA COMUN",
      suggested_order: baseOrder + index,
      score_at_that_moment: technique.score ?? 0,
      completed: true,
      notes: normalizedSelected.size ? "Tecnica comun anadida manualmente para grados seleccionados." : "Tecnica comun anadida manualmente para toda la clase.",
      used_for_history: true,
      updated_at: now
    }));

    const { error: insertError } = await supabase.from("technical_plans").insert(inserts);
    if (insertError) throw insertError;
  } catch (error) {
    console.error("Error adding manual class technique", error);
    redirect(`/clases/${legacyId}?error=manual-technique&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath(`/clases/${legacyId}`);
  redirect(returnTo || `/clases/${legacyId}?saved=manual-technique#plan-tecnico`);
}

export async function removeManualClassTechniqueAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const planIds = String(formData.get("planIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!classId || !legacyId || !planIds.length) {
    redirect(`/clases/${legacyId || ""}?error=manual-technique-remove`);
  }

  const supabase = createAdminClient();

  try {
    const { data: clase, error: classError } = await supabase
      .from("classes")
      .select("id,closed")
      .eq("id", classId)
      .single<{ id: string; closed: boolean }>();
    if (classError || !clase) throw classError ?? new Error("Clase no encontrada.");
    if (clase.closed) throw new Error("No se pueden quitar tecnicas manuales de una clase cerrada.");

    const { error } = await supabase
      .from("technical_plans")
      .delete()
      .eq("class_id", classId)
      .eq("proposal_type", "COMUN MANUAL")
      .in("id", planIds);
    if (error) throw error;
  } catch (error) {
    console.error("Error removing manual class technique", error);
    redirect(`/clases/${legacyId}?error=manual-technique-remove&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath(`/clases/${legacyId}`);
  redirect(returnTo || `/clases/${legacyId}?saved=manual-technique-remove#plan-tecnico`);
}

export async function prepareAdultClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnLegacyId = String(formData.get("returnLegacyId") ?? legacyId);
  const returnStep = String(formData.get("returnStep") ?? "");
  const returnStepQuery = returnStep ? `&step=${encodeURIComponent(returnStep)}` : "";

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

  const nextStep = mode === "combined" ? "kids-attendance" : mode === "kids" ? "attendance" : "technical";
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
  const nextStep = String(formData.get("nextStep") ?? "").trim();
  const memberIdsByClass = getDelegateMemberIdsByClass(formData);
  const totalMembers = [...memberIdsByClass.values()].reduce((count, ids) => count + ids.length, 0);
  const isPartialCombinedStep = mode === "combined" && nextStep === "technical";

  if (!token || !totalMembers) {
    redirect(`/delegado/${token || "error"}?mode=${mode}&step=${isPartialCombinedStep ? "kids-attendance" : "attendance"}&error=attendance`);
  }

  try {
    const { link, classes } = await getValidDelegateContext(token, mode);
    const classesToProcess = isPartialCombinedStep
      ? classes.filter((clase) => clase.class_group === "kids")
      : classes;
    for (const clase of classesToProcess) {
      const memberIds = memberIdsByClass.get(clase.id) ?? [];
      if (memberIds.length) {
        await addAttendanceRows(clase.id, memberIds, "REGISTRADO POR SUSTITUTO", formData);
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

    if (classesToProcess.some((clase) => clase.class_group === "kids")) {
      await recalculateChildRankings();
    }

    const supabase = createAdminClient();
    if (isPartialCombinedStep) {
      await supabase
        .from("class_delegate_links")
        .update({ delegate_name: delegateName, started_at: link.started_at ?? new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", link.id);
    } else {
      await supabase
        .from("class_delegate_links")
        .update({ delegate_name: delegateName, closed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", link.id);
    }
  } catch (error) {
    console.error("Error submitting delegate class", error);
    redirect(`/delegado/${token}?mode=${mode}&step=${isPartialCombinedStep ? "kids-attendance" : "attendance"}&error=submit&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  if (isPartialCombinedStep) {
    redirect(`/delegado/${token}?mode=${mode}&started=1&step=technical`);
  }
  redirect(`/delegado/${token}?mode=${mode}&saved=sent`);
}

export async function createClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classDate = parseDateInput(String(formData.get("classDate") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const classGroupRaw = String(formData.get("classGroup") ?? "");
  const classGroup = normalizeClass(classGroupRaw) ?? "adults";
  const combinedClass = classGroupRaw === "combined";
  const classType = String(formData.get("classType") ?? "").trim() || null;
  const specialClass = isSpecialClassType(classType);
  const responsible = String(formData.get("responsible") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const delegateFlow = String(formData.get("delegateFlow") ?? "") === "1";
  const dojoFlow = String(formData.get("dojoFlow") ?? "") === "1";

  if (!classDate || !name) {
    redirect(dojoFlow ? "/skbc-interno/dojo?error=class" : "/clases/nueva?error=class");
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
    redirect(dojoFlow ? "/skbc-interno/dojo?error=class" : "/clases/nueva?error=class");
  }

  if (combinedClass) {
    const { error: kidsError } = await supabase
      .from("classes")
      .insert({
        legacy_id: `NEW-CLA-KIDS-${Date.now()}`,
        class_date: classDate,
        name: `${name} ninos`,
        class_group: "kids",
        class_type: classType,
        responsible,
        notes,
        status: "pending"
      });

    if (kidsError) {
      console.error("Error creating combined kids class", kidsError);
      if (dojoFlow) redirect(`/skbc-interno/dojo/${data.legacy_id}?error=kids-companion`);
      redirect(`/clases/${data.legacy_id}?saved=class&error=kids-companion${delegateFlow ? "&delegate=1" : ""}`);
    }
  }

  if (classGroup === "adults" && !specialClass) {
    try {
      await generateAdultTechnicalGroups(data.id);
      await generateAdultTechnicalPlan(data.id);
    } catch (prepareError) {
      console.error("Error auto preparing adult class", prepareError);
      if (dojoFlow) redirect(`/skbc-interno/dojo/${data.legacy_id}?error=prepare&detail=${encodeURIComponent(errorMessage(prepareError))}`);
      redirect(`/clases/${data.legacy_id}?saved=class&error=prepare${delegateFlow ? "&delegate=1" : ""}&detail=${encodeURIComponent(errorMessage(prepareError))}`);
    }
  }

  if (dojoFlow) redirect(`/skbc-interno/dojo/${data.legacy_id}`);
  redirect(`/clases/${data.legacy_id}?saved=${classGroup === "adults" && !specialClass ? "class-prepared" : "class"}${delegateFlow ? "&delegate=1" : ""}`);
}

function isSpecialClassType(value: string | null) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ["HOWA", "CURSO_INTERNO", "LIMPIEZA_DOJO", "CENA", "ENTREGA", "TAIKAI", "ESPECIAL", "OTRO"].includes(normalized);
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
  const { data: currentClass } = await supabase
    .from("classes")
    .select("class_date")
    .eq("id", classId)
    .maybeSingle<{ class_date: string }>();

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

  if (currentClass?.class_date && currentClass.class_date !== classDate) {
    const relatedUpdates = await Promise.all([
      supabase.from("attendance_logs").update({ attended_on: classDate }).eq("class_id", classId),
      supabase.from("technical_plans").update({ class_date: classDate, updated_at: new Date().toISOString() }).eq("class_id", classId),
      supabase.from("dojo_technical_history").update({ class_date: classDate }).eq("class_id", classId),
      supabase.from("member_technical_history").update({ class_date: classDate }).eq("class_id", classId),
      supabase.from("member_technique_assignments").update({ assigned_on: classDate }).eq("class_id", classId)
    ]);

    const updateError = relatedUpdates.find((result) => result.error)?.error;
    if (updateError) {
      console.error("Error updating related class dates", updateError);
      redirect(`/clases/${legacyId}?error=class`);
    }

    await recalculateClassExamStatus(classId);
    await recalculateChildRankings();
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
  const deleteScope = String(formData.get("deleteScope") ?? "");

  if (!classId || !legacyId || confirmText !== "ELIMINAR") {
    redirect(`/clases/${legacyId || ""}?error=delete`);
  }

  const supabase = createAdminClient();
  const { data: currentClass, error: currentClassError } = await supabase
    .from("classes")
    .select("id,class_date,class_group,name")
    .eq("id", classId)
    .single<{ id: string; class_date: string; class_group: "kids" | "adults"; name: string }>();

  if (currentClassError || !currentClass) {
    redirect(`/clases/${legacyId}?error=delete`);
  }

  let classIdsToDelete = [classId];
  if (deleteScope === "combined-day") {
    const { data: dayClasses, error: dayClassesError } = await supabase
      .from("classes")
      .select("id,class_group")
      .eq("class_date", currentClass.class_date)
      .in("class_group", ["adults", "kids"])
      .returns<Array<{ id: string; class_group: "kids" | "adults" }>>();

    if (dayClassesError || !dayClasses?.length) {
      redirect(`/clases/${legacyId}?error=delete`);
    }

    const hasAdults = dayClasses.some((item) => item.class_group === "adults");
    const hasKids = dayClasses.some((item) => item.class_group === "kids");
    if (hasAdults && hasKids) {
      classIdsToDelete = dayClasses.map((item) => item.id);
    }
  }

  const { data: affectedRows } = await supabase
    .from("attendance_logs")
    .select("member_id")
    .in("class_id", classIdsToDelete)
    .returns<Array<{ member_id: string }>>();
  const affectedMemberIds = Array.from(new Set((affectedRows ?? []).map((row) => row.member_id).filter(Boolean)));

  const [
    { data: classSnapshots },
    { data: groupSnapshots },
    { data: planSnapshots },
    { data: attendanceSnapshots },
    { data: overrideSnapshots },
    { data: dojoHistorySnapshots },
    { data: memberHistorySnapshots },
    { data: assignmentSnapshots },
    { data: delegateSnapshots }
  ] = await Promise.all([
    supabase.from("classes").select("*").in("id", classIdsToDelete),
    supabase.from("class_technical_groups").select("*").in("class_id", classIdsToDelete),
    supabase.from("technical_plans").select("*").in("class_id", classIdsToDelete),
    supabase.from("attendance_logs").select("*").in("class_id", classIdsToDelete),
    supabase.from("attendance_technical_overrides").select("*").in("class_id", classIdsToDelete),
    supabase.from("dojo_technical_history").select("*").in("class_id", classIdsToDelete),
    supabase.from("member_technical_history").select("*").in("class_id", classIdsToDelete),
    supabase.from("member_technique_assignments").select("*").in("class_id", classIdsToDelete),
    supabase.from("class_delegate_links").select("*").in("class_id", classIdsToDelete)
  ]);

  await createTrashItem({
    supabase,
    entityType: classIdsToDelete.length > 1 ? "combined_class" : "class",
    entityLabel: classIdsToDelete.length > 1 ? `Clase combinada ${currentClass.class_date}` : currentClass.name,
    sourceTable: "classes",
    sourceId: classId,
    snapshot: classSnapshots ?? [],
    relatedSnapshots: {
      class_technical_groups: groupSnapshots ?? [],
      technical_plans: planSnapshots ?? [],
      attendance_logs: attendanceSnapshots ?? [],
      attendance_technical_overrides: overrideSnapshots ?? [],
      dojo_technical_history: dojoHistorySnapshots ?? [],
      member_technical_history: memberHistorySnapshots ?? [],
      member_technique_assignments: assignmentSnapshots ?? [],
      class_delegate_links: delegateSnapshots ?? []
    },
    affectedMemberIds,
    notes: classIdsToDelete.length > 1 ? "Borrado de clase combinada." : "Borrado de clase."
  });

  const deletions = [
    supabase.from("attendance_technical_overrides").delete().in("class_id", classIdsToDelete),
    supabase.from("member_technical_history").delete().in("class_id", classIdsToDelete),
    supabase.from("dojo_technical_history").delete().in("class_id", classIdsToDelete),
    supabase.from("member_technique_assignments").delete().in("class_id", classIdsToDelete),
    supabase.from("attendance_logs").delete().in("class_id", classIdsToDelete),
    supabase.from("technical_plans").delete().in("class_id", classIdsToDelete),
    supabase.from("class_technical_groups").delete().in("class_id", classIdsToDelete),
    supabase.from("class_delegate_links").delete().in("class_id", classIdsToDelete)
  ];

  const results = await Promise.all(deletions);
  if (results.some((result) => result.error)) {
    console.error("Error deleting class related rows", results.map((result) => result.error).filter(Boolean));
    redirect(`/clases/${legacyId}?error=delete`);
  }

  const { error } = await supabase.from("classes").delete().in("id", classIdsToDelete);
  if (error) {
    redirect(`/clases/${legacyId}?error=delete`);
  }

  await Promise.all(affectedMemberIds.map((memberId) => recalculateMemberExamStatus(memberId)));
  await recalculateChildRankings();

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
    .select("class_date,class_group,closed")
    .eq("id", classId)
      .single<{ class_date: string; class_group: "kids" | "adults"; closed: boolean }>(),
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
  trainedGrade = trainedGrade || resolveTrainingGroupGrade(officialGrade);

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

  if (clase.class_group === "adults" && clase.closed) {
    await closeAdultClass(classId);
  }
  await recalculateClassExamStatus(classId);
  await recalculateChildRankings();

  redirect(`/clases/${legacyId}?saved=attendance`);
}

export async function addBulkAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnLegacyId = String(formData.get("returnLegacyId") ?? legacyId);
  const returnStep = String(formData.get("returnStep") ?? "asistencia");
  const returnStepQuery = returnStep ? `&step=${encodeURIComponent(returnStep)}` : "";
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const memberIdsByClass = getDelegateMemberIdsByClass(formData);
  const hasGroupedMembers = memberIdsByClass.size > 0;
  const groupedClassIds = formData.getAll("groupClassIds").map((value) => String(value)).filter(Boolean);
  const memberIds = formData.getAll("memberIds").map((value) => String(value)).filter(Boolean);
  const closeAfter = String(formData.get("closeAfter") ?? "") === "true";

  if (!classId || !legacyId || (!memberIds.length && !hasGroupedMembers && !(closeAfter && groupedClassIds.length))) {
    redirect(`/clases/${returnLegacyId || legacyId || ""}?error=attendance${returnStepQuery}`);
  }

  if (hasGroupedMembers || (closeAfter && groupedClassIds.length)) {
    const supabase = createAdminClient();
    const classIds = [...new Set([...memberIdsByClass.keys(), ...groupedClassIds])];
    const { data: classes, error: classesError } = await supabase
      .from("classes")
      .select("id,class_group,closed")
      .in("id", classIds)
      .returns<Array<{ id: string; class_group: "kids" | "adults"; closed: boolean }>>();

    if (classesError || !classes?.length) {
      redirect(`/clases/${returnLegacyId || legacyId}?error=attendance${returnStepQuery}`);
    }

    try {
      for (const dayClass of classes) {
        const ids = memberIdsByClass.get(dayClass.id) ?? [];
        if (ids.length) await addAttendanceRows(dayClass.id, ids, "WEB SKBC", formData);
      }

      if (closeAfter) {
        for (const dayClass of classes) {
          if (dayClass.class_group === "adults") {
            await closeAdultClass(dayClass.id);
          } else {
            const { error: closeError } = await supabase
              .from("classes")
              .update({ closed: true, status: "completed", updated_at: new Date().toISOString() })
              .eq("id", dayClass.id)
              .eq("class_group", "kids");
            if (closeError) throw closeError;
          }
          await recalculateClassExamStatus(dayClass.id);
        }
      } else {
        for (const dayClass of classes) {
          if (dayClass.class_group === "adults" && dayClass.closed) {
            await closeAdultClass(dayClass.id);
            await recalculateClassExamStatus(dayClass.id);
          }
        }
      }
      if (classes.some((dayClass) => dayClass.class_group === "kids")) {
        await recalculateChildRankings();
      }
    } catch (error) {
      console.error("Error saving grouped attendance", error);
      redirect(returnTo || `/clases/${returnLegacyId || legacyId}?error=${closeAfter ? "close" : "attendance"}${returnStepQuery}`);
    }

    redirect(returnTo || `/clases/${returnLegacyId || legacyId}?saved=${closeAfter ? "close" : "attendance"}${returnStepQuery}`);
  }

  const supabase = createAdminClient();
  const [{ data: clase, error: classError }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("classes")
      .select("class_date,class_group,closed")
      .eq("id", classId)
      .single<{ class_date: string; class_group: "kids" | "adults"; closed: boolean }>(),
    supabase
      .from("members")
      .select("id,grade")
      .in("id", memberIds)
      .returns<{ id: string; grade: string | null }[]>()
  ]);

  if (classError || !clase || membersError || !members?.length) {
    redirect(`/clases/${returnLegacyId || legacyId}?error=attendance${returnStepQuery}`);
  }

  const rows = members.map((member) => {
    const officialGrade = member.grade || "";
    const trainedGrade = clase.class_group === "adults" ? resolveTrainingGroupGrade(officialGrade) : officialGrade;
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
    redirect(`/clases/${returnLegacyId || legacyId}?error=attendance${returnStepQuery}`);
  }

  try {
    await Promise.all((attendanceRows ?? []).map((row) => syncLegacyAttendance(row.id)));
  } catch (syncError) {
    console.error("Error syncing bulk attendance to legacy sheet", syncError);
  }

  if (clase.class_group === "kids") {
    await recalculateChildRankings();
  }

  if (clase.class_group === "adults" && clase.closed && !closeAfter) {
    try {
      await closeAdultClass(classId);
      await recalculateClassExamStatus(classId);
    } catch (closeError) {
      console.error("Error recalculating closed adult class after attendance update", closeError);
      redirect(returnTo || `/clases/${returnLegacyId || legacyId}?error=close${returnStepQuery}`);
    }
  }

  if (closeAfter) {
    try {
      if (clase.class_group === "adults") {
        await closeAdultClass(classId);
      } else {
        const { error: closeError } = await supabase
          .from("classes")
          .update({ closed: true, status: "completed", updated_at: new Date().toISOString() })
          .eq("id", classId)
          .eq("class_group", "kids");
        if (closeError) throw closeError;
      }
      await recalculateClassExamStatus(classId);
      if (clase.class_group === "kids") {
        await recalculateChildRankings();
      }
    } catch (closeError) {
      console.error("Error closing class after bulk attendance", closeError);
      redirect(returnTo || `/clases/${returnLegacyId || legacyId}?error=close${returnStepQuery}`);
    }

    redirect(returnTo || `/clases/${returnLegacyId || legacyId}?saved=close${returnStepQuery}`);
  }

  redirect(returnTo || `/clases/${returnLegacyId || legacyId}?saved=attendance${returnStepQuery}`);
}

export async function removeAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const attendanceId = String(formData.get("attendanceId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnLegacyId = String(formData.get("returnLegacyId") ?? legacyId);

  if (!attendanceId || !legacyId) {
    redirect(`/clases/${returnLegacyId || ""}?error=attendance&step=asistencia`);
  }

  const supabase = createAdminClient();
  const { data: attendance, error: attendanceError } = await supabase
    .from("attendance_logs")
    .select("*,classes(closed,class_group)")
    .eq("id", attendanceId)
    .single<{ id: string; class_id: string | null; member_id: string; attended_on: string; classes: { closed: boolean; class_group: "kids" | "adults" } | null }>();

  if (attendanceError || !attendance?.class_id) {
    redirect(`/clases/${returnLegacyId}?error=attendance&step=asistencia`);
  }

  const { classes: _classes, ...attendanceSnapshot } = attendance;
  await createTrashItem({
    supabase,
    entityType: "attendance",
    entityLabel: `Asistencia ${attendance.attended_on}`,
    sourceTable: "attendance_logs",
    sourceId: attendanceId,
    snapshot: attendanceSnapshot,
    affectedMemberIds: [attendance.member_id],
    notes: attendance.classes?.closed ? "Asistencia quitada como correccion de acta cerrada." : "Asistencia quitada en una clase abierta."
  });

  const { error } = await supabase
    .from("attendance_logs")
    .delete()
    .eq("id", attendanceId);

  if (error) {
    redirect(`/clases/${returnLegacyId}?error=attendance&step=asistencia`);
  }

  try {
    if (attendance.classes?.class_group === "adults" && attendance.classes.closed) {
      await closeAdultClass(attendance.class_id);
    }
    await recalculateClassExamStatus(attendance.class_id);
    if (attendance.classes?.class_group === "kids") {
      await recalculateChildRankings();
    }
  } catch (recalculateError) {
    console.error("Error recalculating after attendance removal", recalculateError);
  }

  redirect(`/clases/${returnLegacyId}?saved=attendance-removed&step=asistencia`);
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

export async function updateClassPlanTechniquesAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const nextStep = String(formData.get("nextStep") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const planIds = formData.getAll("planIds").map((value) => String(value)).filter(Boolean);

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  try {
    const { data: clase, error: classError } = await supabase
      .from("classes")
      .select("closed,class_group")
      .eq("id", classId)
      .single<{ closed: boolean; class_group: "kids" | "adults" }>();
    if (classError || !clase) throw classError ?? new Error("Clase no encontrada.");

    const { error: resetError } = await supabase
      .from("technical_plans")
      .update({ completed: false, updated_at: now })
      .eq("class_id", classId);

    if (resetError) throw resetError;

    if (planIds.length) {
      const { error: updateError } = await supabase
        .from("technical_plans")
        .update({ completed: true, updated_at: now })
        .eq("class_id", classId)
        .in("id", planIds);

      if (updateError) throw updateError;
    }

    if (clase.class_group === "adults" && clase.closed) {
      await closeAdultClass(classId);
      await recalculateClassExamStatus(classId);
    }
  } catch (error) {
    console.error("Error updating class plan techniques", error);
    redirect(returnTo || `/clases/${legacyId}?error=plan-technique`);
  }

  redirect(returnTo || `/clases/${legacyId}?saved=plan-technique${nextStep === "attendance" ? "&step=asistencia" : ""}`);
}

export async function saveAttendanceTechnicalReviewAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const closeAfter = String(formData.get("closeAfter") ?? "") === "true";
  const returnStep = String(formData.get("returnStep") ?? "asistencia");
  const returnStepQuery = returnStep ? `&step=${encodeURIComponent(returnStep)}` : "";
  const attendanceIds = formData.getAll("attendanceIds").map((value) => String(value)).filter(Boolean);

  if (!classId || !legacyId || !attendanceIds.length) {
    redirect(`/clases/${legacyId || ""}?error=technical-review${returnStepQuery}`);
  }

  const supabase = createAdminClient();

  try {
    const { data: attendanceRows, error: attendanceError } = await supabase
      .from("attendance_logs")
      .select("id,member_id")
      .eq("class_id", classId)
      .in("id", attendanceIds)
      .returns<Array<{ id: string; member_id: string }>>();

    if (attendanceError) throw attendanceError;

    const now = new Date().toISOString();
    const rows = [];
    for (const attendance of attendanceRows ?? []) {
      const planIds = formData.getAll(`review:${attendance.id}`).map((value) => String(value)).filter(Boolean);
      for (const planId of planIds) {
        rows.push({
          class_id: classId,
          attendance_id: attendance.id,
          member_id: attendance.member_id,
          plan_id: planId,
          include_in_history: true,
          updated_at: now
        });
      }
    }

    const { error: deleteError } = await supabase
      .from("attendance_technical_overrides")
      .delete()
      .eq("class_id", classId)
      .in("attendance_id", attendanceIds);

    if (deleteError) throw deleteError;

    if (rows.length) {
      const { error: insertError } = await supabase.from("attendance_technical_overrides").insert(rows);
      if (insertError) throw insertError;
    }

    if (closeAfter) {
      await closeAdultClass(classId);
      await recalculateClassExamStatus(classId);
    }
  } catch (error) {
    console.error("Error saving attendance technical review", error);
    redirect(`/clases/${legacyId}?error=technical-review${returnStepQuery}`);
  }

  redirect(`/clases/${legacyId}?saved=${closeAfter ? "close" : "technical-review"}${returnStepQuery}`);
}

export async function closeAdultClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));

  if (!classId || !legacyId) {
    redirect("/clases");
  }

  try {
    await closeAdultClass(classId);
    await recalculateClassExamStatus(classId);
  } catch (error) {
    console.error("Error closing adult class", error);
    redirect(returnTo || `/clases/${legacyId}?error=close`);
  }

  redirect(returnTo || `/clases/${legacyId}?saved=close`);
}

export async function closeKidsClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "");
  const legacyId = String(formData.get("legacyId") ?? "");
  const returnLegacyId = String(formData.get("returnLegacyId") ?? legacyId);
  const returnStep = String(formData.get("returnStep") ?? "");
  const returnStepQuery = returnStep ? `&step=${encodeURIComponent(returnStep)}` : "";
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));

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
    redirect(returnTo || `/clases/${returnLegacyId || legacyId}?error=close${returnStepQuery}`);
  }

  try {
    await recalculateClassExamStatus(classId);
    await recalculateChildRankings();
  } catch (error) {
    console.error("Error recalculating kids class exam status", error);
  }

  redirect(returnTo || `/clases/${returnLegacyId || legacyId}?saved=kids-skipped${returnStepQuery}`);
}

export async function saveChildClassPlanAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const classId = String(formData.get("classId") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const objective = emptyToNull(String(formData.get("objective") ?? ""));
  const notes = emptyToNull(String(formData.get("notes") ?? ""));
  const activities = Array.from(new Set(
    formData.getAll("activities").map((value) => String(value).trim()).filter(Boolean)
  ));
  const groupLabel = emptyToNull(String(formData.get("groupLabel") ?? ""));
  const groupContent = emptyToNull(String(formData.get("groupContent") ?? ""));
  const groupNotes = emptyToNull(String(formData.get("groupNotes") ?? ""));
  const memberIds = Array.from(new Set(
    formData.getAll("groupMemberIds").map((value) => String(value).trim()).filter(Boolean)
  ));

  if (!classId || !legacyId) {
    redirect(returnTo || "/clases?error=kids-plan");
  }

  const supabase = createAdminClient();
  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,class_group")
    .eq("id", classId)
    .single<{ id: string; class_group: "kids" | "adults" }>();

  if (classError || !clase || clase.class_group !== "kids") {
    redirect(returnTo || `/clases/${legacyId}?error=kids-plan`);
  }

  try {
    const now = new Date().toISOString();
    const { error: planError } = await supabase
      .from("child_class_plans")
      .upsert(
        {
          class_id: classId,
          objective,
          activities,
          notes,
          updated_at: now
        },
        { onConflict: "class_id" }
      );

    if (planError) throw planError;

    if (groupLabel && groupContent) {
      const { error: groupError } = await supabase.from("child_class_group_work").insert({
        class_id: classId,
        group_label: groupLabel,
        content: groupContent,
        member_ids: memberIds,
        notes: groupNotes,
        updated_at: now
      });

      if (groupError) throw groupError;
    }
  } catch (error) {
    console.error("Error saving child class plan", error);
    redirect(returnTo || `/clases/${legacyId}?error=kids-plan&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  revalidatePath(`/clases/${legacyId}`);
  redirect(returnTo || `/clases/${legacyId}?saved=kids-plan`);
}

export async function deleteChildClassGroupWorkAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const id = String(formData.get("id") ?? "").trim();
  const legacyId = String(formData.get("legacyId") ?? "").trim();
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));

  if (!id || !legacyId) {
    redirect(returnTo || "/clases?error=kids-plan");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("child_class_group_work")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting child class group work", error);
    redirect(returnTo || `/clases/${legacyId}?error=kids-plan&detail=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/clases/${legacyId}`);
  redirect(returnTo || `/clases/${legacyId}?saved=kids-plan-delete`);
}

export async function registerExamAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const selectedMemberIds = Array.from(new Set([
    ...formData.getAll("memberIds").map((value) => String(value).trim()),
    String(formData.get("memberId") ?? "").trim(),
    String(formData.get("memberIdAdults") ?? "").trim(),
    String(formData.get("memberIdKids") ?? "").trim()
  ].filter(Boolean)));
  const examDate = parseDateInput(String(formData.get("examDate") ?? ""));
  const grade = String(formData.get("grade") ?? "").trim();
  const examiner = String(formData.get("examiner") ?? "").trim() || null;

  if (!selectedMemberIds.length || !examDate || !grade) {
    redirect("/examenes?error=exam");
  }

  const registeredLegacyIds: string[] = [];
  try {
    for (const memberId of selectedMemberIds) {
      const result = await registerExam({
        memberId,
        examDate,
        grade,
        examiner,
        registeredBy: "WEB SKBC"
      });
      if (result.memberLegacyId) registeredLegacyIds.push(result.memberLegacyId);
    }
  } catch (error) {
    console.error("Error registering exam", error);
    redirect("/examenes?error=exam");
  }

  redirect(selectedMemberIds.length === 1 && registeredLegacyIds[0] ? `/kenshis/${registeredLegacyIds[0]}?saved=exam` : "/examenes?saved=exam");
}

export async function createIntegratedExamEventAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const memberIds = Array.from(new Set(formData.getAll("memberIds").map((value) => String(value).trim()).filter(Boolean)));
  const examDate = parseDateInput(String(formData.get("examDate") ?? ""));
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const rawProgramType = String(formData.get("programType") ?? "").trim();
  const programType: IntegratedExamProgram = rawProgramType === "kids_progressive" || rawProgramType === "kids" || rawProgramType === "dan_tribunal" ? rawProgramType : "adults";
  const passPercentage = Number(String(formData.get("passPercentage") ?? "70").replace(",", "."));
  const examinerNames = String(formData.get("examinerNames") ?? "")
    .split(/\r?\n|,/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!memberIds.length || !examDate) {
    redirect("/examenes?error=integrated");
  }

  try {
    const result = await createIntegratedExamEvent({
      title,
      examDate,
      programType,
      passPercentage: Number.isFinite(passPercentage) ? passPercentage : 70,
      memberIds,
      examinerNames,
      notes: notes || null
    });
    revalidatePath("/examenes");
    redirect(`/examenes/${result.eventId}?saved=created`);
  } catch (error) {
    console.error("Error creating integrated exam", error);
    redirect(`/examenes?error=integrated&detail=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function submitIntegratedExamScoresAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    redirect("/examinar/error");
  }

  const scores: Array<{ eventStudentId: string; eventItemId: string; score: number | null; skipped: boolean }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("score:")) continue;
    const [, eventStudentId, eventItemId] = key.split(":");
    const rawValue = String(value ?? "").trim();
    if (!eventStudentId || !eventItemId || !rawValue) continue;
    scores.push({
      eventStudentId,
      eventItemId,
      score: rawValue === "skip" ? null : Number(rawValue),
      skipped: rawValue === "skip"
    });
  }

  try {
    await submitIntegratedExamScores({ token, scores });
  } catch (error) {
    console.error("Error submitting integrated exam scores", error);
    redirect(`/examinar/${token}?error=submit&detail=${encodeURIComponent(errorMessage(error))}`);
  }

  redirect(`/examinar/${token}?saved=1`);
}

export async function finalizeIntegratedExamEventAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const eventId = String(formData.get("eventId") ?? "").trim();
  if (!eventId) {
    redirect("/examenes?error=integrated-finalize");
  }

  try {
    const result = await finalizeIntegratedExamEvent(eventId, "WEB SKBC");
    revalidatePath("/examenes");
    revalidatePath(`/examenes/${eventId}`);
    redirect(`/examenes/${eventId}?saved=finalized&registered=${result.registeredCount}`);
  } catch (error) {
    console.error("Error finalizing integrated exam", error);
    redirect(`/examenes/${eventId}?error=finalize&detail=${encodeURIComponent(errorMessage(error))}`);
  }
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

  const supabase = createAdminClient();
  const { data: examSnapshot } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle<{ id: string; member_id: string; grade: string; exam_date: string }>();

  try {
    if (examSnapshot) {
      await createTrashItem({
        supabase,
        entityType: "exam",
        entityLabel: `Examen ${examSnapshot.grade} - ${examSnapshot.exam_date}`,
        sourceTable: "exams",
        sourceId: examId,
        snapshot: examSnapshot,
        affectedMemberIds: [examSnapshot.member_id],
        notes: "Examen eliminado desde el panel."
      });
    }
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
    await recalculateChildRankings();
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
    await recalculateChildRankings();
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
  const bonusType = String(formData.get("bonusType") ?? "one_time");
  const permanent = bonusType === "fixed";

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
    permanent,
    created_by: "WEB SKBC"
  });

  if (error) {
    console.error("Error adding adult ranking bonus", error);
    redirect("/rankings?error=bonus");
  }

  await recalculateMemberExamStatus(memberId);

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

  const { data: bonus } = await supabase
    .from("adult_ranking_bonuses")
    .select("member_id")
    .eq("id", bonusId)
    .maybeSingle<{ member_id: string }>();
  if (bonus?.member_id) {
    await recalculateMemberExamStatus(bonus.member_id);
  }

  redirect("/rankings?saved=bonus");
}

export async function createClubClosureAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const startsOn = parseDateInput(String(formData.get("startsOn") ?? ""));
  const endsOn = parseDateInput(String(formData.get("endsOn") ?? "")) ?? startsOn;
  const title = String(formData.get("title") ?? "").trim();
  const appliesToRaw = String(formData.get("appliesTo") ?? "all").trim();
  const appliesTo = ["all", "kids", "adults"].includes(appliesToRaw) ? appliesToRaw : "all";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!startsOn || !endsOn || !title || endsOn < startsOn) {
    redirect("/calendario?error=closure");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("skbc_calendar_closures").insert({
    starts_on: startsOn,
    ends_on: endsOn,
    title,
    applies_to: appliesTo,
    notes,
    active: true
  });

  if (error) {
    console.error("Error creating club closure", error);
    redirect("/calendario?error=closure");
  }

  await recalculateActiveExamStatuses();

  redirect("/calendario?saved=closure");
}

export async function deactivateClubClosureAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const closureId = String(formData.get("closureId") ?? "").trim();
  if (!closureId) {
    redirect("/calendario?error=closure");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("skbc_calendar_closures")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", closureId);

  if (error) {
    console.error("Error deactivating club closure", error);
    redirect("/calendario?error=closure");
  }

  await recalculateActiveExamStatuses();

  redirect("/calendario?saved=closure");
}

export async function updateClubClosureAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const closureId = String(formData.get("closureId") ?? "").trim();
  const selectedYear = String(formData.get("selectedYear") ?? "").trim();
  const startsOn = parseDateInput(String(formData.get("startsOn") ?? ""));
  const endsOn = parseDateInput(String(formData.get("endsOn") ?? "")) ?? startsOn;
  const title = String(formData.get("title") ?? "").trim();
  const appliesToRaw = String(formData.get("appliesTo") ?? "all").trim();
  const appliesTo = ["all", "kids", "adults"].includes(appliesToRaw) ? appliesToRaw : "all";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const yearQuery = selectedYear ? `&year=${encodeURIComponent(selectedYear)}` : "";

  if (!closureId || !startsOn || !endsOn || !title || endsOn < startsOn) {
    redirect(`/calendario?error=closure${yearQuery}`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("skbc_calendar_closures")
    .update({
      starts_on: startsOn,
      ends_on: endsOn,
      title,
      applies_to: appliesTo,
      notes,
      updated_at: new Date().toISOString()
    })
    .eq("id", closureId);

  if (error) {
    console.error("Error updating club closure", error);
    redirect(`/calendario?error=closure${yearQuery}`);
  }

  await recalculateActiveExamStatuses();

  redirect(`/calendario?saved=closure${yearQuery}`);
}

export async function duplicateClubCalendarYearAction(formData: FormData) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const sourceYear = Number.parseInt(String(formData.get("sourceYear") ?? ""), 10);
  const targetYear = Number.parseInt(String(formData.get("targetYear") ?? ""), 10);
  if (!Number.isFinite(sourceYear) || !Number.isFinite(targetYear) || sourceYear < 2000 || targetYear < 2000 || sourceYear === targetYear) {
    redirect("/calendario?error=duplicate");
  }

  const supabase = createAdminClient();
  const sourceStart = `${sourceYear}-01-01`;
  const sourceEnd = `${sourceYear}-12-31`;
  const { data: sourceRows, error: sourceError } = await supabase
    .from("skbc_calendar_closures")
    .select("starts_on,ends_on,title,applies_to,notes")
    .eq("active", true)
    .gte("starts_on", sourceStart)
    .lte("starts_on", sourceEnd)
    .returns<Array<{ starts_on: string; ends_on: string; title: string; applies_to: "all" | "kids" | "adults"; notes: string | null }>>();

  if (sourceError || !sourceRows?.length) {
    if (sourceError) console.error("Error loading source club calendar", sourceError);
    redirect("/calendario?error=duplicate");
  }

  const diff = targetYear - sourceYear;
  const duplicatedRows = sourceRows.map((row) => ({
    starts_on: addYearsToIsoDate(row.starts_on, diff),
    ends_on: addYearsToIsoDate(row.ends_on, diff),
    title: row.title.replace(String(sourceYear), String(targetYear)),
    applies_to: row.applies_to,
    notes: row.notes,
    active: true
  }));

  const targetStart = `${targetYear}-01-01`;
  const targetEnd = `${targetYear + 1}-12-31`;
  const { data: existingRows, error: existingError } = await supabase
    .from("skbc_calendar_closures")
    .select("starts_on,ends_on,title,applies_to")
    .eq("active", true)
    .gte("starts_on", targetStart)
    .lte("starts_on", targetEnd)
    .returns<Array<{ starts_on: string; ends_on: string; title: string; applies_to: string }>>();

  if (existingError) {
    console.error("Error loading target club calendar", existingError);
    redirect("/calendario?error=duplicate");
  }

  const existingKeys = new Set((existingRows ?? []).map((row) => `${row.starts_on}|${row.ends_on}|${row.title}|${row.applies_to}`));
  const rowsToInsert = duplicatedRows.filter((row) => !existingKeys.has(`${row.starts_on}|${row.ends_on}|${row.title}|${row.applies_to}`));

  if (!rowsToInsert.length) {
    redirect("/calendario?saved=duplicate");
  }

  const { error } = await supabase.from("skbc_calendar_closures").insert(rowsToInsert);
  if (error) {
    console.error("Error duplicating club calendar", error);
    redirect("/calendario?error=duplicate");
  }

  await recalculateActiveExamStatuses();

  redirect("/calendario?saved=duplicate");
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

export async function clearFailedLegacySyncJobsAction() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("legacy_sheet_sync_jobs").delete().eq("status", "failed");

  if (error) {
    console.error("Error clearing failed legacy sync jobs", error);
    redirect("/control-dia?error=legacy-clear");
  }

  revalidatePath("/control-dia");
  revalidatePath("/auditoria");
  revalidatePath("/sistema");
  redirect("/control-dia?saved=legacy-cleared");
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
    .select("id,member_id,competition_category,competition_result,competition_medal,competition_notes")
    .in("id", courseIds)
    .returns<Array<{ id: string; member_id: string; competition_category: string | null; competition_result: string | null; competition_medal: string | null; competition_notes: string | null }>>();

  if (existingError || !existing?.length) {
    redirect("/cursos?error=course");
  }

  const selected = new Set(memberIds);
  const existingMemberIds = new Set(existing.map((row) => row.member_id));
  const removeIds = existing.filter((row) => !selected.has(row.member_id)).map((row) => row.id);
  const addMemberIds = memberIds.filter((memberId) => !existingMemberIds.has(memberId));

  const updatePayload = {
    kind,
    course_date: courseDate,
    location,
    title,
    sensei,
    notes,
    ...(kind === "taikai" ? {} : {
      competition_category: null,
      competition_result: null,
      competition_medal: null,
      competition_notes: null
    })
  };

  const { error: updateError } = await supabase
    .from("courses")
    .update(updatePayload)
    .in("id", courseIds);

  if (updateError) {
    console.error("Error updating course group", updateError);
    redirect("/cursos?error=course");
  }

  if (removeIds.length) {
    const removedSnapshots = existing.filter((row) => removeIds.includes(row.id));
    await createTrashItem({
      supabase,
      entityType: "course_attendees",
      entityLabel: `${title} - asistentes quitados`,
      sourceTable: "courses",
      sourceId: courseIds[0],
      snapshot: removedSnapshots,
      affectedMemberIds: Array.from(new Set(removedSnapshots.map((row) => row.member_id).filter(Boolean))),
      notes: "Asistentes eliminados al editar curso o taikai."
    });

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
      competition_category: kind === "taikai" ? String(formData.get(`competitionCategory:${memberId}`) ?? "").trim() || null : null,
      competition_result: kind === "taikai" ? String(formData.get(`competitionResult:${memberId}`) ?? "").trim() || null : null,
      competition_medal: kind === "taikai" ? normalizeCompetitionMedal(String(formData.get(`competitionMedal:${memberId}`) ?? "")) : null,
      competition_notes: kind === "taikai" ? String(formData.get(`competitionNotes:${memberId}`) ?? "").trim() || null : null,
      legacy_id: `CURS-EDIT-${batchId}-${index + 1}`
    }));
    const { data: insertedCourses, error: insertError } = await supabase
      .from("courses")
      .insert(rows)
      .select("id")
      .returns<Array<{ id: string }>>();
    if (insertError) {
      console.error("Error adding course attendees", insertError);
      redirect("/cursos?error=course");
    }
    try {
      await Promise.all((insertedCourses ?? []).map((course) => syncLegacyCourse(course.id)));
    } catch (syncError) {
      console.error("Error syncing edited course additions to legacy sheet", syncError);
    }
  }

  if (kind === "taikai") {
    const resultUpdates = existing
      .filter((row) => selected.has(row.member_id))
      .map((row) => ({
        id: row.id,
        kind,
        course_date: courseDate,
        member_id: row.member_id,
        location,
        title,
        sensei,
        notes,
        competition_category: String(formData.get(`competitionCategory:${row.member_id}`) ?? "").trim() || null,
        competition_result: String(formData.get(`competitionResult:${row.member_id}`) ?? "").trim() || null,
        competition_medal: normalizeCompetitionMedal(String(formData.get(`competitionMedal:${row.member_id}`) ?? "")),
        competition_notes: String(formData.get(`competitionNotes:${row.member_id}`) ?? "").trim() || null
      }));

    if (resultUpdates.length) {
      const { error: resultError } = await supabase.from("courses").upsert(resultUpdates);
      if (resultError) {
        console.error("Error updating taikai results", resultError);
        redirect("/cursos?error=course");
      }
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

  const catalogItemId = String(formData.get("catalogItemId") ?? "").trim() || null;
  const memberId = String(formData.get("memberId") ?? "").trim() || null;
  const studentName = String(formData.get("studentName") ?? "").trim();
  const requestTitle = String(formData.get("requestTitle") ?? "").trim() || "Pedido general";
  const item = String(formData.get("item") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim() || null;
  const size = String(formData.get("size") ?? "").trim() || null;
  const quantity = Math.max(1, Number.parseInt(String(formData.get("quantity") ?? "1"), 10) || 1);
  const unitPriceCents = parseEuroCents(String(formData.get("unitPrice") ?? ""));
  const paidAmountCents = parseEuroCents(String(formData.get("paidAmount") ?? ""));
  const paymentStatus = normalizePaymentStatus(String(formData.get("paymentStatus") ?? "")) ?? inferPaymentStatus(unitPriceCents * quantity, paidAmountCents);
  const status = normalizeBeltStatus(String(formData.get("status") ?? "")) ?? "pending";
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if ((!memberId && !studentName) || !item) {
    redirect("/pedidos-cinturones?error=belt");
  }

  const today = new Date().toISOString().slice(0, 10);
  const supabase = createAdminClient();
  const { error } = await supabase.from("belt_order_lines").insert({
    catalog_item_id: catalogItemId,
    exam_title: requestTitle,
    member_id: memberId,
    student_name: studentName || null,
    item,
    color,
    size,
    quantity,
    unit_price_cents: unitPriceCents,
    total_price_cents: unitPriceCents * quantity,
    paid_amount_cents: paidAmountCents,
    payment_status: paymentStatus,
    paid_on: paidAmountCents > 0 ? today : null,
    requested_on: today,
    status,
    notes,
    created_by: "WEB SKBC"
  });

  if (error) {
    console.error("Error creating belt order line", error);
    redirect("/pedidos-cinturones?error=belt");
  }

  redirect("/pedidos-cinturones?saved=belt");
}

export async function createOrderCatalogItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "general";
  const defaultColor = String(formData.get("defaultColor") ?? "").trim() || null;
  const defaultSize = String(formData.get("defaultSize") ?? "").trim() || null;
  const unitPriceCents = parseEuroCents(String(formData.get("unitPrice") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) redirect("/pedidos-cinturones?error=catalog");

  const { error } = await createAdminClient().from("order_catalog_items").insert({
    name,
    category,
    default_color: defaultColor,
    default_size: defaultSize,
    unit_price_cents: unitPriceCents,
    notes
  });

  if (error) {
    console.error("Error creating order catalog item", error);
    redirect("/pedidos-cinturones?error=catalog");
  }

  redirect("/pedidos-cinturones?saved=catalog");
}

export async function updateOrderCatalogItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const itemId = String(formData.get("itemId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "general";
  const defaultColor = String(formData.get("defaultColor") ?? "").trim() || null;
  const defaultSize = String(formData.get("defaultSize") ?? "").trim() || null;
  const unitPriceCents = parseEuroCents(String(formData.get("unitPrice") ?? ""));
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const active = formData.get("active") === "on";

  if (!itemId || !name) redirect("/pedidos-cinturones?error=catalog");

  const { error } = await createAdminClient()
    .from("order_catalog_items")
    .update({
      name,
      category,
      default_color: defaultColor,
      default_size: defaultSize,
      unit_price_cents: unitPriceCents,
      notes,
      active,
      updated_at: new Date().toISOString()
    })
    .eq("id", itemId);

  if (error) {
    console.error("Error updating order catalog item", error);
    redirect("/pedidos-cinturones?error=catalog");
  }

  redirect("/pedidos-cinturones?saved=catalog");
}

export async function deleteOrderCatalogItemAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) redirect("/pedidos-cinturones?error=catalog");

  const supabase = createAdminClient();
  const { data: itemSnapshot } = await supabase
    .from("order_catalog_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle<{ id: string; name: string }>();

  if (itemSnapshot) {
    await createTrashItem({
      supabase,
      entityType: "order_catalog_item",
      entityLabel: itemSnapshot.name,
      sourceTable: "order_catalog_items",
      sourceId: itemId,
      snapshot: itemSnapshot,
      notes: "Articulo de pedidos eliminado."
    });
  }

  const { error } = await supabase
    .from("order_catalog_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    console.error("Error deleting order catalog item", error);
    redirect("/pedidos-cinturones?error=catalog");
  }

  redirect("/pedidos-cinturones?saved=catalog");
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

export async function updateOrderPaymentAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const lineId = String(formData.get("lineId") ?? "").trim();
  const paymentStatus = normalizePaymentStatus(String(formData.get("paymentStatus") ?? ""));
  const paidAmountCents = parseEuroCents(String(formData.get("paidAmount") ?? ""));
  if (!lineId || !paymentStatus) redirect("/pedidos-cinturones?error=payment");

  const { error } = await createAdminClient()
    .from("belt_order_lines")
    .update({
      payment_status: paymentStatus,
      paid_amount_cents: paidAmountCents,
      paid_on: paymentStatus === "paid" || paidAmountCents > 0 ? new Date().toISOString().slice(0, 10) : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", lineId);

  if (error) {
    console.error("Error updating order payment", error);
    redirect("/pedidos-cinturones?error=payment");
  }
  redirect("/pedidos-cinturones?saved=payment");
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

export async function updateShakujoClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classId = String(formData.get("classId") ?? "").trim();
  const classDate = parseDateInput(String(formData.get("classDate") ?? ""));
  if (!classId || !classDate) redirect("/shakujo?error=session");

  const { error } = await createAdminClient()
    .from("shakujo_classes")
    .update({
      class_date: classDate,
      title: String(formData.get("title") ?? "").trim() || "Clase Shakujo",
      instructor: String(formData.get("instructor") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      closed: formData.get("closed") === "on",
      updated_at: new Date().toISOString()
    })
    .eq("id", classId);

  if (error) {
    console.error("Error updating shakujo class", error);
    redirect(`/shakujo?error=session&classId=${encodeURIComponent(classId)}`);
  }

  redirect(`/shakujo?saved=session&classId=${encodeURIComponent(classId)}`);
}

export async function deleteShakujoClassAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classId = String(formData.get("classId") ?? "").trim();
  if (!classId) redirect("/shakujo?error=session");

  const supabase = createAdminClient();
  const [{ data: classSnapshot }, { data: previousRows, error: previousError }] = await Promise.all([
    supabase.from("shakujo_classes").select("*").eq("id", classId).maybeSingle<{ id: string; title: string; class_date: string }>(),
    supabase
    .from("shakujo_attendance")
    .select("*")
    .eq("shakujo_class_id", classId)
    .returns<Array<Record<string, unknown> & { member_id: string }>>()
  ]);

  if (previousError) {
    console.error("Error loading shakujo attendance before delete", previousError);
    redirect(`/shakujo?error=session&classId=${encodeURIComponent(classId)}`);
  }

  if (classSnapshot) {
    await createTrashItem({
      supabase,
      entityType: "shakujo_class",
      entityLabel: `${classSnapshot.title} - ${classSnapshot.class_date}`,
      sourceTable: "shakujo_classes",
      sourceId: classId,
      snapshot: classSnapshot,
      relatedSnapshots: {
        shakujo_attendance: previousRows ?? []
      },
      affectedMemberIds: Array.from(new Set((previousRows ?? []).map((row) => row.member_id))),
      notes: "Clase Shakujo eliminada."
    });
  }

  const { error } = await supabase
    .from("shakujo_classes")
    .delete()
    .eq("id", classId);

  if (error) {
    console.error("Error deleting shakujo class", error);
    redirect(`/shakujo?error=session&classId=${encodeURIComponent(classId)}`);
  }

  const affectedMemberIds = Array.from(new Set((previousRows ?? []).map((row) => row.member_id)));
  await Promise.all(affectedMemberIds.map((memberId) => recalculateMemberExamStatus(memberId)));

  redirect("/shakujo?saved=deleted");
}

export async function saveShakujoAttendanceAction(formData: FormData) {
  if (!(await hasInternalAccess())) redirect("/");
  const classId = String(formData.get("classId") ?? "").trim();
  if (!classId) redirect("/shakujo?error=attendance");

  const memberIds = formData.getAll("memberIds").map((value) => String(value).trim()).filter(Boolean);
  const now = new Date().toISOString();
  const supabase = createAdminClient();
  const { data: previousRows, error: previousError } = await supabase
    .from("shakujo_attendance")
    .select("member_id")
    .eq("shakujo_class_id", classId)
    .returns<Array<{ member_id: string }>>();

  if (previousError) {
    console.error("Error loading previous shakujo attendance", previousError);
    redirect("/shakujo?error=attendance");
  }

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

  const affectedMemberIds = Array.from(new Set([...(previousRows ?? []).map((row) => row.member_id), ...memberIds]));
  await Promise.all(affectedMemberIds.map((memberId) => recalculateMemberExamStatus(memberId)));

  redirect("/shakujo?saved=attendance");
}

async function recalculateActiveExamStatuses() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id")
    .eq("status", "active")
    .returns<Array<{ id: string }>>();

  if (error) throw error;

  for (const member of data ?? []) {
    await recalculateMemberExamStatus(member.id);
  }
}

async function recalculateChildRankings() {
  const supabase = createAdminClient();
  const [{ data: kids, error: kidsError }, { data: attendance, error: attendanceError }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id")
      .eq("class", "kids")
      .eq("status", "active")
      .returns<Array<{ id: string; legacy_id: string | null }>>(),
    supabase
      .from("attendance_logs")
      .select("member_id,attended_on")
      .returns<Array<{ member_id: string; attended_on: string }>>()
  ]);

  if (kidsError) throw kidsError;
  if (attendanceError) throw attendanceError;

  const today = startOfLocalDay(new Date());
  const byMember = new Map<string, string[]>();
  for (const row of attendance ?? []) {
    const current = byMember.get(row.member_id) ?? [];
    current.push(row.attended_on);
    byMember.set(row.member_id, current);
  }

  const rows = (kids ?? []).map((member) => {
    const dates = (byMember.get(member.id) ?? []).sort((a, b) => b.localeCompare(a));
    const attendance30d = countIsoDatesSince(dates, today, 30);
    const attendance90d = countIsoDatesSince(dates, today, 90);
    const lastAttendanceOn = dates[0] ?? null;
    const daysWithoutAttendance = lastAttendanceOn ? daysBetweenLocal(parseLocalDate(lastAttendanceOn), today) : null;
    const score = attendance30d * 3 + attendance90d;
    return {
      member_id: member.id,
      legacy_id: member.legacy_id,
      attendance_30d: attendance30d,
      attendance_90d: attendance90d,
      last_attendance_on: lastAttendanceOn,
      days_without_attendance: daysWithoutAttendance,
      score,
      position: null as number | null,
      level: null as string | null,
      constancy_status: childConstancyStatus(attendance30d, daysWithoutAttendance),
      motivational_message: "",
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  rows
    .sort((a, b) => b.score - a.score || (a.days_without_attendance ?? 9999) - (b.days_without_attendance ?? 9999))
    .forEach((row, index) => {
      row.position = index + 1;
      row.level = childRankingLevel(row.position, row.score);
      row.motivational_message = childMotivationalMessage(row.level, row.position, row.attendance_30d, row.days_without_attendance);
    });

  const { error: deleteError } = await supabase
    .from("child_rankings")
    .delete()
    .not("id", "is", null);

  if (deleteError) throw deleteError;

  if (!rows.length) return;

  const { error } = await supabase
    .from("child_rankings")
    .insert(rows.map((row) => ({ ...row, legacy_id: row.legacy_id ?? row.member_id })));

  if (error) throw error;
}

function countIsoDatesSince(dates: string[], today: Date, days: number) {
  return dates.filter((value) => daysBetweenLocal(parseLocalDate(value), today) <= days).length;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return startOfLocalDay(new Date(year, (month || 1) - 1, day || 1));
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetweenLocal(start: Date, end: Date) {
  return Math.floor((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / 86400000);
}

function childConstancyStatus(attendance30d: number, daysWithoutAttendance: number | null) {
  if (attendance30d >= 8) return "Excelente";
  if (attendance30d >= 4) return "Regular";
  if (attendance30d >= 1) return "En progreso";
  if (daysWithoutAttendance !== null && daysWithoutAttendance >= 30) return "Sin actividad reciente";
  return "Pendiente";
}

function childRankingLevel(position: number | null, score: number) {
  if (position !== null && position <= 3) return "TOP";
  if (score >= 25) return "ALTA";
  if (score >= 10) return "MEDIA";
  return "INICIO";
}

function childMotivationalMessage(level: string | null, position: number | null, attendance30d: number, daysWithoutAttendance: number | null) {
  if (position === 1) return "Esta liderando el ranking infantil con una constancia excelente.";
  if (level === "TOP") return "Esta entre los alumnos mas constantes del grupo.";
  if (attendance30d >= 4) return "Esta entrenando de forma regular. Buen trabajo.";
  if (attendance30d >= 1) return "Va mejorando poco a poco. La constancia es la clave.";
  if (daysWithoutAttendance !== null && daysWithoutAttendance >= 30) return "Lleva tiempo sin entrenar. Es importante volver poco a poco.";
  return "Seguimos construyendo constancia paso a paso.";
}

function normalizeClass(value: string) {
  return value === "kids" || value === "adults" ? value : null;
}

function normalizeTechnicalMaterialClass(value: string) {
  return value === "kids" || value === "adults" || value === "both" ? value : null;
}

function normalizeTechnicalMaterialType(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["youtube", "drive", "document", "playlist", "link", "site"].includes(normalized) ? normalized : "link";
}

function normalizeTechnicalMaterialSection(formData: FormData) {
  return (
    String(formData.get("sectionCustom") ?? "").trim() ||
    String(formData.get("section") ?? "").trim() ||
    "Material"
  );
}

function normalizeChildSyllabusGrade(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, " ");
  return kidsGrades.find((grade) => grade.toUpperCase() === normalized) ?? "";
}

function normalizeChildSyllabusCategory(value: string) {
  const normalized = value.trim().toLowerCase();
  const allowed = [
    "tecnica",
    "kihon",
    "desplazamiento",
    "ukemi",
    "kata",
    "howa",
    "gakka",
    "comportamiento",
    "etiqueta",
    "juego",
    "otro"
  ];
  return allowed.includes(normalized) ? normalized : "otro";
}

function normalizeCourseKind(value: string) {
  return value === "national" || value === "international" || value === "taikai" ? value : null;
}

function normalizeCompetitionMedal(value: string) {
  const normalized = value.trim().toLowerCase();
  if (["gold", "silver", "bronze", "participant"].includes(normalized)) return normalized;
  return null;
}

function normalizeStatus(value: string) {
  return value === "active" || value === "inactive" ? value : null;
}

function normalizeBeltStatus(value: string) {
  return ["pending", "ordered", "received", "delivered"].includes(value) ? value : null;
}

function normalizePaymentStatus(value: string) {
  return ["unpaid", "partial", "paid"].includes(value) ? value : null;
}

function inferPaymentStatus(totalCents: number, paidCents: number) {
  if (totalCents <= 0 && paidCents <= 0) return "unpaid";
  if (paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "partial";
  return "unpaid";
}

function parseEuroCents(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
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

function resolveFreeTrialFields(formData: FormData, joinedOn: string | null) {
  const enabled = formData.get("freeTrialEnabled") === "on";
  const startedOn = parseDateInput(String(formData.get("freeTrialStartedOn") ?? "")) ?? joinedOn;
  const endsOn = parseDateInput(String(formData.get("freeTrialEndsOn") ?? "")) ?? (startedOn ? addMonthsToIsoDate(startedOn, 1) : null);

  return {
    enabled,
    startedOn: enabled ? startedOn : null,
    endsOn: enabled ? endsOn : null
  };
}

function addMonthsToIsoDate(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return date.toISOString().slice(0, 10);
}

function addYearsToIsoDate(value: string, years: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
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

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function safeReturnPath(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") ? trimmed : "";
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

async function addAttendanceRows(classId: string, memberIds: string[], technicalNote = "WEB SKBC", formData?: FormData) {
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
    const trainedGradeOverride = String(formData?.get(`trainedGrade:${classId}:${member.id}`) ?? "").trim();
    const roleOverride = String(formData?.get(`technicalRole:${classId}:${member.id}`) ?? "").trim();
    const technicalRole = clase.class_group === "adults" && ["student", "teaching", "support", "reviewing", "observing"].includes(roleOverride)
      ? roleOverride
      : "student";
    const roleNote = technicalRole === "observing"
      ? "OBSERVA: asistencia registrada sin historial tecnico automatico."
      : technicalRole === "teaching"
        ? "ENSENA: asistencia registrada con bonus de ayuda en clase."
        : technicalRole === "reviewing"
          ? "PARCIAL/REPASO: revisar tecnicas exactas antes de cerrar si no hizo toda la clase."
          : technicalNote;
    const trainedGrade = clase.class_group === "adults"
      ? trainedGradeOverride || resolveTrainingGroupGrade(officialGrade)
      : officialGrade;
    return {
      legacy_id: `NEW-ASIS-${classId}-${member.id}`,
      class_id: classId,
      member_id: member.id,
      attended_on: clase.class_date,
      official_grade: officialGrade || null,
      trained_grade: trainedGrade || null,
      technical_role: technicalRole,
      technical_note: roleNote,
      use_for_history: technicalRole !== "observing"
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

  if (clase.class_group === "adults") {
    await addTeachingBonuses(supabase, classId, clase.class_date, rows.filter((row) => row.technical_role === "teaching").map((row) => row.member_id));
  }
}

async function addTeachingBonuses(
  supabase: ReturnType<typeof createAdminClient>,
  classId: string,
  classDate: string,
  memberIds: string[]
) {
  if (!memberIds.length) return;

  const reason = `Ayuda ensenando en clase ${classDate}`;
  const { data: existing, error: existingError } = await supabase
    .from("adult_ranking_bonuses")
    .select("member_id")
    .eq("bonus_date", classDate)
    .eq("reason", reason)
    .in("member_id", memberIds)
    .returns<Array<{ member_id: string }>>();

  if (existingError) throw existingError;
  const existingIds = new Set((existing ?? []).map((row) => row.member_id));
  const rows = memberIds
    .filter((memberId) => !existingIds.has(memberId))
    .map((memberId) => ({
      member_id: memberId,
      bonus_date: classDate,
      points: 1,
      reason,
      active: true,
      permanent: false,
      created_by: `WEB SKBC:${classId}`
    }));

  if (!rows.length) return;
  const { error } = await supabase.from("adult_ranking_bonuses").insert(rows);
  if (error) throw error;
}
