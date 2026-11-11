import { withIndividualWorkSnapshot } from "@/lib/individual-work-snapshot";
import { applyIndividualWork, loadIndividualWork, type IndividualWork } from "@/lib/attendance-individual-work";
import { createAdminClient } from "@/lib/supabase/admin";

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  class_group: "kids" | "adults";
  closed: boolean;
};

type AttendanceRow = {
  id: string;
  member_id: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_note: string | null;
  use_for_history: boolean;
  members: { first_name: string; last_name: string | null; class: string } | null;
};

type PlanRow = {
  id: string;
  legacy_id: string | null;
  technical_group_id: string | null;
  class_date: string;
  group_grade: string | null;
  target_grade: string | null;
  technique_id: string | null;
  technique_grade: string | null;
  technique_base: string | null;
  technique_name: string;
  category: string | null;
  content_type: string | null;
  proposal_type: string | null;
  focus: string | null;
  completed: boolean;
  notes: string | null;
  used_for_history: boolean;
};

type ExistingAssignment = {
  id: string;
  legacy_id: string | null;
  class_id: string;
  member_id: string;
  technique_id: string | null;
};

type TechnicalOverrideRow = {
  attendance_id: string;
  plan_id: string;
  include_in_history: boolean;
};

export async function setPlanTechniqueCompleted(planId: string, completed: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("technical_plans")
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", planId);

  if (error) throw error;
}

type AdultClassClosePhase = "technical" | "profiles" | "finalizing";

export async function closeAdultClass(classId: string, onPhase?: (phase: AdultClassClosePhase) => Promise<void>) {
  return withIndividualWorkSnapshot(classId, () => rebuildAdultClass(classId, onPhase));
}

async function rebuildAdultClass(classId: string, onPhase?: (phase: AdultClassClosePhase) => Promise<void>) {
  const supabase = createAdminClient();
  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,class_group,closed")
    .eq("id", classId)
    .single<ClassRow>();

  if (classError || !clase) throw new Error("Clase no encontrada.");
  if (clase.class_group !== "adults") throw new Error("El cierre tecnico replicado solo esta activo para adultos.");
  const wasClosed = clase.closed;

  const [{ data: attendance, error: attendanceError }, { data: plan, error: planError }] =
    await Promise.all([
      supabase
        .from("attendance_logs")
        .select("id,member_id,official_grade,trained_grade,technical_note,use_for_history,members(first_name,last_name,class)")
        .eq("class_id", clase.id)
        .eq("use_for_history", true)
        .returns<AttendanceRow[]>(),
      supabase
        .from("technical_plans")
        .select("id,legacy_id,technical_group_id,class_date,group_grade,target_grade,technique_id,technique_grade,technique_base,technique_name,category,content_type,proposal_type,focus,completed,notes,used_for_history")
        .eq("class_id", clase.id)
        .returns<PlanRow[]>()
    ]);

  if (attendanceError) throw attendanceError;
  if (planError) throw planError;

  const validAttendance = (attendance ?? []).filter((row) => row.members?.class === "adults");
  const completedPlan = (plan ?? []).filter((row) => row.completed && row.technique_id);
  const progressionPlan = completedPlan.filter((row) => row.used_for_history);

  const individual = validAttendance.length ? await loadIndividualWork(clase.id) : new Map<string, IndividualWork>();
  const overrides = await getTechnicalOverrides(clase.id, validAttendance);
  if (wasClosed) {
    await clearGeneratedClassTechnicalHistory(supabase, clase.id);
  }

  await onPhase?.("technical");

  let assignmentCount = 0;
  let dojoHistoryCount = 0;
  let memberHistoryCount = 0;

  if (validAttendance.length && (completedPlan.length || individual.size)) {
    const insertedAssignments = await generateAssignments(clase, validAttendance, completedPlan, overrides, individual);
    assignmentCount = insertedAssignments;
    dojoHistoryCount = await generateDojoHistory(clase, validAttendance, progressionPlan);
    await onPhase?.("profiles");
    memberHistoryCount = await generateMemberHistory(clase);
    if (!wasClosed) await updateTechniqueMetrics(completedPlan);
  } else {
    await onPhase?.("profiles");
  }

  await onPhase?.("finalizing");

  const { error: updateError } = await supabase
    .from("classes")
    .update({ closed: true, status: "completed", updated_at: new Date().toISOString() })
    .eq("id", clase.id);

  if (updateError) throw updateError;

  return { assignments: assignmentCount, dojoHistory: dojoHistoryCount, memberHistory: memberHistoryCount };
}

