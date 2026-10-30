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

export type ChildExamSnapshotRow =
  | {
      source: "child_syllabus";
      childSyllabusItemId: string;
      grade: string;
      title: string;
      category: string;
      description: string | null;
    }
  | {
      source: "cut";
      grade: string;
      cutGrade: string;
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

const childTargetByCurrentGrade: Record<string, ChildProgramGrade> = {
  MINARAI: "BLANCO",
  BLANCO: "BLANCO-AMARILLO",
  "BLANCO-AMARILLO": "AMARILLO",
  AMARILLO: "AMARILLO-NARANJA",
  "AMARILLO-NARANJA": "NARANJA",
  NARANJA: "NARANJA-VERDE",
  "NARANJA-VERDE": "VERDE",
  VERDE: "VERDE-AZUL",
  "VERDE-AZUL": "AZUL",
  AZUL: "AZUL-MARRON",
  "AZUL-MARRON": "MARRON",
  MARRON: "1 DAN",
  "1 DAN": "1 DAN"
};

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

export function resolveChildExamTargetGrade(currentGrade: string | null | undefined): ChildProgramGrade {
  return childTargetByCurrentGrade[normalizeChildGrade(currentGrade)] ?? "BLANCO-AMARILLO";
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

export function reconcileChildExamItemIds(
  items: readonly ChildProgramAssignment[],
  selectedIds: readonly string[],
  previousTargetGrades: readonly string[],
  nextTargetGrades: readonly string[]
): string[] {
  const previousScope = resolveChildExamGrades(previousTargetGrades);
  const nextScope = resolveChildExamGrades(nextTargetGrades);
  if (previousScope.length === nextScope.length && previousScope.every((grade, index) => grade === nextScope[index])) {
    return [...selectedIds];
  }

  const nextAllowedGrades = new Set<string>(nextScope);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const preserved = selectedIds.filter((id) => {
    const item = itemById.get(id);
    return item && nextAllowedGrades.has(normalizeChildGrade(item.grade));
  });
  if (nextScope.length <= previousScope.length) return preserved;

  const previousAllowedGrades = new Set<string>(previousScope);
  const newlyIntroducedGrades = new Set<string>(nextScope.filter((grade) => !previousAllowedGrades.has(grade)));
  const selected = new Set(preserved);
  const appendedDefaults = orderChildExamAssignments(items)
    .filter((item) => item.active && item.examRelevant && newlyIntroducedGrades.has(normalizeChildGrade(item.grade)) && !selected.has(item.id))
    .map((item) => item.id);
  return [...preserved, ...appendedDefaults];
}

export function childExamTargetGradesWithoutScorableItems(
  items: readonly ChildProgramAssignment[],
  targetGrades: readonly string[]
): ChildProgramGrade[] {
  return progressiveTargetGradesWithoutScorableItems(
    items.map((item) => ({ grade: item.grade, scorable: item.active })),
    targetGrades
  );
}

export function progressiveTargetGradesWithoutScorableItems(
  items: readonly { grade: string | null; scorable: boolean }[],
  targetGrades: readonly string[]
): ChildProgramGrade[] {
  return representedChildTargetGrades(targetGrades).filter((targetGrade) => {
    const targetIndex = childGradeOrder(targetGrade);
    return !items.some((item) => item.scorable && childGradeOrder(item.grade ?? "") <= targetIndex);
  });
}

export function buildChildExamSnapshot(
  items: readonly ChildProgramAssignment[],
  targetGrades: readonly string[] = items.map((item) => item.grade)
): ChildExamSnapshotRow[] {
  const rows: ChildExamSnapshotRow[] = [];
  const targetsByLastRelevantGrade = new Map<number, ChildProgramGrade[]>();
  for (const targetGrade of representedChildTargetGrades(targetGrades)) {
    const targetIndex = childGradeOrder(targetGrade);
    const relevantGradeIndexes = items
      .map((item) => childGradeOrder(item.grade))
      .filter((gradeIndex) => gradeIndex <= targetIndex);
    if (!relevantGradeIndexes.length) continue;
    const lastRelevantGrade = Math.max(...relevantGradeIndexes);
    const cuts = targetsByLastRelevantGrade.get(lastRelevantGrade) ?? [];
    cuts.push(targetGrade);
    targetsByLastRelevantGrade.set(lastRelevantGrade, cuts);
  }

  for (const grade of CHILD_PROGRAM_GRADES) {
    const gradeItems = items.filter((item) => normalizeChildGrade(item.grade) === grade);
    for (const item of gradeItems) {
      rows.push({
        source: "child_syllabus",
        childSyllabusItemId: item.id,
        grade,
        title: item.title,
        category: item.category,
        description: item.description
      });
    }
    for (const cutGrade of targetsByLastRelevantGrade.get(childGradeOrder(grade)) ?? []) {
      rows.push({ source: "cut", grade: cutGrade, cutGrade });
    }
  }
  return rows;
}

function representedChildTargetGrades(targetGrades: readonly string[]): ChildProgramGrade[] {
  const represented = new Set(
    normalizeSelectedGrades(targetGrades).filter((grade): grade is ChildProgramGrade => CHILD_PROGRAM_GRADES.includes(grade as ChildProgramGrade))
  );
  return CHILD_PROGRAM_GRADES.filter((grade) => represented.has(grade));
}

function childGradeOrder(grade: string): number {
  const index = CHILD_PROGRAM_GRADES.indexOf(normalizeChildGrade(grade) as ChildProgramGrade);
  return index < 0 ? CHILD_PROGRAM_GRADES.length : index;
}
