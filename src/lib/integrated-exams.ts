import { randomUUID } from "node:crypto";
import {
  isReviewItemRelevantForStudent,
  buildStudentReview,
  parseReviewEnvelope,
  validateStudentDecision,
  isReviewCurrent,
  type ReviewEnvelope,
} from "@/lib/integrated-exam-review";
import { adultGrades } from "@/lib/grades";
import { registerExam } from "@/lib/exams";
import { generateDiplomaForExam } from "@/lib/diplomas";
import { generateIntegratedExamDocumentsForStudent } from "@/lib/integrated-exam-documents";
import {
  buildChildExamSnapshot,
  childExamTargetGradesWithoutScorableItems,
  normalizeChildGrade,
  progressiveTargetGradesWithoutScorableItems,
  resolveChildExamGrades,
  resolveChildExamScopeTargets,
  resolveChildExamTargetGrade,
  type ChildProgramAssignment,
} from "@/lib/child-program";
import {
  buildSelectedProgressiveExamSnapshot,
  copyExamSnapshotItems,
  validateTemplateExamItemSelection,
  type TemplateExamSnapshotItem,
} from "@/lib/integrated-exam-snapshot";
import { createAdminClient } from "@/lib/supabase/admin";

export type IntegratedExamProgram =
  "adults" | "kids_progressive" | "kids" | "dan_tribunal";

type MemberForIntegratedExam = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: string | null;
};

type ExamEvent = {
  updated_at: string;
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
  members?: {
    legacy_id: string | null;
    display_name: string;
    class: "kids" | "adults";
    grade: string | null;
  } | null;
};

type ExamEventItem = {
  id: string;
  exam_event_id: string;
  source: "technique" | "child_syllabus" | "manual" | "cut";
  technique_id?: string | null;
  child_syllabus_item_id?: string | null;
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
  access_token?: string;
  submitted_at: string | null;
  revoked_at: string | null;
};

type ExamEventScore = {
  notes: string | null;
  event_student_id: string;
  event_item_id: string;
  examiner_id: string;
  score: number | null;
  skipped: boolean;
};

type ExamEventReview = {
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  event_student_id: string;
  final_passed: boolean | null;
  final_percentage: number | null;
};

const kidsExamStages = [
  "BLANCO",
  "BLANCO-AMARILLO",
  "AMARILLO",
  "AMARILLO-NARANJA",
  "NARANJA",
  "NARANJA-VERDE",
  "VERDE",
  "VERDE-AZUL",
  "AZUL",
  "AZUL-MARRON",
  "MARRON",
  "1 DAN",
];

const kidsExamStageByGrade: Record<string, string> = {
  MINARAI: "BLANCO",
  BLANCO: "BLANCO",
  "BLANCO Y AMARILLO": "BLANCO-AMARILLO",
  "BLANCO-AMARILLO": "BLANCO-AMARILLO",
  AMARILLO: "AMARILLO",
  "AMARILLO Y NARANJA": "AMARILLO-NARANJA",
  "AMARILLO-NARANJA": "AMARILLO-NARANJA",
  "AMARILLO NARANJA": "AMARILLO-NARANJA",
  NARANJA: "NARANJA",
  "NARANJA Y VERDE": "NARANJA-VERDE",
  "NARANJA-VERDE": "NARANJA-VERDE",
  "NARANJA VERDE": "NARANJA-VERDE",
  VERDE: "VERDE",
  "VERDE Y AZUL": "VERDE-AZUL",
  "VERDE-AZUL": "VERDE-AZUL",
  "VERDE AZUL": "VERDE-AZUL",
  AZUL: "AZUL",
  "AZUL Y MARRON": "AZUL-MARRON",
  "AZUL Y MARRÓN": "AZUL-MARRON",
  "AZUL-MARRON": "AZUL-MARRON",
  "AZUL-MARRÓN": "AZUL-MARRON",
  "AZUL MARRON": "AZUL-MARRON",
  MARRON: "MARRON",
  MARRÓN: "MARRON",
  "1 DAN": "1 DAN",
};

kidsExamStageByGrade["MARRON"] = "MARRON";
kidsExamStageByGrade["MARRÓN"] = "MARRON";
kidsExamStageByGrade["1 DAN"] = "1 DAN";

