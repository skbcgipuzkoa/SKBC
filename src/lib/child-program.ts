import { createAdminClient } from "./supabase/admin.ts";

export const CHILD_PROGRAM_GRADES = [
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
  "1 DAN"
] as const;

export type ChildProgramGrade = (typeof CHILD_PROGRAM_GRADES)[number];

export type ChildProgramAssignment = {
  id: string;
  contentId: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  active: boolean;
  examRelevant: boolean;
  sortOrder: number;
};

export type ChildProgramContent = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: ChildProgramAssignment[];
};

export type ChildProgramContentUsage = {
  assignmentCount: number;
  historyCount: number;
  classPlanCount: number;
  examEventCount: number;
};

type AssignmentRow = {
  id: string;
  content_id: string;
  grade: string;
  title: string;
  category: string;
  description: string | null;
  active: boolean;
  exam_relevant: boolean;
  sort_order: number;
};

type ContentRow = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  child_syllabus_items: AssignmentRow[] | null;
};

const gradeAliases = new Map<string, ChildProgramGrade>([
  ["MINARAI", "BLANCO"],
  ...CHILD_PROGRAM_GRADES.flatMap((grade) => {
    const aliases: Array<readonly [string, ChildProgramGrade]> = [[grade, grade]];
    if (grade.includes("-")) {
      aliases.push([grade.replace("-", " "), grade], [grade.replace("-", " Y "), grade]);
    }
    return aliases;
  })
]);

export function normalizeChildGrade(value: string | null | undefined): string {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[º°]/g, "")
    .replace(/\s*(?:-|\bY\b)\s*/g, "-")
    .replace(/\s+/g, " ");

  return gradeAliases.get(normalized) ?? normalized;
}

export function normalizeSelectedGrades(grades: readonly string[]): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const grade of grades) {
    const normalized = normalizeChildGrade(grade);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    selected.push(normalized);
  }
  return selected;
}

export function resolveChildExamGrades(targetGrades: readonly string[]): ChildProgramGrade[] {
  const targetIndexes = normalizeSelectedGrades(targetGrades)
    .map((grade) => CHILD_PROGRAM_GRADES.indexOf(grade as ChildProgramGrade))
    .filter((index) => index >= 0);
  if (!targetIndexes.length) return [];
  return CHILD_PROGRAM_GRADES.slice(0, Math.max(...targetIndexes) + 1);
}

export function orderChildExamAssignments<T extends ChildProgramAssignment>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => {
    const gradeDifference = childGradeOrder(left.grade) - childGradeOrder(right.grade);
    if (gradeDifference) return gradeDifference;
    const sortDifference = left.sortOrder - right.sortOrder;
    if (sortDifference) return sortDifference;
    const titleDifference = left.title.localeCompare(right.title, "es", { sensitivity: "base" });
    if (titleDifference) return titleDifference;
    return left.id.localeCompare(right.id);
  });
}

export function defaultChildExamItemIds(items: readonly ChildProgramAssignment[], targetGrades: readonly string[]): string[] {
  const allowedGrades = new Set(resolveChildExamGrades(targetGrades));
  return orderChildExamAssignments(items)
    .filter((item) => item.active && item.examRelevant && allowedGrades.has(normalizeChildGrade(item.grade) as ChildProgramGrade))
    .map((item) => item.id);
}

export async function getChildProgramCatalog(): Promise<ChildProgramContent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("child_syllabus_contents")
    .select("id,title,category,description,archived_at,created_at,updated_at,child_syllabus_items(id,content_id,grade,title,category,description,active,exam_relevant,sort_order)")
    .order("title", { ascending: true })
    .returns<ContentRow[]>();

  if (error) throw error;
  return (data ?? []).map((content) => ({
    id: content.id,
    title: content.title,
    category: content.category,
    description: content.description,
    archivedAt: content.archived_at,
    createdAt: content.created_at,
    updatedAt: content.updated_at,
    assignments: orderChildExamAssignments((content.child_syllabus_items ?? []).map(mapAssignment))
  }));
}

export async function getChildProgramAssignment(assignmentId: string): Promise<ChildProgramAssignment | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("child_syllabus_items")
    .select("id,content_id,grade,title,category,description,active,exam_relevant,sort_order")
    .eq("id", assignmentId)
    .maybeSingle<AssignmentRow>();

  if (error) throw error;
  return data ? mapAssignment(data) : null;
}

export async function childProgramContentUsage(contentId: string): Promise<ChildProgramContentUsage> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .rpc("child_syllabus_content_usage", { p_content_id: contentId })
    .single<{
      assignment_count: number | string;
      history_count: number | string;
      class_plan_count: number | string;
      exam_event_count: number | string;
    }>();

  if (error) throw error;
  return {
    assignmentCount: Number(data.assignment_count),
    historyCount: Number(data.history_count),
    classPlanCount: Number(data.class_plan_count),
    examEventCount: Number(data.exam_event_count)
  };
}

function childGradeOrder(grade: string): number {
  const index = CHILD_PROGRAM_GRADES.indexOf(normalizeChildGrade(grade) as ChildProgramGrade);
  return index < 0 ? CHILD_PROGRAM_GRADES.length : index;
}

function mapAssignment(row: AssignmentRow): ChildProgramAssignment {
  return {
    id: row.id,
    contentId: row.content_id,
    grade: normalizeChildGrade(row.grade),
    title: row.title,
    category: row.category,
    description: row.description,
    active: row.active,
    examRelevant: row.exam_relevant,
    sortOrder: row.sort_order
  };
}
