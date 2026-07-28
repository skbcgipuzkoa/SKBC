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

export async function setPlanTechniqueCompleted(planId: string, completed: boolean) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("technical_plans")
    .update({ completed, updated_at: new Date().toISOString() })
    .eq("id", planId);

  if (error) throw error;
}

export async function closeAdultClass(classId: string) {
  const supabase = createAdminClient();
  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,class_group,closed")
    .eq("id", classId)
    .single<ClassRow>();

  if (classError || !clase) throw new Error("Clase no encontrada.");
  if (clase.class_group !== "adults") throw new Error("El cierre tecnico replicado solo esta activo para adultos.");
  if (clase.closed) return { assignments: 0, dojoHistory: 0, memberHistory: 0 };

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
  const validPlan = (plan ?? []).filter((row) => row.completed && row.used_for_history && row.technique_id);

  let assignmentCount = 0;
  let dojoHistoryCount = 0;
  let memberHistoryCount = 0;

  if (validAttendance.length && validPlan.length) {
    const insertedAssignments = await generateAssignments(clase, validAttendance, validPlan);
    assignmentCount = insertedAssignments;
    dojoHistoryCount = await generateDojoHistory(clase, validAttendance, validPlan);
    memberHistoryCount = await generateMemberHistory(clase);
    await updateTechniqueMetrics(validPlan);
  }

  const { error: updateError } = await supabase
    .from("classes")
    .update({ closed: true, status: "completed", updated_at: new Date().toISOString() })
    .eq("id", clase.id);

  if (updateError) throw updateError;

  return { assignments: assignmentCount, dojoHistory: dojoHistoryCount, memberHistory: memberHistoryCount };
}

async function generateAssignments(clase: ClassRow, attendance: AttendanceRow[], plan: PlanRow[]) {
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
  const attendanceByGrade = groupAttendanceByTrainedGrade(attendance);
  let nextCounter = await getNextLegacyCounter("member_technique_assignments", "ATAC_");

  const inserts = [];
  for (const item of plan) {
    const groupGrade = normalize(item.group_grade);
    const attendants = attendanceByGrade.get(groupGrade) ?? [];
    const isReview = normalize(item.proposal_type ?? item.focus) === "REPASO";

    for (const attendant of attendants) {
      const key = `${clase.id}::${attendant.member_id}::${item.technique_id ?? ""}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      inserts.push({
        legacy_id: `ATAC_${String(nextCounter++).padStart(6, "0")}`,
        class_id: clase.id,
        plan_id: item.id,
        technique_id: item.technique_id,
        member_id: attendant.member_id,
        assigned_on: item.class_date || clase.class_date,
        group_grade: item.group_grade,
        active: true,
        completed: true,
        counts_as_progression: !isReview,
        counts_as_review: isReview,
        counts_for_stats: true,
        notes: attendant.technical_note || "AUTOASIGNADO POR GRUPO Y TECNICAS REALIZADAS",
        created_by: "system"
      });
    }
  }

  if (!inserts.length) return 0;
  const { error: insertError } = await supabase.from("member_technique_assignments").insert(inserts);
  if (insertError) throw insertError;
  return inserts.length;
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
  let nextCounter = await getNextLegacyCounter("dojo_technical_history", "HIS_");

  const inserts = plan
    .filter((row) => attendanceGrades.has(normalize(row.group_grade)))
    .filter((row) => {
      const key = `${clase.id}::${row.technical_group_id ?? ""}::${row.technique_id ?? ""}`;
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    })
    .map((row) => ({
      legacy_id: `HIS_${String(nextCounter++).padStart(6, "0")}`,
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

async function generateMemberHistory(clase: ClassRow) {
  const supabase = createAdminClient();
  const { data: assignments, error: assignmentError } = await supabase
    .from("member_technique_assignments")
    .select("id,legacy_id,class_id,assigned_on,member_id,group_grade,completed,counts_as_progression,counts_as_review,counts_for_stats,notes,created_by,technical_plans(technical_group_id,target_grade,technique_id,technique_name,technique_grade,category,content_type,proposal_type),members(grade)")
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
  let nextCounter = await getNextLegacyCounter("member_technical_history", "HIA_");

  const inserts = (assignments ?? [])
    .filter((row: any) => row.completed)
    .filter((row: any) => {
      const techniqueId = row.technical_plans?.technique_id ?? null;
      const key = `${row.class_id}::${row.member_id}::${techniqueId ?? ""}`;
      if (existingAssignmentIds.has(row.id) || existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    })
    .map((row: any) => {
      const plan = row.technical_plans;
      return {
        legacy_id: `HIA_${String(nextCounter++).padStart(6, "0")}`,
        class_id: row.class_id,
        class_date: row.assigned_on || clase.class_date,
        assignment_id: row.id,
        member_id: row.member_id,
        member_grade_at_time: row.members?.grade ?? null,
        technical_group_id: plan?.technical_group_id ?? null,
        group_grade: row.group_grade,
        target_grade: plan?.target_grade ?? null,
        technique_id: plan?.technique_id ?? null,
        technique_name: plan?.technique_name ?? "",
        technique_grade: plan?.technique_grade ?? null,
        category: plan?.category ?? null,
        content_type: plan?.content_type ?? null,
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

async function getNextLegacyCounter(table: string, prefix: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(table)
    .select("legacy_id")
    .like("legacy_id", `${prefix}%`)
    .returns<{ legacy_id: string | null }[]>();

  if (error) throw error;
  return (
    (data ?? []).reduce((highest, row) => {
      const match = row.legacy_id?.match(/(\d+)$/);
      return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest;
    }, 0) + 1
  );
}

function groupAttendanceByTrainedGrade(attendance: AttendanceRow[]) {
  const map = new Map<string, AttendanceRow[]>();
  attendance.forEach((row) => {
    const grade = normalize(row.trained_grade ?? row.official_grade);
    if (!grade) return;
    const group = map.get(grade) ?? [];
    group.push(row);
    map.set(grade, group);
  });
  return map;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}
