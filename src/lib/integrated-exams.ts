import { adultGrades, kidsGrades } from "@/lib/grades";
import { registerExam } from "@/lib/exams";
import { generateDiplomaForExam } from "@/lib/diplomas";
import { generateIntegratedExamDocumentsForStudent } from "@/lib/integrated-exam-documents";
import { createAdminClient } from "@/lib/supabase/admin";

export type IntegratedExamProgram = "adults" | "kids_progressive" | "kids" | "dan_tribunal";

type MemberForIntegratedExam = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: string | null;
};

type ExamEvent = {
  id: string;
  title: string;
  exam_date: string;
  program_type: IntegratedExamProgram;
  pass_percentage: number;
  status: string;
  notes: string | null;
};

type ExamEventStudent = {
  id: string;
  exam_event_id: string;
  member_id: string;
  display_order: number;
  current_grade: string | null;
  target_grade: string | null;
  final_percentage: number | null;
  final_passed: boolean | null;
  members?: { legacy_id: string | null; display_name: string; class: "kids" | "adults"; grade: string | null } | null;
};

type ExamEventItem = {
  id: string;
  exam_event_id: string;
  source: "technique" | "child_syllabus" | "manual" | "cut";
  section: string | null;
  name: string;
  summary: string | null;
  grade: string | null;
  category: string | null;
  weight: number;
  order_index: number;
  cut_grade: string | null;
  active: boolean;
};

type ExamEventExaminer = {
  id: string;
  exam_event_id: string;
  name: string;
  email: string | null;
  access_token: string;
  submitted_at: string | null;
  revoked_at: string | null;
};

type ExamEventScore = {
  event_student_id: string;
  event_item_id: string;
  examiner_id: string;
  score: number | null;
  skipped: boolean;
};

type ExamEventReview = {
  event_student_id: string;
  final_passed: boolean | null;
  final_percentage: number | null;
};

export async function createIntegratedExamEvent(input: {
  title: string;
  examDate: string;
  programType: IntegratedExamProgram;
  passPercentage: number;
  memberIds: string[];
  examinerNames: string[];
  notes?: string | null;
}) {
  const supabase = createAdminClient();
  const memberIds = [...new Set(input.memberIds.filter(Boolean))];
  if (!memberIds.length) throw new Error("Selecciona al menos un kenshi.");
  if (!input.examDate) throw new Error("Indica fecha de examen.");

  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id,legacy_id,display_name,class,grade,status")
    .in("id", memberIds)
    .eq("status", "active")
    .order("display_name")
    .returns<MemberForIntegratedExam[]>();

  if (membersError) throw membersError;
  if (!members?.length) throw new Error("No se han encontrado kenshis activos para el examen.");

  const expectedClass = input.programType === "adults" || input.programType === "dan_tribunal" ? "adults" : "kids";
  const filteredMembers = members.filter((member) => member.class === expectedClass);
  if (!filteredMembers.length) throw new Error("Los kenshis seleccionados no coinciden con el tipo de examen.");

  const title = input.title.trim() || defaultExamTitle(input.programType, input.examDate);
  const { data: event, error: eventError } = await supabase
    .from("exam_events")
    .insert({
      title,
      exam_date: input.examDate,
      program_type: input.programType,
      pass_percentage: input.passPercentage || 70,
      status: "active",
      notes: input.notes ?? null,
      created_by: "WEB SKBC"
    })
    .select("id")
    .single<{ id: string }>();

  if (eventError || !event) throw eventError ?? new Error("No se pudo crear el examen.");

  const students = filteredMembers.map((member, index) => ({
    exam_event_id: event.id,
    member_id: member.id,
    display_order: index + 1,
    current_grade: member.grade,
    target_grade: resolveTargetGrade(member.class, member.grade)
  }));

  const { data: insertedStudents, error: studentsError } = await supabase
    .from("exam_event_students")
    .insert(students)
    .select("id,member_id,current_grade,target_grade")
    .returns<Array<{ id: string; member_id: string; current_grade: string | null; target_grade: string | null }>>();

  if (studentsError) throw studentsError;

  const items = await buildExamItems(event.id, input.programType, students.map((student) => student.target_grade).filter(Boolean) as string[]);
  if (!items.length) {
    await supabase.from("exam_events").delete().eq("id", event.id);
    throw new Error(
      input.programType === "kids" || input.programType === "kids_progressive"
        ? "No hay temario infantil activo ni un examen infantil anterior que pueda usarse como plantilla."
        : "No hay temario disponible para crear este examen."
    );
  }

  const { error: itemsError } = await supabase.from("exam_event_items").insert(items);
  if (itemsError) throw itemsError;

  const examinerNames = input.examinerNames.length ? input.examinerNames : ["Alvaro Calvo"];
  const { error: examinersError } = await supabase.from("exam_event_examiners").insert(
    examinerNames.map((name) => ({
      exam_event_id: event.id,
      name
    }))
  );
  if (examinersError) throw examinersError;

  await refreshIntegratedExamReview(event.id);
  return { eventId: event.id, studentCount: insertedStudents?.length ?? students.length, itemCount: items.length };
}