export async function createIntegratedExamEvent(input: {
  title: string;
  examDate: string;
  programType: IntegratedExamProgram;
  passPercentage: number;
  memberIds: string[];
  examinerNames: string[];
  examineMyself?: boolean;
  maxKidsGrade?: string | null;
  notes?: string | null;
  templateEventId?: string | null;
  templateEventItemIds?: string[];
  childSyllabusItemIds?: string[];
}) {
  const supabase = createAdminClient();
  const memberIds = [...new Set(input.memberIds.filter(Boolean))];
  if (!memberIds.length) throw new Error("Selecciona al menos un kenshi.");
  if (!input.examDate) throw new Error("Indica fecha de examen.");
  const names = [
    ...new Set(input.examinerNames.map((name) => name.trim()).filter(Boolean)),
  ];
  if (input.examineMyself !== false && !names.includes("Alvaro Calvo"))
    names.unshift("Alvaro Calvo");
  if (!names.length) throw new Error("Selecciona al menos un examinador.");

  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id,legacy_id,display_name,class,grade,status")
    .in("id", memberIds)
    .eq("status", "active")
    .order("display_name")
    .returns<MemberForIntegratedExam[]>();

  if (membersError) throw membersError;
  if (!members?.length)
    throw new Error("No se han encontrado kenshis activos para el examen.");

  const expectedClass =
    input.programType === "adults" || input.programType === "dan_tribunal"
      ? "adults"
      : "kids";
  const filteredMembers = members.filter(
    (member) => member.class === expectedClass,
  );
  if (!filteredMembers.length)
    throw new Error(
      "Los kenshis seleccionados no coinciden con el tipo de examen.",
    );

  const scopeTargets = resolveChildExamScopeTargets(
    filteredMembers.map((member) =>
      resolveTargetGrade(member.class, member.grade),
    ),
    input.programType === "kids_progressive" ? input.maxKidsGrade : null,
  );

  const title =
    input.title.trim() || defaultExamTitle(input.programType, input.examDate);
  const { data: event, error: eventError } = await supabase
    .from("exam_events")
    .insert({
      title,
      exam_date: input.examDate,
      program_type: input.programType,
      pass_percentage: input.passPercentage || 70,
      status: "active",
      notes: input.notes ?? null,
      created_by: "WEB SKBC",
    })
    .select("id")
    .single<{ id: string }>();

  if (eventError || !event)
    throw eventError ?? new Error("No se pudo crear el examen.");

  const students = filteredMembers.map((member, index) => ({
    exam_event_id: event.id,
    member_id: member.id,
    display_order: index + 1,
    current_grade: member.grade,
    target_grade: resolveTargetGrade(member.class, member.grade),
  }));

  const { data: insertedStudents, error: studentsError } = await supabase
    .from("exam_event_students")
    .insert(students)
    .select("id,member_id,current_grade,target_grade")
    .returns<
      Array<{
        id: string;
        member_id: string;
        current_grade: string | null;
        target_grade: string | null;
      }>
    >();

  if (studentsError) throw studentsError;

  let items;
  try {
    items = input.templateEventId
      ? await copyExamItems(
          input.templateEventId,
          event.id,
          input.programType,
          input.templateEventItemIds ?? [],
          input.programType === "kids_progressive"
            ? scopeTargets
            : (students
                .map((student) => student.target_grade)
                .filter(Boolean) as string[]),
        )
      : await buildExamItems(
          event.id,
          input.programType,
          input.programType === "kids_progressive"
            ? scopeTargets
            : (students
                .map((student) => student.target_grade)
                .filter(Boolean) as string[]),
          input.childSyllabusItemIds,
        );
  } catch (error) {
    await supabase.from("exam_events").delete().eq("id", event.id);
    throw error;
  }
  if (input.programType === "kids_progressive") {
    const targetGrades = students
      .map((student) => student.target_grade)
      .filter(Boolean) as string[];
    const uncoveredTargetGrades = progressiveTargetGradesWithoutScorableItems(
      items.map((item) => ({
        grade: typeof item.grade === "string" ? item.grade : null,
        scorable:
          item.source !== "cut" &&
          (!("active" in item) || item.active !== false),
      })),
      targetGrades,
    );
    if (uncoveredTargetGrades.length) {
      await supabase.from("exam_events").delete().eq("id", event.id);
      throw new Error(
        `Los grados objetivo ${uncoveredTargetGrades.join(", ")} no tienen contenido evaluable seleccionado.`,
      );
    }
  }
  if (!items.length) {
    await supabase.from("exam_events").delete().eq("id", event.id);
    throw new Error(
      input.programType === "kids" || input.programType === "kids_progressive"
        ? "No hay temario infantil activo ni un examen infantil anterior que pueda usarse como plantilla."
        : "No hay temario disponible para crear este examen.",
    );
  }

  const { error: itemsError } = await supabase
    .from("exam_event_items")
    .insert(items);
  if (itemsError) {
    await supabase.from("exam_events").delete().eq("id", event.id);
    throw itemsError;
  }

  const { data: assigned, error: examinersError } = await supabase
    .from("exam_event_examiners")
    .insert(names.map((name) => ({ exam_event_id: event.id, name })))
    .select("id,name");
  if (examinersError) throw examinersError;
  await refreshIntegratedExamReview(event.id);
  return {
    eventId: event.id,
    ownExaminerId:
      input.examineMyself !== false
        ? assigned?.find((row) => row.name === "Alvaro Calvo")?.id
        : undefined,
    studentCount: insertedStudents?.length ?? students.length,
    itemCount: items.length,
  };
}

async function copyExamItems(
  templateEventId: string,
  eventId: string,
  programType: IntegratedExamProgram,
  selectedItemIds: string[],
  targetGrades: string[],
) {
  const supabase = createAdminClient();
  const { data: template, error: templateError } = await supabase
    .from("exam_events")
    .select("id,program_type")
    .eq("id", templateEventId)
    .maybeSingle<{ id: string; program_type: IntegratedExamProgram }>();

  if (templateError) throw templateError;
  if (!template)
    throw new Error("El examen usado como plantilla ya no existe.");
  if (template.program_type !== programType)
    throw new Error(
      "El tipo de examen no coincide con la plantilla seleccionada.",
    );

  const { data: templateItems, error: itemsError } = await supabase
    .from("exam_event_items")
    .select(
      "id,exam_event_id,source,technique_id,child_syllabus_item_id,section,name,summary,grade,category,weight,order_index,cut_grade,active",
    )
    .eq("exam_event_id", templateEventId)
    .order("order_index");

  if (itemsError) throw itemsError;
  if (programType === "kids_progressive") {
    validateTemplateExamItemSelection(
      (templateItems ?? []) as TemplateExamSnapshotItem[],
      selectedItemIds,
    );
    return buildSelectedProgressiveExamSnapshot(
      (templateItems ?? []) as TemplateExamSnapshotItem[],
      selectedItemIds,
      eventId,
      targetGrades,
    );
  }
  return copyExamSnapshotItems(
    (templateItems ?? []).map(
      ({ id: _id, exam_event_id: _examEventId, ...item }) => item,
    ),
    eventId,
  );
}

export async function getIntegratedExamDuplicationTemplate(eventId: string) {
  const supabase = createAdminClient();
  const { data: event, error: eventError } = await supabase
    .from("exam_events")
    .select("id,title,program_type,pass_percentage,notes")
    .eq("id", eventId)
    .maybeSingle<
      Pick<
        ExamEvent,
        "id" | "title" | "program_type" | "pass_percentage" | "notes"
      >
    >();

  if (eventError || !event) return null;

  const [
    { data: students, error: studentsError },
    { data: examiners, error: examinersError },
    { data: items, error: itemsError },
  ] = await Promise.all([
    supabase
      .from("exam_event_students")
      .select("member_id")
      .eq("exam_event_id", eventId)
      .order("display_order")
      .returns<Array<{ member_id: string }>>(),
    supabase
      .from("exam_event_examiners")
      .select("name")
      .eq("exam_event_id", eventId)
      .order("created_at")
      .returns<Array<{ name: string }>>(),
    supabase
      .from("exam_event_items")
      .select(
        "id,exam_event_id,source,technique_id,child_syllabus_item_id,section,name,summary,grade,category,weight,order_index,cut_grade,active",
      )
      .eq("exam_event_id", eventId)
      .eq("active", true)
      .neq("source", "cut")
      .gt("weight", 0)
      .order("order_index")
      .returns<TemplateExamSnapshotItem[]>(),
  ]);

  if (studentsError || examinersError || itemsError)
    throw studentsError ?? examinersError ?? itemsError;
  return {
    ...event,
    memberIds: (students ?? []).map((student) => student.member_id),
    examinerNames: (examiners ?? []).map((examiner) => examiner.name),
    items: items ?? [],
  };
}