async function clearGeneratedClassTechnicalHistory(
  supabase: ReturnType<typeof createAdminClient>,
  classId: string
) {
  const { error: memberHistoryError } = await supabase
    .from("member_technical_history")
    .delete()
    .eq("class_id", classId);
  if (memberHistoryError) throw memberHistoryError;

  const { error: assignmentsError } = await supabase
    .from("member_technique_assignments")
    .delete()
    .eq("class_id", classId)
    .eq("created_by", "system");
  if (assignmentsError) throw assignmentsError;

  const { error: dojoHistoryError } = await supabase
    .from("dojo_technical_history")
    .delete()
    .eq("class_id", classId);
  if (dojoHistoryError) throw dojoHistoryError;
}

async function getTechnicalOverrides(classId: string, attendance: AttendanceRow[]) {
  const attendanceIds = attendance.map((row) => row.id);
  if (!attendanceIds.length) return new Map<string, Set<string>>();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance_technical_overrides")
    .select("attendance_id,plan_id,include_in_history")
    .eq("class_id", classId)
    .in("attendance_id", attendanceIds)
    .returns<TechnicalOverrideRow[]>();

  if (error) throw error;

  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.include_in_history) continue;
    const planIds = map.get(row.attendance_id) ?? new Set<string>();
    planIds.add(row.plan_id);
    map.set(row.attendance_id, planIds);
  }
  return map;
}