export async function getIntegratedExamAdmin(eventId: string) {
  const supabase = createAdminClient();
  const { data: event, error: eventError } = await supabase
    .from("exam_events")
    .select("id,title,exam_date,program_type,pass_percentage,status,notes")
    .eq("id", eventId)
    .single<ExamEvent>();
  if (eventError || !event) throw eventError ?? new Error("Examen no encontrado.");

  const [{ data: students }, { data: items }, { data: examiners }, { data: scores }] = await Promise.all([
    supabase
      .from("exam_event_students")
      .select("id,exam_event_id,member_id,display_order,current_grade,target_grade,final_percentage,final_passed,members(legacy_id,display_name,class,grade)")
      .eq("exam_event_id", eventId)
      .order("display_order")
      .returns<ExamEventStudent[]>(),
    supabase
      .from("exam_event_items")
      .select("id,exam_event_id,source,section,name,summary,grade,category,weight,order_index,cut_grade,active")
      .eq("exam_event_id", eventId)
      .order("order_index")
      .returns<ExamEventItem[]>(),
    supabase
      .from("exam_event_examiners")
      .select("id,exam_event_id,name,email,access_token,submitted_at,revoked_at")
      .eq("exam_event_id", eventId)
      .order("created_at")
      .returns<ExamEventExaminer[]>(),
    supabase
      .from("exam_event_scores")
      .select("event_student_id,event_item_id,examiner_id,score,skipped")
      .eq("exam_event_id", eventId)
      .returns<ExamEventScore[]>()
  ]);

  return {
    event,
    students: students ?? [],
    items: items ?? [],
    examiners: examiners ?? [],
    scores: scores ?? [],
    summaries: summarizeScores(event.program_type, students ?? [], items ?? [], scores ?? [], event.pass_percentage)
  };
}

export async function getRecentIntegratedExamEvents(limit = 12) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("exam_events")
    .select("id,title,exam_date,program_type,status,pass_percentage,exam_event_students(id),exam_event_examiners(id,submitted_at)")
    .order("exam_date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Array<ExamEvent & {
    exam_event_students?: Array<{ id: string }>;
    exam_event_examiners?: Array<{ id: string; submitted_at: string | null }>;
  }>;
}

export async function deleteIntegratedExamEvent(eventId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("exam_events")
    .delete()
    .eq("id", eventId);

  if (error) throw error;
}

export async function getExaminerExamByToken(token: string) {
  const supabase = createAdminClient();
  const { data: examiner, error: examinerError } = await supabase
    .from("exam_event_examiners")
    .select("id,exam_event_id,name,email,access_token,submitted_at,revoked_at,exam_events(id,title,exam_date,program_type,pass_percentage,status,notes)")
    .eq("access_token", token)
    .maybeSingle<any>();

  if (examinerError) throw examinerError;
  if (!examiner || examiner.revoked_at) throw new Error("Enlace de examen no valido.");

  const event = examiner.exam_events as ExamEvent | null;
  if (!event) throw new Error("Examen no encontrado.");

  const [{ data: students }, { data: items }, { data: existingScores }] = await Promise.all([
    supabase
      .from("exam_event_students")
      .select("id,member_id,display_order,current_grade,target_grade,members(display_name,class,grade)")
      .eq("exam_event_id", examiner.exam_event_id)
      .order("display_order")
      .returns<ExamEventStudent[]>(),
    supabase
      .from("exam_event_items")
      .select("id,source,section,name,summary,grade,category,weight,order_index,cut_grade,active")
      .eq("exam_event_id", examiner.exam_event_id)
      .eq("active", true)
      .order("order_index")
      .returns<ExamEventItem[]>(),
    supabase
      .from("exam_event_scores")
      .select("event_student_id,event_item_id,score,skipped")
      .eq("exam_event_id", examiner.exam_event_id)
      .eq("examiner_id", examiner.id)
      .returns<Array<{ event_student_id: string; event_item_id: string; score: number | null; skipped: boolean }>>()
  ]);

  return {
    examiner: examiner as ExamEventExaminer,
    event,
    students: students ?? [],
    items: items ?? [],
    existingScores: existingScores ?? []
  };
}