export async function getIntegratedExamAdmin(eventId: string) {
  const supabase = createAdminClient();
  const { data: event, error: eventError } = await supabase
    .from("exam_events")
    .select(
      "id,title,exam_date,program_type,pass_percentage,status,notes,updated_at",
    )
    .eq("id", eventId)
    .single<ExamEvent>();
  if (eventError || !event)
    throw eventError ?? new Error("Examen no encontrado.");

  const [
    { data: students, error: studentsError },
    { data: items, error: itemsError },
    { data: examiners, error: examinersError },
    { data: scores, error: scoresError },
    { data: reviews, error: reviewsError },
  ] = await Promise.all([
    supabase
      .from("exam_event_students")
      .select(
        "id,exam_event_id,member_id,display_order,current_grade,target_grade,final_percentage,final_passed,members(legacy_id,display_name,class,grade)",
      )
      .eq("exam_event_id", eventId)
      .order("display_order")
      .returns<ExamEventStudent[]>(),
    supabase
      .from("exam_event_items")
      .select(
        "id,exam_event_id,source,section,name,summary,grade,category,weight,order_index,cut_grade,active",
      )
      .eq("exam_event_id", eventId)
      .order("order_index")
      .returns<ExamEventItem[]>(),
    supabase
      .from("exam_event_examiners")
      .select(
        "id,exam_event_id,name,email,access_token,submitted_at,revoked_at",
      )
      .eq("exam_event_id", eventId)
      .order("created_at")
      .returns<ExamEventExaminer[]>(),
    supabase
      .from("exam_event_scores")
      .select("event_student_id,event_item_id,examiner_id,score,skipped,notes")
      .eq("exam_event_id", eventId)
      .returns<ExamEventScore[]>(),
    supabase
      .from("exam_event_reviews")
      .select(
        "event_student_id,final_passed,final_percentage,review_notes,reviewed_at,reviewed_by",
      )
      .eq("exam_event_id", eventId)
      .returns<ExamEventReview[]>(),
  ]);

  if (
    studentsError ||
    itemsError ||
    examinersError ||
    scoresError ||
    reviewsError
  )
    throw (
      studentsError ??
      itemsError ??
      examinersError ??
      scoresError ??
      reviewsError
    );
  const validIds = new Set(
    (examiners ?? [])
      .filter((row) => row.submitted_at && !row.revoked_at)
      .map((row) => row.id),
  );
  const validScores = (scores ?? []).filter((row) =>
    validIds.has(row.examiner_id),
  );
  const summaries = (students ?? []).map((student) => {
    const review = parseReviewEnvelope(
      (reviews ?? []).find((row) => row.event_student_id === student.id)
        ?.review_notes ?? null,
    );
    const summary = buildStudentReview({
      studentId: student.id,
      items: (items ?? []).filter(
        (item) =>
          item.active &&
          item.source !== "cut" &&
          Number(item.weight) > 0 &&
          isExamItemRelevantForStudent(event.program_type, student, item),
      ),
      scores: validScores.filter((row) => row.event_student_id === student.id),
      adjustments: review.adjustments,
      passPercentage: event.pass_percentage,
    });
    return {
      ...summary,
      studentId: student.id,
      memberId: student.member_id,
      passed: review.decision === "pass",
      review,
    };
  });
  return {
    event,
    students: students ?? [],
    items: items ?? [],
    examiners: examiners ?? [],
    scores: validScores,
    reviews: reviews ?? [],
    summaries,
  };
}

export async function getRecentIntegratedExamEvents(limit = 12) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("exam_events")
    .select(
      "id,title,exam_date,program_type,status,pass_percentage,exam_event_students(id),exam_event_examiners(id,submitted_at)",
    )
    .order("exam_date", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as Array<
    ExamEvent & {
      exam_event_students?: Array<{ id: string }>;
      exam_event_examiners?: Array<{ id: string; submitted_at: string | null }>;
    }
  >;
}

export async function deleteIntegratedExamEvent(eventId: string) {
  const data = await getIntegratedExamAdmin(eventId);
  return withEventMutationLock(data.event, async () => {
    if (
      data.summaries.some(
        (row) => row.review.registeredAt || row.review.registeredExamId,
      )
    )
      throw new Error("Este examen contiene resultados registrados.");
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("exam_events")
      .delete()
      .eq("id", eventId);

    if (error) throw error;
  });
}

export async function updateIntegratedExamItem(input: {
  itemId: string;
  active: boolean;
  grade?: string | null;
  section?: string | null;
  name?: string | null;
  summary?: string | null;
  weight?: number | null;
  orderIndex?: number | null;
}) {
  const supabase = createAdminClient();
  const { data: item, error: itemError } = await supabase
    .from("exam_event_items")
    .select("exam_event_id")
    .eq("id", input.itemId)
    .single<{ exam_event_id: string }>();
  if (itemError || !item)
    throw itemError ?? new Error("Item de examen no encontrado.");

  const event = (await getIntegratedExamAdmin(item.exam_event_id)).event;
  return withEventMutationLock(event, async () => {
    const update: Record<string, unknown> = {
      active: input.active,
    };
    if (input.grade !== undefined) update.grade = input.grade || null;
    if (input.section !== undefined) update.section = input.section || null;
    const name = input.name?.trim();
    if (input.name !== undefined && name) update.name = name;
    if (input.summary !== undefined) update.summary = input.summary || null;
    if (input.weight !== undefined && input.weight !== null)
      update.weight = Number.isFinite(input.weight) ? input.weight : 1;
    if (input.orderIndex !== undefined && input.orderIndex !== null)
      update.order_index = Number.isFinite(input.orderIndex)
        ? input.orderIndex
        : 0;

    const { error } = await supabase
      .from("exam_event_items")
      .update(update)
      .eq("id", input.itemId);
    if (error) throw error;

    await refreshIntegratedExamReview(item.exam_event_id);
    return item.exam_event_id;
  });
}

