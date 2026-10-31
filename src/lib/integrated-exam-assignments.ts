import { adultGrades } from "./grades.ts";
type Examiner = { id: string; revoked_at: string | null };
export function decodeExamAssignments(notes: string | null | undefined): {
  text: string;
  scopes: Record<string, string[]> | null;
  gradeGroupMode?: boolean;
  pendingExaminerIds?: string[];
} {
  const empty = { text: notes ?? "", scopes: null };
  if (!notes?.trim().startsWith("{")) return empty;
  let value: unknown;
  try {
    value = JSON.parse(notes);
  } catch {
    return empty;
  }
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("examAssignmentsVersion" in value) ||
    (value as { examAssignmentsVersion: unknown }).examAssignmentsVersion !== 1
  )
    return empty;
  const data = value as {
    text?: unknown;
    scopes?: unknown;
    gradeGroupMode?: unknown;
    pendingExaminerIds?: unknown;
  };
  if (
    typeof data.text !== "string" ||
    !data.scopes ||
    typeof data.scopes !== "object" ||
    Array.isArray(data.scopes)
  )
    throw new Error("Asignaciones de examen no validas.");
  const scopes: Record<string, string[]> = {};
  for (const [id, grades] of Object.entries(data.scopes)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(id) ||
      !Array.isArray(grades) ||
      grades.some((grade) => typeof grade !== "string") ||
      grades.length > 50
    )
      throw new Error("Asignacion de grado no valida.");
    scopes[id] = grades as string[];
  }
  if (
    data.gradeGroupMode !== undefined &&
    typeof data.gradeGroupMode !== "boolean"
  )
    throw new Error("Modo de grupos no valido.");
  if (
    data.pendingExaminerIds !== undefined &&
    (!Array.isArray(data.pendingExaminerIds) ||
      data.pendingExaminerIds.length > 100 ||
      data.pendingExaminerIds.some((id) => typeof id !== "string"))
  )
    throw new Error("Identidades pendientes no validas.");
  return {
    text: data.text,
    scopes,
    ...(data.gradeGroupMode !== undefined
      ? { gradeGroupMode: data.gradeGroupMode }
      : {}),
    ...(data.pendingExaminerIds !== undefined
      ? { pendingExaminerIds: data.pendingExaminerIds as string[] }
      : {}),
  };
}
export function encodeExamAssignments(
  text: string,
  scopes: Record<string, string[]>,
  settings?: { gradeGroupMode?: boolean; pendingExaminerIds?: string[] },
): string {
  return JSON.stringify({
    examAssignmentsVersion: 1,
    text,
    scopes,
    ...(settings?.gradeGroupMode !== undefined
      ? { gradeGroupMode: settings.gradeGroupMode }
      : {}),
    ...(settings?.pendingExaminerIds !== undefined
      ? { pendingExaminerIds: settings.pendingExaminerIds }
      : {}),
  });
}
export function validateExamAssignments(
  scopes: Record<string, string[]>,
  examiners: readonly Examiner[],
  targetGrades: readonly string[],
): Record<string, string[]> {
  if (!scopes || typeof scopes !== "object" || Array.isArray(scopes))
    throw new Error("Selecciona los grados de cada examinador.");
  const active = examiners.filter((row) => !row.revoked_at);
  const ids = new Set(examiners.map((row) => row.id));
  if (Object.keys(scopes).some((id) => !ids.has(id)))
    throw new Error("Examinador ajeno al examen.");
  const result: Record<string, string[]> = {};
  for (const examiner of active) {
    const grades = scopes[examiner.id];
    if (
      !Array.isArray(grades) ||
      !grades.length ||
      grades.some(
        (grade) => typeof grade !== "string" || !targetGrades.includes(grade),
      )
    )
      throw new Error(
        "Cada examinador activo necesita al menos un grado objetivo valido.",
      );
    result[examiner.id] = targetGrades.filter((grade) =>
      grades.includes(grade),
    );
  }
  if (
    targetGrades.some(
      (grade) => !Object.values(result).some((scope) => scope.includes(grade)),
    )
  )
    throw new Error("Todos los grados objetivo necesitan un examinador.");
  return result;
}
export function resolveExamAssignments(input: {
  programType: string;
  notes: string | null | undefined;
  examiners: readonly Examiner[];
  students: readonly { target_grade: string | null }[];
}): {
  examinerGradeScopes: Record<string, string[]>;
  adultTargetGrades: string[];
} {
  if (input.programType !== "adults" && input.programType !== "dan_tribunal")
    return { examinerGradeScopes: {}, adultTargetGrades: [] };
  const targets = [
    ...new Set(
      input.students
        .map((row) => row.target_grade?.trim())
        .filter((grade): grade is string => Boolean(grade)),
    ),
  ];
  const adultTargetGrades = targets.sort((a, b) => {
    const left = adultGrades.indexOf(a),
      right = adultGrades.indexOf(b);
    return (
      (left < 0 ? 999 : left) - (right < 0 ? 999 : right) || a.localeCompare(b)
    );
  });
  const configured = decodeExamAssignments(input.notes).scopes;
  const examinerGradeScopes: Record<string, string[]> = {};
  for (const row of input.examiners)
    examinerGradeScopes[row.id] =
      configured === null
        ? [...adultTargetGrades]
        : adultTargetGrades.filter((grade) =>
            configured[row.id]?.includes(grade),
          );
  return { examinerGradeScopes, adultTargetGrades };
}

export function completedExaminerGrades(input: {
  grades: readonly string[];
  students: readonly { id: string; target_grade: string | null }[];
  items: readonly {
    id: string;
    grade: string | null;
    active?: boolean;
    weight: number;
    source: string;
  }[];
  scores: readonly {
    event_student_id: string;
    event_item_id: string;
    score: number | null;
    skipped: boolean;
  }[];
}): string[] {
  return input.grades.filter((grade) => {
    const students = input.students.filter(
      (student) => student.target_grade === grade,
    );
    const items = input.items.filter(
      (item) =>
        item.active !== false &&
        item.source !== "cut" &&
        Number(item.weight) > 0 &&
        item.grade === grade,
    );
    return (
      students.length > 0 &&
      items.length > 0 &&
      students.every((student) =>
        items.every((item) =>
          input.scores.some(
            (score) =>
              score.event_student_id === student.id &&
              score.event_item_id === item.id &&
              (score.skipped ||
                (typeof score.score === "number" &&
                  Number.isFinite(score.score) &&
                  score.score >= 0 &&
                  score.score <= 10)),
          ),
        ),
      )
    );
  });
}
export function resolveAdultExamTargetGrade(
  currentGrade: string | null | undefined,
): string {
  const current = String(currentGrade ?? "")
    .trim()
    .toUpperCase();
  if (current === "5 DAN") return "5 DAN";
  const index = adultGrades.findIndex((grade) => grade === current);
  return index < 0
    ? adultGrades[0]
    : adultGrades[Math.min(index + 1, adultGrades.length - 1)];
}