export async function submitIntegratedExamScores(input: {
  token: string;
  scores: Array<{ eventStudentId: string; eventItemId: string; score: number | null; skipped: boolean }>;
}) {
  const payload = await getExaminerExamByToken(input.token);
  if (payload.examiner.submitted_at) throw new Error("Este enlace ya fue enviado.");

  const scorableItemIds = new Set(payload.items.filter((item) => item.source !== "cut").map((item) => item.id));
  const studentIds = new Set(payload.students.map((student) => student.id));
  const rows = input.scores
    .filter((row) => studentIds.has(row.eventStudentId) && scorableItemIds.has(row.eventItemId))
    .map((row) => ({
      exam_event_id: payload.event.id,
      event_student_id: row.eventStudentId,
      event_item_id: row.eventItemId,
      examiner_id: payload.examiner.id,
      score: row.skipped ? null : row.score,
      skipped: row.skipped,
      updated_at: new Date().toISOString()
    }));

  if (!rows.length) throw new Error("No hay puntuaciones para guardar.");

  const supabase = createAdminClient();
  const { error: scoreError } = await supabase
    .from("exam_event_scores")
    .upsert(rows, { onConflict: "event_student_id,event_item_id,examiner_id" });
  if (scoreError) throw scoreError;

  const { error: examinerError } = await supabase
    .from("exam_event_examiners")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", payload.examiner.id);
  if (examinerError) throw examinerError;

  await refreshIntegratedExamReview(payload.event.id);
}

export async function finalizeIntegratedExamEvent(eventId: string, finalizedBy = "WEB SKBC") {
  const supabase = createAdminClient();
  const { event, students, items, examiners, scores } = await getIntegratedExamAdmin(eventId);
  if (event.status === "completed" || event.status === "archived") {
    throw new Error("Este examen ya esta cerrado.");
  }

  const submittedExaminers = examiners.filter((examiner) => examiner.submitted_at && !examiner.revoked_at);
  if (!submittedExaminers.length) {
    throw new Error("Antes de cerrar el examen hace falta al menos una evaluacion enviada.");
  }

  const summaries = summarizeScores(event.program_type, students, items, scores, event.pass_percentage);
  const { data: reviews, error: reviewsError } = await supabase
    .from("exam_event_reviews")
    .select("event_student_id,final_passed,final_percentage")
    .eq("exam_event_id", eventId)
    .returns<ExamEventReview[]>();
  if (reviewsError) throw reviewsError;

  const reviewByStudent = new Map((reviews ?? []).map((review) => [review.event_student_id, review]));
  const examinerLabel = submittedExaminers.map((examiner) => examiner.name).join(", ") || "Examen integrado SKBC";
  const registered: Array<{ studentId: string; examId: string }> = [];

  for (const student of students) {
    const review = reviewByStudent.get(student.id);
    const summary = summaries.find((item) => item.studentId === student.id);
    const finalPassed = review?.final_passed ?? summary?.passed ?? false;
    const targetGrade = student.target_grade?.trim();
    if (!finalPassed || !targetGrade) continue;

    const result = await registerExam({
      memberId: student.member_id,
      examDate: event.exam_date,
      grade: targetGrade,
      examiner: examinerLabel,
      registeredBy: finalizedBy
    });
    registered.push({ studentId: student.id, examId: result.examId });
  }

  const documentErrors: string[] = [];
  for (const row of registered) {
    const student = students.find((item) => item.id === row.studentId);
    const summary = summaries.find((item) => item.studentId === row.studentId);
    if (!student || !summary) continue;
    try {
      await generateIntegratedExamDocumentsForStudent({
        examId: row.examId,
        event,
        student,
        items,
        examiners: submittedExaminers,
        scores,
        summary,
        createdBy: finalizedBy
      });
    } catch (error) {
      documentErrors.push(`${student.members?.display_name ?? "Kenshi"}: informe ${errorMessage(error)}`);
    }
    try {
      await generateDiplomaForExam(row.examId);
    } catch (error) {
      documentErrors.push(`${student.members?.display_name ?? "Kenshi"}: diploma ${errorMessage(error)}`);
    }
  }

  const now = new Date().toISOString();
  for (const row of registered) {
    const { error } = await supabase
      .from("exam_event_reviews")
      .update({
        reviewed_by: finalizedBy,
        reviewed_at: now,
        updated_at: now
      })
      .eq("exam_event_id", eventId)
      .eq("event_student_id", row.studentId);
    if (error) throw error;
  }

  const { error: eventError } = await supabase
    .from("exam_events")
    .update({
      status: "completed",
      updated_at: now
    })
    .eq("id", eventId);
  if (eventError) throw eventError;

  return {
    registeredCount: registered.length,
    documentErrorCount: documentErrors.length,
    passedCount: summaries.filter((summary) => {
      const review = reviewByStudent.get(summary.studentId);
      return review?.final_passed ?? summary.passed;
    }).length,
    studentCount: students.length
  };
}