export async function createIntegratedExamItem(input: {
  eventId: string;
  grade?: string | null;
  section?: string | null;
  name: string;
  summary?: string | null;
  category?: string | null;
  weight?: number | null;
}) {
  const supabase = createAdminClient();
  const event = (await getIntegratedExamAdmin(input.eventId)).event;
  return withEventMutationLock(event, async () => {
    const name = input.name.trim();
    if (!name) throw new Error("Indica el nombre del punto de examen.");

    const { data: lastItem, error: lastError } = await supabase
      .from("exam_event_items")
      .select("order_index")
      .eq("exam_event_id", input.eventId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle<{ order_index: number | null }>();
    if (lastError) throw lastError;

    const { error } = await supabase.from("exam_event_items").insert({
      exam_event_id: input.eventId,
      source: "manual",
      section: input.section || input.category || "MANUAL",
      name,
      summary: input.summary || null,
      grade: input.grade || null,
      category: input.category || input.section || "manual",
      weight: Number.isFinite(input.weight ?? 1) ? (input.weight ?? 1) : 1,
      order_index: Number(lastItem?.order_index ?? 0) + 1,
      active: true,
    });
    if (error) throw error;

    await refreshIntegratedExamReview(input.eventId);
  });
}

export async function deleteIntegratedExamItem(itemId: string) {
  const supabase = createAdminClient();
  const { data: item, error: itemError } = await supabase
    .from("exam_event_items")
    .select("exam_event_id")
    .eq("id", itemId)
    .single<{ exam_event_id: string }>();
  if (itemError || !item)
    throw itemError ?? new Error("Item de examen no encontrado.");

  const event = (await getIntegratedExamAdmin(item.exam_event_id)).event;
  return withEventMutationLock(event, async () => {
    const { error } = await supabase
      .from("exam_event_items")
      .delete()
      .eq("id", itemId);
    if (error) throw error;

    await refreshIntegratedExamReview(item.exam_event_id);
    return item.exam_event_id;
  });
}

export async function getExaminerExamByToken(token: string) {
  const supabase = createAdminClient();
  const { data: examiner, error: examinerError } = await supabase
    .from("exam_event_examiners")
    .select(
      "id,exam_event_id,name,email,access_token,submitted_at,revoked_at,exam_events(id,title,exam_date,program_type,pass_percentage,status,notes,updated_at)",
    )
    .eq("access_token", token)
    .maybeSingle<any>();

  if (examinerError) throw examinerError;
  if (!examiner || examiner.revoked_at)
    throw new Error("Enlace de examen no valido.");

  const event = examiner.exam_events as ExamEvent | null;
  if (!event) throw new Error("Examen no encontrado.");

  const [
    { data: students, error: studentsError },
    { data: items, error: itemsError },
    { data: existingScores, error: scoresError },
  ] = await Promise.all([
    supabase
      .from("exam_event_students")
      .select(
        "id,member_id,display_order,current_grade,target_grade,members(legacy_id,display_name,class,grade)",
      )
      .eq("exam_event_id", examiner.exam_event_id)
      .order("display_order")
      .returns<ExamEventStudent[]>(),
    supabase
      .from("exam_event_items")
      .select(
        "id,source,section,name,summary,grade,category,weight,order_index,cut_grade,active",
      )
      .eq("exam_event_id", examiner.exam_event_id)
      .eq("active", true)
      .order("order_index")
      .returns<ExamEventItem[]>(),
    supabase
      .from("exam_event_scores")
      .select("event_student_id,event_item_id,score,skipped,notes")
      .eq("exam_event_id", examiner.exam_event_id)
      .eq("examiner_id", examiner.id)
      .returns<
        Array<{
          event_student_id: string;
          event_item_id: string;
          score: number | null;
          skipped: boolean;
          notes: string | null;
        }>
      >(),
  ]);

  if (studentsError || itemsError || scoresError)
    throw studentsError ?? itemsError ?? scoresError;
  return {
    examiner: examiner as ExamEventExaminer,
    event,
    students: students ?? [],
    items: items ?? [],
    existingScores: existingScores ?? [],
  };
}

const FINALIZATION_LEASE_MS = 15 * 60 * 1000;
function assertEditable(event: ExamEvent) {
  if (["completed", "archived"].includes(event.status))
    throw new Error("Este examen ya esta cerrado.");
  if (
    event.status === "review" &&
    Date.now() - Date.parse(event.updated_at) < FINALIZATION_LEASE_MS
  )
    throw new Error(
      "El examen esta registrando resultados; reintenta el registro para recuperar el proceso.",
    );
}
async function withEventMutationLock<T>(
  event: ExamEvent,
  mutate: () => Promise<T>,
): Promise<T> {
  assertEditable(event);
  const supabase = createAdminClient();
  const lease = new Date(
    Math.max(Date.now(), Date.parse(event.updated_at) + 1),
  ).toISOString();
  const { data: locked, error } = await supabase
    .from("exam_events")
    .update({ status: "review", updated_at: lease })
    .eq("id", event.id)
    .eq("status", event.status)
    .eq("updated_at", event.updated_at)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!locked)
    throw new Error(
      "El examen ha cambiado o hay otra operacion en curso. Recarga y reintenta.",
    );
  try {
    return await mutate();
  } finally {
    const { error: releaseError } = await supabase
      .from("exam_events")
      .update({
        status: "active",
        updated_at: new Date(
          Math.max(Date.now(), Date.parse(lease) + 1),
        ).toISOString(),
      })
      .eq("id", event.id)
      .eq("status", "review")
      .eq("updated_at", lease);
    if (releaseError) throw releaseError;
  }
}
export async function getInternalExamEvaluation(
  eventId: string,
  examinerId: string,
) {
  const payload = await getIntegratedExamAdmin(eventId);
  const examiner = payload.examiners.find(
    (row) => row.id === examinerId && !row.revoked_at,
  );
  if (!examiner)
    throw new Error("Selecciona una asignacion valida de este examen.");
  const data = await getExaminerExamByToken(examiner.access_token!);
  const { access_token: _token, ...safeExaminer } = data.examiner;
  return { ...data, examiner: safeExaminer };
}
export async function submitInternalIntegratedExamScores(input: {
  eventId: string;
  examinerId: string;
  scores: ScoreInput[];
}) {
  const payload = await getIntegratedExamAdmin(input.eventId);
  const examiner = payload.examiners.find(
    (row) => row.id === input.examinerId && !row.revoked_at,
  );
  if (!examiner) throw new Error("Examinador no valido para este examen.");
  await submitIntegratedExamScores({
    token: examiner.access_token!,
    scores: input.scores,
  });
}
export type ScoreInput = {
  eventStudentId: string;
  eventItemId: string;
  score: number | null;
  skipped: boolean;
  notes?: string;
};
export async function submitIntegratedExamScores(input: {
  token: string;
  scores: ScoreInput[];
}) {
  const payload = await getExaminerExamByToken(input.token);
  return withEventMutationLock(payload.event, async () => {
    if (payload.examiner.submitted_at || payload.examiner.revoked_at)
      throw new Error("Esta evaluacion ya fue enviada o revocada.");
    const expected = new Set(
      payload.students.flatMap((student) =>
        payload.items
          .filter(
            (item) =>
              item.active &&
              item.source !== "cut" &&
              Number(item.weight) > 0 &&
              isExamItemRelevantForStudent(
                payload.event.program_type,
                student,
                item,
              ),
          )
          .map((item) => student.id + ":" + item.id),
      ),
    );
    const seen = new Set<string>();
    for (const row of input.scores) {
      const key = row.eventStudentId + ":" + row.eventItemId;
      if (!expected.has(key) || seen.has(key))
        throw new Error("Puntuacion duplicada o ajena al temario del alumno.");
      if (
        !row.skipped &&
        (row.score === null ||
          !Number.isFinite(row.score) ||
          row.score < 0 ||
          row.score > 10)
      )
        throw new Error("Las notas deben estar entre 0 y 10.");
      if (!row.skipped && ![0, 5, 10].includes(row.score!))
        throw new Error("Las valoraciones del examen son 0, 5 o 10. Usa Omitir si no se ha evaluado.");
      if ((row.notes?.length ?? 0) > 4000)
        throw new Error("Observacion demasiado larga.");
      seen.add(key);
    }
    if (!expected.size || seen.size !== expected.size)
      throw new Error("Completa todos los puntos con una nota o No evaluado.");
    const supabase = createAdminClient();
    // Claim submission first: competing requests cannot overwrite an accepted evaluation.
    const now = new Date().toISOString();
    const { data: claim, error: claimError } = await supabase
      .from("exam_event_examiners")
      .update({ submitted_at: now })
      .eq("id", payload.examiner.id)
      .is("submitted_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claim) throw new Error("Esta evaluacion ya fue enviada.");
    const { error } = await supabase.from("exam_event_scores").upsert(
      input.scores.map((row) => ({
        exam_event_id: payload.event.id,
        event_student_id: row.eventStudentId,
        event_item_id: row.eventItemId,
        examiner_id: payload.examiner.id,
        score: row.skipped ? null : row.score,
        skipped: row.skipped,
        notes: row.notes?.trim() || null,
        updated_at: now,
      })),
      { onConflict: "event_student_id,event_item_id,examiner_id" },
    );
    if (error) {
      await supabase
        .from("exam_event_examiners")
        .update({ submitted_at: null })
        .eq("id", payload.examiner.id)
        .eq("submitted_at", now);
      throw error;
    }
    await refreshIntegratedExamReview(payload.event.id);
  });
}
async function writeReview(
  eventId: string,
  studentId: string,
  review: ReviewEnvelope,
  percentage: number,
  by: string,
) {
  const { error } = await createAdminClient()
    .from("exam_event_reviews")
    .upsert(
      {
        exam_event_id: eventId,
        event_student_id: studentId,
        review_notes: JSON.stringify(review),
        final_percentage: percentage,
        final_passed:
          review.decision === null ? null : review.decision === "pass",
        reviewed_by: by,
        reviewed_at: review.decision ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "exam_event_id,event_student_id" },
    );
  if (error) throw error;
}
export async function saveIntegratedExamStudentReview(
  input: {
    eventId: string;
    studentId: string;
    adjustments: ReviewEnvelope["adjustments"];
    decision: ReviewEnvelope["decision"];
    conclusion: string;
    sourceSignature: string;
  },
  by = "WEB SKBC",
) {
  const data = await getIntegratedExamAdmin(input.eventId);
  return withEventMutationLock(data.event, async () => {
    const old = data.summaries.find((row) => row.studentId === input.studentId);
    if (!old) throw new Error("Alumno ajeno al examen.");
    if (old.review.registeredAt || old.review.registeredExamId)
      throw new Error("El resultado de este alumno ya esta registrado.");
    if (
      input.decision !== null &&
      input.decision !== "pass" &&
      input.decision !== "fail"
    )
      throw new Error("Decision no valida.");
    if (input.conclusion.length > 12000)
      throw new Error("Conclusion demasiado larga.");
    for (const [id, adjustment] of Object.entries(input.adjustments)) {
      if (
        !old.items.some((item) => item.id === id) ||
        !Number.isFinite(adjustment.score) ||
        adjustment.score < 0 ||
        adjustment.score > 10 ||
        typeof adjustment.notes !== "string" ||
        adjustment.notes.length > 4000
      )
        throw new Error("Ajuste no valido para este alumno.");
    }
    const summary = buildStudentReview({
      studentId: input.studentId,
      items: old.items,
      scores: data.scores.filter(
        (row) => row.event_student_id === input.studentId,
      ),
      adjustments: input.adjustments,
      passPercentage: data.event.pass_percentage,
    });
    if (input.sourceSignature !== summary.sourceSignature)
      throw new Error(
        "Las evaluaciones han cambiado. Recarga y confirma la revision.",
      );
    const review: ReviewEnvelope = {
      version: 1,
      adjustments: input.adjustments,
      decision: input.decision,
      conclusion: input.conclusion.trim(),
      sourceSignature: summary.sourceSignature,
    };
    const errors = validateStudentDecision(review, summary);
    if (errors.length) throw new Error(errors.join(" "));
    await writeReview(
      input.eventId,
      input.studentId,
      review,
      summary.percentage,
      by,
    );
  });
}
async function generateStudentDocuments(
  previousData: Awaited<ReturnType<typeof getIntegratedExamAdmin>>,
  studentId: string,
  by: string,
) {
  // Refresh checkpoints before claiming so retries never overwrite a newer URL.
  const data = await getIntegratedExamAdmin(previousData.event.id);
  const student = data.students.find((row) => row.id === studentId);
  const summary = data.summaries.find((row) => row.studentId === studentId);
  const raw = data.reviews.find(
    (row) => row.event_student_id === studentId,
  )?.review_notes;
  if (!student || !summary || !raw || !summary.review.registeredAt)
    throw new Error("El resultado aun no esta registrado.");
  const review = { ...summary.review };
  const busy =
    "Los documentos de este alumno se estan generando. Espera antes de reintentarlo.";
  if (
    review.documentLeaseUntil &&
    Date.parse(review.documentLeaseUntil) > Date.now()
  )
    return [busy];
  review.documentLeaseId = randomUUID();
  review.documentLeaseUntil = new Date(
    Date.now() + FINALIZATION_LEASE_MS,
  ).toISOString();
  const supabase = createAdminClient();
  let expected = JSON.stringify(review);
  const { data: claimed, error: claimError } = await supabase
    .from("exam_event_reviews")
    .update({ review_notes: expected, updated_at: new Date().toISOString() })
    .eq("exam_event_id", data.event.id)
    .eq("event_student_id", studentId)
    .eq("review_notes", raw)
    .select("event_student_id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return [busy];
  async function checkpoint() {
    const next = JSON.stringify(review);
    const { data: saved, error } = await supabase
      .from("exam_event_reviews")
      .update({ review_notes: next, updated_at: new Date().toISOString() })
      .eq("exam_event_id", data.event.id)
      .eq("event_student_id", studentId)
      .eq("review_notes", expected)
      .select("event_student_id")
      .maybeSingle();
    if (error) throw error;
    if (!saved)
      throw new Error(
        "Se ha perdido el bloqueo de los documentos. Recarga el examen.",
      );
    expected = next;
  }
  const errors: string[] = [];
  try {
    if (!review.reportUrl) {
      try {
        review.reportUrl = await generateIntegratedExamDocumentsForStudent({
          examId: review.registeredExamId,
          event: data.event,
          student,
          items: data.items,
          examiners: data.examiners.filter(
            (row) => row.submitted_at && !row.revoked_at,
          ),
          scores: data.scores,
          summary,
          review,
          createdBy: by,
        });
      } catch (error) {
        errors.push("Informe: " + errorMessage(error));
      }
      await checkpoint();
    }
    if (
      review.decision === "pass" &&
      review.registeredExamId &&
      !review.diplomaUrl
    ) {
      try {
        review.diplomaUrl = await generateDiplomaForExam(
          review.registeredExamId,
        );
      } catch (error) {
        errors.push("Diploma: " + errorMessage(error));
      }
      await checkpoint();
    }
  } finally {
    review.documentErrors = errors;
    delete review.documentLeaseId;
    delete review.documentLeaseUntil;
    await checkpoint();
  }
  return errors;
}
export async function retryIntegratedExamDocuments(
  eventId: string,
  studentId: string,
  by = "WEB SKBC",
) {
  const data = await getIntegratedExamAdmin(eventId);
  if (data.event.status !== "completed")
    throw new Error("El resultado aun no esta registrado.");
  const selected = data.summaries.filter(
    (row) =>
      (!studentId || row.studentId === studentId) && row.review.registeredAt,
  );
  if (studentId && !selected.length)
    throw new Error("Alumno no registrado en este examen.");
  const errors: string[] = [];
  for (const summary of selected)
    errors.push(
      ...(await generateStudentDocuments(data, summary.studentId, by)),
    );
  return errors;
}
export async function finalizeIntegratedExamEvent(
  eventId: string,
  finalizedBy = "WEB SKBC",
) {
  const supabase = createAdminClient();
  let data = await getIntegratedExamAdmin(eventId);
  const { event } = data;
  if (["completed", "archived"].includes(event.status))
    throw new Error("Este examen ya esta cerrado.");
  if (
    event.status === "review" &&
    Date.now() - Date.parse(event.updated_at) < FINALIZATION_LEASE_MS
  )
    throw new Error(
      "Otro registro esta en curso. Espera antes de reintentarlo.",
    );
  const active = data.examiners.filter((row) => !row.revoked_at);
  if (!active.length || active.some((row) => !row.submitted_at))
    throw new Error(
      "Todos los examinadores activos deben enviar su evaluacion.",
    );
  if (
    !data.students.length ||
    data.summaries.some(
      (row) =>
        !isReviewCurrent(row.review, row) ||
        validateStudentDecision(row.review, row).length ||
        !row.review.decision,
    )
  )
    throw new Error("Confirma una decision actual para cada alumno.");
  if (
    data.students.some(
      (student) =>
        data.summaries.find((row) => row.studentId === student.id)?.review
          .decision === "pass" && !student.target_grade?.trim(),
    )
  )
    throw new Error("Falta el grado objetivo de un aprobado.");
  let lease = new Date().toISOString();
  const { data: locked, error: lockError } = await supabase
    .from("exam_events")
    .update({ status: "review", updated_at: lease })
    .eq("id", eventId)
    .eq("status", event.status)
    .eq("updated_at", event.updated_at)
    .select("id")
    .maybeSingle();
  if (lockError) throw lockError;
  if (!locked) throw new Error("El examen ha cambiado; vuelve a cargarlo.");
  try {
    // Reload after the lock so edits accepted immediately before it cannot use stale decisions.
    data = await getIntegratedExamAdmin(eventId);
    if (
      data.examiners
        .filter((row) => !row.revoked_at)
        .some((row) => !row.submitted_at) ||
      data.summaries.some(
        (row) =>
          !isReviewCurrent(row.review, row) ||
          !row.review.decision ||
          validateStudentDecision(row.review, row).length,
      )
    )
      throw new Error(
        "Las evaluaciones han cambiado. Confirma las revisiones.",
      );
    for (const student of data.students) {
      const summary = data.summaries.find(
        (row) => row.studentId === student.id,
      )!;
      const review = summary.review;
      if (!review.registeredAt) {
        if (review.decision === "pass" && !review.registeredExamId) {
          const result = await registerExam({
            memberId: student.member_id,
            examDate: event.exam_date,
            grade: student.target_grade!,
            examiner: active.map((row) => row.name).join(", "),
            registeredBy: finalizedBy,
          });
          review.registeredExamId = result.examId;
          await writeReview(
            eventId,
            student.id,
            review,
            summary.percentage,
            finalizedBy,
          );
        }
        review.registeredAt = new Date().toISOString();
        await writeReview(
          eventId,
          student.id,
          review,
          summary.percentage,
          finalizedBy,
        );
      }
      const { error: studentError } = await supabase
        .from("exam_event_students")
        .update({
          final_percentage: summary.percentage,
          final_passed: review.decision === "pass",
          updated_at: new Date().toISOString(),
        })
        .eq("id", student.id)
        .eq("exam_event_id", eventId);
      if (studentError) throw studentError;
      const nextLease = new Date().toISOString();
      const { data: renewed, error: renewError } = await supabase
        .from("exam_events")
        .update({ updated_at: nextLease })
        .eq("id", eventId)
        .eq("updated_at", lease)
        .eq("status", "review")
        .select("id")
        .maybeSingle();
      if (renewError) throw renewError;
      if (!renewed) throw new Error("Se ha perdido el bloqueo del registro.");
      lease = nextLease;
    }
    const { error: doneError } = await supabase
      .from("exam_events")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .eq("updated_at", lease);
    if (doneError) throw doneError;
  } catch (error) {
    await supabase
      .from("exam_events")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", eventId)
      .eq("updated_at", lease)
      .eq("status", "review");
    throw error;
  }
  const documentErrors: string[] = [];
  for (const student of data.students)
    documentErrors.push(
      ...(await generateStudentDocuments(data, student.id, finalizedBy)),
    );
  return {
    registeredCount: data.summaries.filter((row) => row.review.registeredExamId)
      .length,
    documentErrorCount: documentErrors.length,
    passedCount: data.summaries.filter((row) => row.review.decision === "pass")
      .length,
    studentCount: data.students.length,
  };
}
export async function refreshIntegratedExamReview(eventId: string) {
  // Refresh calculated percentages only. Human decisions, adjustments and checkpoints are immutable here.
  const data = await getIntegratedExamAdmin(eventId);
  if (["completed", "archived"].includes(data.event.status)) return;
  for (const summary of data.summaries) {
    const existing = data.reviews.find(
      (row) => row.event_student_id === summary.studentId,
    );
    const query = createAdminClient().from("exam_event_reviews");
    const result = existing
      ? await query
          .update({
            base_percentage: summary.basePercentage,
            updated_at: new Date().toISOString(),
          })
          .eq("exam_event_id", eventId)
          .eq("event_student_id", summary.studentId)
      : await query.insert({
          exam_event_id: eventId,
          event_student_id: summary.studentId,
          base_percentage: summary.basePercentage,
          final_percentage: null,
          final_passed: null,
        });
    if (result.error) throw result.error;
  }
}

export function isExamItemRelevantForStudent(
  programType: IntegratedExamProgram,
  student: Pick<ExamEventStudent, "target_grade">,
  item: Pick<ExamEventItem, "grade">,
) {
  return isReviewItemRelevantForStudent(programType, student, item);
}

export function isKidsProgressiveCutForStudent(
  student: Pick<ExamEventStudent, "target_grade">,
  item: Pick<ExamEventItem, "grade" | "cut_grade">,
) {
  return (
    kidsGradeIndex(student.target_grade) ===
    kidsGradeIndex(item.cut_grade ?? item.grade)
  );
}

function isItemRelevantForStudent(
  programType: IntegratedExamProgram,
  student: ExamEventStudent,
  item: ExamEventItem,
) {
  return isExamItemRelevantForStudent(programType, student, item);
}

async function buildExamItems(
  eventId: string,
  programType: IntegratedExamProgram,
  targetGrades: string[],
  childSyllabusItemIds?: string[],
) {
  if (programType === "adults" || programType === "dan_tribunal") {
    return buildAdultItems(eventId, targetGrades);
  }
  if (programType === "kids_progressive") {
    const assignments = await loadApprovedChildExamAssignments(
      childSyllabusItemIds ?? [],
      targetGrades,
    );
    return buildSelectedKidsItems(eventId, assignments, targetGrades);
  }
  return buildKidsItems(eventId, targetGrades);
}

async function loadApprovedChildExamAssignments(
  selectedIds: string[],
  targetGrades: string[],
): Promise<ChildProgramAssignment[]> {
  const ids = selectedIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length)
    throw new Error("Selecciona al menos un contenido del temario infantil.");
  if (new Set(ids).size !== ids.length)
    throw new Error(
      "El temario infantil seleccionado contiene elementos duplicados.",
    );

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("child_syllabus_items")
    .select(
      "id,content_id,grade,title,category,description,active,exam_relevant,sort_order",
    )
    .in("id", ids)
    .returns<
      Array<{
        id: string;
        content_id: string;
        grade: string;
        title: string;
        category: string;
        description: string | null;
        active: boolean;
        exam_relevant: boolean;
        sort_order: number;
      }>
    >();
  if (error) throw error;

  const rows = data ?? [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const approved = ids.map((id) => byId.get(id));
  if (approved.some((row) => !row))
    throw new Error("Parte del temario infantil seleccionado ya no existe.");

  const contentIds = [...new Set(rows.map((row) => row.content_id))];
  const { data: activeContents, error: contentsError } = await supabase
    .from("child_syllabus_contents")
    .select("id")
    .in("id", contentIds)
    .is("archived_at", null)
    .returns<Array<{ id: string }>>();
  if (contentsError) throw contentsError;

  const activeContentIds = new Set(
    (activeContents ?? []).map((content) => content.id),
  );
  const allowedGrades = new Set<string>(resolveChildExamGrades(targetGrades));
  if (
    approved.some(
      (row) => !row?.active || !activeContentIds.has(row.content_id),
    )
  ) {
    throw new Error(
      "Parte del temario infantil seleccionado esta inactivo o archivado.",
    );
  }
  if (
    approved.some((row) => !allowedGrades.has(normalizeChildGrade(row?.grade)))
  ) {
    throw new Error(
      "Parte del temario infantil seleccionado no corresponde a los grados objetivo.",
    );
  }
  const assignments = approved.map((row) => ({
    id: row!.id,
    contentId: row!.content_id,
    grade: normalizeChildGrade(row!.grade),
    title: row!.title,
    category: row!.category,
    description: row!.description,
    active: row!.active,
    examRelevant: row!.exam_relevant,
    sortOrder: row!.sort_order,
  }));
  const uncoveredTargetGrades = childExamTargetGradesWithoutScorableItems(
    assignments,
    targetGrades,
  );
  if (uncoveredTargetGrades.length) {
    throw new Error(
      `Los grados objetivo ${uncoveredTargetGrades.join(", ")} no tienen contenido evaluable seleccionado.`,
    );
  }
  return assignments;
}

function buildSelectedKidsItems(
  eventId: string,
  assignments: ChildProgramAssignment[],
  targetGrades: string[],
) {
  return buildChildExamSnapshot(assignments, targetGrades).map((row, index) =>
    row.source === "child_syllabus"
      ? {
          exam_event_id: eventId,
          source: row.source,
          child_syllabus_item_id: row.childSyllabusItemId,
          section: row.category || "INFANTIL",
          name: row.title,
          summary: row.description,
          grade: row.grade,
          category: row.category,
          weight: 1,
          order_index: index + 1,
        }
      : {
          exam_event_id: eventId,
          source: row.source,
          section: "CORTE",
          name: `Corte progresivo: se sienta ${row.grade}`,
          summary: `Los kenshis cuyo objetivo termina en ${row.grade} pueden finalizar aqui si el examen es progresivo.`,
          grade: row.grade,
          category: "corte",
          cut_grade: row.cutGrade,
          weight: 0,
          order_index: index + 1,
        },
  );
}

async function buildAdultItems(eventId: string, targetGrades: string[]) {
  const supabase = createAdminClient();
  const grades = [...new Set(targetGrades.filter(Boolean))];
  const { data, error } = await supabase
    .from("techniques")
    .select(
      "id,grade,name,category,content_type,summary_es,curriculum_order,program_order",
    )
    .in("grade", grades)
    .eq("active", true)
    .order("curriculum_order", { ascending: true })
    .order("program_order", { ascending: true })
    .order("name", { ascending: true })
    .returns<
      Array<{
        id: string;
        grade: string | null;
        name: string;
        category: string | null;
        content_type: string | null;
        summary_es: string | null;
        curriculum_order: number | null;
        program_order: number | null;
      }>
    >();

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
    weight: 1,
    order_index: index + 1,
  }));
}