async function generateAssignments(
  clase: ClassRow,
  attendance: AttendanceRow[],
  plan: PlanRow[],
  overrides: Map<string, Set<string>>,
  individual: Map<string, IndividualWork>
) {
  const supabase = createAdminClient();
  const { data: existing, error } = await supabase
    .from("member_technique_assignments")
    .select("id,legacy_id,class_id,member_id,technique_id")
    .eq("class_id", clase.id)
    .returns<ExistingAssignment[]>();

  if (error) throw error;

  const existingKeys = new Set(
    (existing ?? []).map((row) => `${row.class_id}::${row.member_id}::${row.technique_id ?? ""}`)
  );
  const planById = new Map(plan.map((item) => [item.id, item]));
  const planByGrade = new Map<string, PlanRow[]>();
  for (const item of plan) {
    const grade = normalize(item.group_grade);
    const items = planByGrade.get(grade) ?? [];
    items.push(item);
    planByGrade.set(grade, items);
  }

  const inserts = [];
  for (const attendant of attendance) {
    const grade = normalize(attendant.trained_grade ?? attendant.official_grade);
    const legacyOverride = overrides.get(attendant.id);
    const adjustment = attendant.use_for_history ? individual.get(attendant.id) : undefined;
    const baseline = legacyOverride
      ? [...legacyOverride].map((id) => planById.get(id)).filter((item): item is PlanRow => Boolean(item))
      : grade ? planByGrade.get(grade) ?? [] : [];
    const baselineByTechnique = new Map<string, PlanRow>();
    for (const item of baseline) {
      if (item.technique_id && !baselineByTechnique.has(item.technique_id)) {
        baselineByTechnique.set(item.technique_id, item);
      }
    }

    const baseIds = [...baselineByTechnique.keys()];
    const selectedIds = adjustment ? applyIndividualWork(baseIds, adjustment) : baseIds;
    for (const techniqueId of selectedIds) {
      const key = `${clase.id}::${attendant.member_id}::${techniqueId}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      const item = adjustment?.mode === "replace" ? undefined : baselineByTechnique.get(techniqueId);
      const isReview = item ? isReviewForAttendant(item, attendant) : true;
      inserts.push({
        legacy_id: buildGeneratedLegacyId(item ? "ATAC" : "ATI", clase.id, attendant.member_id, techniqueId),
        class_id: clase.id,
        plan_id: item?.id ?? null,
        technique_id: techniqueId,
        member_id: attendant.member_id,
        assigned_on: item?.class_date || clase.class_date,
        group_grade: item ? item.group_grade : grade || null,
        active: true,
        completed: true,
        counts_as_progression: !isReview,
        counts_as_review: isReview,
        counts_for_stats: true,
        notes: attendant.technical_note || (adjustment || legacyOverride ? "AJUSTE TECNICO MANUAL DE CLASE" : "AUTOASIGNADO POR GRUPO Y TECNICAS REALIZADAS"),
        created_by: "system"
      });
    }
  }

  if (!inserts.length) return 0;
  const { error: insertError } = await supabase.from("member_technique_assignments").insert(inserts);
  if (insertError) throw insertError;
  return inserts.length;
}

function isReviewForAttendant(item: PlanRow, attendant: AttendanceRow) {
  const isReview = normalize(item.proposal_type ?? item.focus) === "REPASO";
  if (!isReview) return false;
  return normalize(attendant.trained_grade ?? attendant.official_grade) !== "MINARAI";
}

async function generateDojoHistory(clase: ClassRow, attendance: AttendanceRow[], plan: PlanRow[]) {
  const supabase = createAdminClient();
  const attendanceGrades = new Set(attendance.map((row) => normalize(row.trained_grade)).filter(Boolean));

  const { data: existing, error } = await supabase
    .from("dojo_technical_history")
    .select("class_id,technical_group_id,technique_id")
    .eq("class_id", clase.id)
    .returns<{ class_id: string; technical_group_id: string | null; technique_id: string | null }[]>();

  if (error) throw error;

  const existingKeys = new Set(
    (existing ?? []).map((row) => `${row.class_id}::${row.technical_group_id ?? ""}::${row.technique_id ?? ""}`)
  );

  const inserts = plan
    .filter((row) => attendanceGrades.has(normalize(row.group_grade)))
    .filter((row) => {
      const key = `${clase.id}::${row.technical_group_id ?? ""}::${row.technique_id ?? ""}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    })
    .map((row) => ({
      legacy_id: buildGeneratedLegacyId("HIS", clase.id, row.technical_group_id ?? row.group_grade, row.technique_id ?? row.id),
      class_id: clase.id,
      class_date: row.class_date || clase.class_date,
      technical_group_id: row.technical_group_id,
      group_grade: row.group_grade,
      target_grade: row.target_grade,
      technique_id: row.technique_id,
      technique_grade: row.technique_grade,
      technique_base: row.technique_base,
      technique_name: row.technique_name,
      category: row.category,
      content_type: row.content_type,
      proposal_type: row.proposal_type,
      focus: row.focus,
      completed: true,
      counts_repetition: true,
      notes: row.notes
    }));

  if (!inserts.length) return 0;
  const { error: insertError } = await supabase.from("dojo_technical_history").insert(inserts);
  if (insertError) throw insertError;
  return inserts.length;
}

function individualTechnique(row: { legacy_id: string | null; techniques: { name: string; grade: string | null; category: string | null; content_type: string | null } | null }) {
  return row.legacy_id?.startsWith("ATI") ? row.techniques : null;
}