export async function refreshIntegratedExamReview(eventId: string) {
  const supabase = createAdminClient();
  const { event, students, items, scores } = await getIntegratedExamAdmin(eventId);
  const summaries = summarizeScores(event.program_type, students, items, scores, event.pass_percentage);

  if (!summaries.length) return;

  const rows = summaries.map((summary) => ({
    exam_event_id: eventId,
    event_student_id: summary.studentId,
    base_percentage: summary.percentage,
    final_percentage: summary.percentage,
    final_passed: summary.passed,
    reviewed_at: null,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from("exam_event_reviews")
    .upsert(rows, { onConflict: "exam_event_id,event_student_id" });
  if (error) throw error;

  for (const summary of summaries) {
    await supabase
      .from("exam_event_students")
      .update({
        final_percentage: summary.percentage,
        final_passed: summary.passed,
        updated_at: new Date().toISOString()
      })
      .eq("id", summary.studentId);
  }
}

function summarizeScores(programType: IntegratedExamProgram, students: ExamEventStudent[], items: ExamEventItem[], scores: ExamEventScore[], passPercentage: number) {
  const scorableItems = items.filter((item) => item.active && item.source !== "cut");
  return students.map((student) => {
    const relevantItems = scorableItems.filter((item) => isItemRelevantForStudent(programType, student, item));
    let total = 0;
    let max = 0;
    for (const item of relevantItems) {
      const itemScores = scores.filter((score) => score.event_student_id === student.id && score.event_item_id === item.id && !score.skipped && score.score !== null);
      const average = itemScores.length ? itemScores.reduce((sum, score) => sum + Number(score.score ?? 0), 0) / itemScores.length : 0;
      total += average * Number(item.weight || 1);
      max += 10 * Number(item.weight || 1);
    }
    const percentage = max ? Math.round((total / max) * 1000) / 10 : 0;
    return {
      studentId: student.id,
      memberId: student.member_id,
      percentage,
      passed: percentage >= passPercentage,
      scoredItems: scores.filter((score) => score.event_student_id === student.id && !score.skipped && score.score !== null && relevantItems.some((item) => item.id === score.event_item_id)).length,
      totalItems: relevantItems.length
    };
  });
}

function isItemRelevantForStudent(programType: IntegratedExamProgram, student: ExamEventStudent, item: ExamEventItem) {
  if (programType === "kids" || programType === "kids_progressive") {
    return gradeIndex(kidsGrades, item.grade) <= gradeIndex(kidsGrades, student.target_grade);
  }
  return normalizeGrade(item.grade) === normalizeGrade(student.target_grade);
}

async function buildExamItems(eventId: string, programType: IntegratedExamProgram, targetGrades: string[]) {
  if (programType === "adults" || programType === "dan_tribunal") {
    return buildAdultItems(eventId, targetGrades);
  }
  return buildKidsItems(eventId, targetGrades);
}

async function buildAdultItems(eventId: string, targetGrades: string[]) {
  const supabase = createAdminClient();
  const grades = [...new Set(targetGrades.filter(Boolean))];
  const { data, error } = await supabase
    .from("techniques")
    .select("id,grade,name,category,content_type,summary_es,curriculum_order,program_order")
    .in("grade", grades)
    .eq("active", true)
    .order("curriculum_order", { ascending: true })
    .order("program_order", { ascending: true })
    .order("name", { ascending: true })
    .returns<Array<{
      id: string;
      grade: string | null;
      name: string;
      category: string | null;
      content_type: string | null;
      summary_es: string | null;
      curriculum_order: number | null;
      program_order: number | null;
    }>>();

  if (error) throw error;
  return (data ?? []).map((item, index) => ({
    exam_event_id: eventId,
    source: "technique",
    technique_id: item.id,
    section: item.content_type || item.category || "TECNICA",
    name: item.name,
    summary: item.summary_es,
    grade: item.grade,
    category: item.category,
    order_index: index + 1
  }));
}

async function buildKidsItems(eventId: string, targetGrades: string[]) {
  const supabase = createAdminClient();
  const maxIndex = Math.max(0, ...targetGrades.map((grade) => gradeIndex(kidsGrades, grade)));
  const grades = kidsGrades.slice(0, maxIndex + 1);
  const { data, error } = await supabase
    .from("child_syllabus_items")
    .select("id,grade,title,category,description,sort_order")
    .in("grade", grades)
    .eq("active", true)
    .eq("exam_relevant", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })
    .returns<Array<{ id: string; grade: string | null; title: string; category: string | null; description: string | null; sort_order: number | null }>>();

  if (error) throw error;

  const rows: Array<Record<string, unknown>> = [];
  let order = 1;
  for (const grade of grades) {
    const gradeItems = (data ?? []).filter((item) => normalizeGrade(item.grade) === normalizeGrade(grade));
    for (const item of gradeItems) {
      rows.push({
        exam_event_id: eventId,
        source: "child_syllabus",
        child_syllabus_item_id: item.id,
        section: item.category || "INFANTIL",
        name: item.title,
        summary: item.description,
        grade: item.grade,
        category: item.category,
        order_index: order++
      });
    }
    if (gradeItems.length) {
      rows.push({
        exam_event_id: eventId,
        source: "cut",
        section: "CORTE",
        name: `Corte progresivo: se sienta ${grade}`,
        summary: `Los kenshis cuyo objetivo termina en ${grade} pueden finalizar aqui si el examen es progresivo.`,
        grade,
        category: "corte",
        cut_grade: grade,
        weight: 0,
        order_index: order++
      });
    }
  }
  if (rows.length) return rows;
  return buildKidsItemsFromLatestTemplate(eventId, grades);
}

async function buildKidsItemsFromLatestTemplate(eventId: string, grades: string[]) {
  const supabase = createAdminClient();
  const { data: previousEvents, error: eventsError } = await supabase
    .from("exam_events")
    .select("id")
    .in("program_type", ["kids", "kids_progressive"])
    .neq("id", eventId)
    .order("exam_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(8)
    .returns<Array<{ id: string }>>();

  if (eventsError) throw eventsError;

  const allowedGrades = new Set(grades.map(normalizeGrade));
  for (const previousEvent of previousEvents ?? []) {
    const { data: templateItems, error: itemsError } = await supabase
      .from("exam_event_items")
      .select("source,section,name,summary,grade,category,weight,order_index,cut_grade,active")
      .eq("exam_event_id", previousEvent.id)
      .eq("active", true)
      .order("order_index", { ascending: true })
      .returns<Array<{
        source: ExamEventItem["source"];
        section: string | null;
        name: string;
        summary: string | null;
        grade: string | null;
        category: string | null;
        weight: number;
        order_index: number;
        cut_grade: string | null;
        active: boolean;
      }>>();

    if (itemsError) throw itemsError;

    const copiedItems = (templateItems ?? [])
      .filter((item) => item.source === "cut" || !item.grade || allowedGrades.has(normalizeGrade(item.grade)))
      .map((item, index) => ({
        exam_event_id: eventId,
        source: item.source === "cut" ? "cut" : "manual",
        section: item.section,
        name: item.name,
        summary: item.summary,
        grade: item.grade,
        category: item.category,
        weight: item.weight,
        order_index: index + 1,
        cut_grade: item.cut_grade,
        active: item.active
      }));

    if (copiedItems.length) return copiedItems;
  }

  return [];
}

function resolveTargetGrade(memberClass: "kids" | "adults", currentGrade: string | null) {
  const grades = memberClass === "kids" ? kidsGrades : adultGrades;
  const current = normalizeGrade(currentGrade);
  if (memberClass === "kids" && current === "BLANCO") return "BLANCO-AMARILLO";
  if (memberClass === "adults" && current === "5 DAN") return "5 DAN";
  const index = grades.findIndex((grade) => normalizeGrade(grade) === current);
  if (index < 0) return grades[0];
  return grades[Math.min(index + 1, grades.length - 1)];
}

function gradeIndex(grades: string[], grade: string | null) {
  const index = grades.findIndex((item) => normalizeGrade(item) === normalizeGrade(grade));
  return index < 0 ? 0 : index;
}

function normalizeGrade(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function defaultExamTitle(programType: IntegratedExamProgram, examDate: string) {
  if (programType === "adults") return `Examen adultos ${examDate}`;
  if (programType === "kids_progressive") return `Examen infantil progresivo ${examDate}`;
  if (programType === "dan_tribunal") return `Tribunal dan ${examDate}`;
  return `Examen infantil ${examDate}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}