async function buildKidsItems(eventId: string, targetGrades: string[]) {
  const supabase = createAdminClient();
  const maxIndex = Math.max(0, ...targetGrades.map(kidsGradeIndex));
  const grades = kidsExamStages.slice(0, maxIndex + 1);
  const { data, error } = await supabase
    .from("child_syllabus_items")
    .select("id,grade,title,category,description,sort_order")
    .in("grade", grades)
    .eq("active", true)
    .eq("exam_relevant", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true })
    .returns<
      Array<{
        id: string;
        grade: string | null;
        title: string;
        category: string | null;
        description: string | null;
        sort_order: number | null;
      }>
    >();

  if (error) throw error;

  const rows: Array<Record<string, unknown>> = [];
  let order = 1;
  for (const grade of grades) {
    const gradeItems = (data ?? []).filter(
      (item) => normalizeGrade(item.grade) === normalizeGrade(grade),
    );
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
        weight: 1,
        order_index: order++,
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
        order_index: order++,
      });
    }
  }
  if (rows.length) return rows;
  return buildKidsItemsFromLatestTemplate(eventId, grades);
}

async function buildKidsItemsFromLatestTemplate(
  eventId: string,
  grades: string[],
) {
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
      .select(
        "source,section,name,summary,grade,category,weight,order_index,cut_grade,active",
      )
      .eq("exam_event_id", previousEvent.id)
      .eq("active", true)
      .order("order_index", { ascending: true })
      .returns<
        Array<{
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
        }>
      >();

    if (itemsError) throw itemsError;

    const copiedItems = (templateItems ?? [])
      .filter(
        (item) =>
          item.source === "cut" ||
          !item.grade ||
          allowedGrades.has(normalizeGrade(item.grade)),
      )
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
        active: item.active,
      }));

    if (copiedItems.length) return copiedItems;
  }

  return [];
}