async function generateMemberHistory(clase: ClassRow) {
  const supabase = createAdminClient();
  const { data: assignments, error: assignmentError } = await supabase
    .from("member_technique_assignments")
    .select("id,legacy_id,class_id,assigned_on,member_id,group_grade,completed,counts_as_progression,counts_as_review,counts_for_stats,notes,created_by,technique_id,techniques(name,grade,category,content_type),technical_plans(technical_group_id,target_grade,technique_id,technique_name,technique_grade,category,content_type,proposal_type),members(grade)")
    .eq("class_id", clase.id);

  if (assignmentError) throw assignmentError;

  const { data: existing, error: existingError } = await supabase
    .from("member_technical_history")
    .select("assignment_id,class_id,member_id,technique_id")
    .eq("class_id", clase.id);

  if (existingError) throw existingError;

  const existingAssignmentIds = new Set((existing ?? []).map((row) => row.assignment_id).filter(Boolean));
  const existingKeys = new Set(
    (existing ?? []).map((row) => `${row.class_id}::${row.member_id}::${row.technique_id ?? ""}`)
  );

  const inserts = (assignments ?? [])
    .filter((row: any) => row.completed)
    .filter((row: any) => {
      const techniqueId = row.technical_plans?.technique_id ?? (individualTechnique(row) ? row.technique_id : null);
      const key = `${row.class_id}::${row.member_id}::${techniqueId ?? ""}`;
      if (existingAssignmentIds.has(row.id) || existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    })
    .map((row: any) => {
      const plan = row.technical_plans;
      const extra = individualTechnique(row);
      const techniqueId = plan?.technique_id ?? (extra ? row.technique_id : null);
      return {
        legacy_id: buildGeneratedLegacyId("HIA", row.class_id, row.member_id, techniqueId ?? row.id),
        class_id: row.class_id,
        class_date: row.assigned_on || clase.class_date,
        assignment_id: row.id,
        member_id: row.member_id,
        member_grade_at_time: row.members?.grade ?? null,
        technical_group_id: plan?.technical_group_id ?? null,
        group_grade: row.group_grade,
        target_grade: plan?.target_grade ?? null,
        technique_id: techniqueId,
        technique_name: plan?.technique_name ?? extra?.name ?? "",
        technique_grade: plan?.technique_grade ?? extra?.grade ?? null,
        category: plan?.category ?? extra?.category ?? null,
        content_type: plan?.content_type ?? extra?.content_type ?? null,
        proposal_type: plan?.proposal_type ?? null,
        completed: true,
        counts_as_progression: row.counts_as_progression,
        counts_as_review: row.counts_as_review,
        counts_for_stats: row.counts_for_stats,
        notes: row.notes,
        created_by: row.created_by ?? "system"
      };
    })
    .filter((row: any) => row.technique_name);

  if (!inserts.length) return 0;
  const { error: insertError } = await supabase.from("member_technical_history").insert(inserts);
  if (insertError) throw insertError;
  return inserts.length;
}

async function updateTechniqueMetrics(plan: PlanRow[]) {
  const supabase = createAdminClient();
  const byTechnique = new Map<string, string>();
  plan.forEach((row) => {
    if (row.technique_id) byTechnique.set(row.technique_id, row.class_date);
  });

  for (const [techniqueId, date] of byTechnique) {
    const { data, error } = await supabase
      .from("techniques")
      .select("repetitions")
      .eq("id", techniqueId)
      .single<{ repetitions: number | null }>();

    if (error) throw error;

    const { error: updateError } = await supabase
      .from("techniques")
      .update({
        repetitions: (data?.repetitions ?? 0) + 1,
        last_trained_on: date,
        updated_at: new Date().toISOString()
      })
      .eq("id", techniqueId);

    if (updateError) throw updateError;
  }
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function buildGeneratedLegacyId(prefix: string, ...parts: Array<string | null | undefined>) {
  const body = parts
    .map((part) => String(part ?? "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 12))
    .filter(Boolean)
    .join("_");
  return `${prefix}_${body}`;
}