function resolveTargetGrade(
  memberClass: "kids" | "adults",
  currentGrade: string | null,
) {
  if (memberClass === "kids") return resolveChildExamTargetGrade(currentGrade);
  const current = normalizeGrade(currentGrade);
  if (memberClass === "adults" && current === "5 DAN") return "5 DAN";
  const grades = adultGrades;
  const index = grades.findIndex((grade) => normalizeGrade(grade) === current);
  if (index < 0) return grades[0];
  return grades[Math.min(index + 1, grades.length - 1)];
}

function kidsGradeIndex(grade: string | null) {
  const stage =
    kidsExamStageByGrade[normalizeGrade(grade)] ?? normalizeGrade(grade);
  return gradeIndex(kidsExamStages, stage);
}

function gradeIndex(grades: string[], grade: string | null) {
  const index = grades.findIndex(
    (item) => normalizeGrade(item) === normalizeGrade(grade),
  );
  return index < 0 ? 0 : index;
}

function normalizeGrade(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function defaultExamTitle(
  programType: IntegratedExamProgram,
  examDate: string,
) {
  if (programType === "adults") return `Examen adultos ${examDate}`;
  if (programType === "kids_progressive")
    return `Examen infantil progresivo ${examDate}`;
  if (programType === "dan_tribunal") return `Tribunal dan ${examDate}`;
  return `Examen infantil ${examDate}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}
