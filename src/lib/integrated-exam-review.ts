import { CHILD_PROGRAM_GRADES, normalizeChildGrade } from "./child-program.ts";

export type ReviewAdjustment = { score: number; notes: string };
export type ReviewEnvelope = {
  version: 1;
  adjustments: Record<string, ReviewAdjustment>;
  decision: "pass" | "fail" | null;
  conclusion: string;
  sourceSignature: string;
  registeredExamId?: string;
  registeredAt?: string;
  reportUrl?: string;
  diplomaUrl?: string;
  documentErrors?: string[];
  documentLeaseId?: string;
  documentLeaseUntil?: string;
};

export type ReviewItem = {
  id: string;
  source?: string;
  weight: number;
  active?: boolean;
  grade?: string | null;
  name?: string;
  summary?: string | null;
  section?: string | null;
};
export type ReviewScore = {
  event_student_id: string;
  event_item_id: string;
  examiner_id?: string;
  score: number | null;
  skipped: boolean;
  notes?: string | null;
};

export type ReviewedItem<T extends ReviewItem = ReviewItem> = T & {
  originalScore: number | null;
  score: number | null;
  notes: string[];
  adjustmentNotes: string;
  adjusted: boolean;
  skipped: boolean;
  scored: boolean;
};

export type StudentReviewSummary<T extends ReviewItem = ReviewItem> = {
  items: ReviewedItem<T>[];
  basePercentage: number;
  percentage: number;
  automaticPassed: boolean;
  totalItems: number;
  scoredItems: number;
  complete: boolean;
  sourceSignature: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function isValidReviewScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 10
  );
}

export function parseReviewEnvelope(
  text: string | null | undefined,
): ReviewEnvelope {
  const empty: ReviewEnvelope = {
    version: 1,
    adjustments: {},
    decision: null,
    conclusion: "",
    sourceSignature: "",
  };
  if (!text?.trim()) return empty;
  if (!text.trim().startsWith("{")) return { ...empty, conclusion: text };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      "La revision guardada no es valida. Revisa sus datos antes de registrar.",
    );
  }
  if (!isObject(value) || value.version !== 1 || !isObject(value.adjustments))
    throw new Error("Formato de revision no valido.");
  const adjustments: Record<string, ReviewAdjustment> = {};
  for (const [id, adjustment] of Object.entries(value.adjustments)) {
    if (
      ["__proto__", "constructor", "prototype"].includes(id) ||
      !isObject(adjustment) ||
      !isValidReviewScore(adjustment.score)
    ) {
      throw new Error("Puntuacion de revision no valida.");
    }
    if (adjustment.notes !== undefined && typeof adjustment.notes !== "string")
      throw new Error("Observacion de revision no valida.");
    adjustments[id] = {
      score: adjustment.score,
      notes: adjustment.notes ?? "",
    };
  }
  if (
    value.decision !== null &&
    value.decision !== undefined &&
    value.decision !== "pass" &&
    value.decision !== "fail"
  )
    throw new Error("Decision de revision no valida.");
  const result: ReviewEnvelope = {
    version: 1,
    adjustments,
    decision:
      value.decision === "pass" || value.decision === "fail"
        ? value.decision
        : null,
    conclusion: typeof value.conclusion === "string" ? value.conclusion : "",
    sourceSignature:
      typeof value.sourceSignature === "string" ? value.sourceSignature : "",
  };
  for (const key of [
    "registeredExamId",
    "registeredAt",
    "reportUrl",
    "diplomaUrl",
    "documentLeaseId",
    "documentLeaseUntil",
  ] as const) {
    if (typeof value[key] === "string" && value[key]) result[key] = value[key];
  }
  if (
    Array.isArray(value.documentErrors) &&
    value.documentErrors.every((entry) => typeof entry === "string")
  )
    result.documentErrors = value.documentErrors;
  return result;
}

export function buildStudentReview<T extends ReviewItem>(input: {
  studentId: string;
  items: readonly T[];
  scores: readonly ReviewScore[];
  adjustments?: Record<string, ReviewAdjustment>;
  passPercentage: number;
}): StudentReviewSummary<T> {
  const sourceItems = input.items.filter(
    (item) =>
      item.active !== false && item.source !== "cut" && Number(item.weight) > 0,
  );
  const allowedIds = new Set(sourceItems.map((item) => item.id));
  const scores = input.scores.filter(
    (score) =>
      score.event_student_id === input.studentId &&
      allowedIds.has(score.event_item_id),
  );
  const adjustments = input.adjustments ?? {};
  for (const [id, adjustment] of Object.entries(adjustments)) {
    if (!isValidReviewScore(adjustment.score))
      throw new Error("Puntuacion de revision fuera del rango 0-10.");
  }
  let baseTotal = 0;
  let baseMax = 0;
  let total = 0;
  let max = 0;
  let complete = sourceItems.length > 0;
  const items = sourceItems.map((item): ReviewedItem<T> => {
    const itemScores = scores.filter(
      (score) => score.event_item_id === item.id,
    );
    const validScores = itemScores.filter(
      (score) => !score.skipped && isValidReviewScore(score.score),
    );
    const originalScore = validScores.length
      ? validScores.reduce((sum, score) => sum + score.score!, 0) /
        validScores.length
      : null;
    const skipped =
      originalScore === null &&
      itemScores.length > 0 &&
      itemScores.every((score) => score.skipped);
    const adjustment = adjustments[item.id];
    if (originalScore === null && !skipped && !adjustment) complete = false;
    const score = adjustment?.score ?? originalScore;
    const weight =
      Number.isFinite(Number(item.weight)) && Number(item.weight) > 0
        ? Number(item.weight)
        : 0;
    if (originalScore !== null) {
      baseTotal += originalScore * weight;
      baseMax += 10 * weight;
    }
    if (score !== null) {
      total += score * weight;
      max += 10 * weight;
    }
    return {
      ...item,
      originalScore,
      score,
      notes: itemScores
        .map((entry) => entry.notes?.trim() ?? "")
        .filter(Boolean),
      adjustmentNotes: adjustment?.notes ?? "",
      adjusted: Boolean(adjustment),
      skipped: skipped && !adjustment,
      scored: score !== null,
    };
  });
  const percentage = max ? Math.round((total / max) * 1000) / 10 : 0;
  const snapshot = JSON.stringify({
    passPercentage: input.passPercentage,
    items: sourceItems
      .map((item) => [
        item.id,
        item.grade ?? "",
        item.weight,
        item.name ?? "",
        item.summary ?? "",
        item.section ?? "",
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    scores: scores
      .map((score) => [
        score.event_item_id,
        score.examiner_id ?? "",
        score.score,
        score.skipped,
        score.notes ?? "",
      ])
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      ),
  });
  // A content signature detects stale reviews; it is not an authentication token.
  let hash = 2166136261;
  for (let index = 0; index < snapshot.length; index++)
    hash = Math.imul(hash ^ snapshot.charCodeAt(index), 16777619);
  return {
    items,
    basePercentage: baseMax ? Math.round((baseTotal / baseMax) * 1000) / 10 : 0,
    percentage,
    automaticPassed: complete && max > 0 && percentage >= input.passPercentage,
    totalItems: items.length,
    scoredItems: items.filter((item) => item.scored).length,
    complete,
    sourceSignature: `v1-${(hash >>> 0).toString(16)}-${snapshot.length}`,
  };
}

export function validateStudentDecision(
  review: ReviewEnvelope,
  summary: StudentReviewSummary,
): string[] {
  const errors: string[] = [];
  if (!review.decision) return errors;
  if (!summary.complete)
    errors.push("Falta completar la evaluacion recibida del alumno.");
  if (!summary.items.some((item) => item.scored && item.weight > 0))
    errors.push("No hay puntuaciones evaluables para decidir el resultado.");
  if (review.sourceSignature !== summary.sourceSignature)
    errors.push(
      "La evaluacion ha cambiado. Revisa de nuevo antes de confirmar.",
    );
  if (
    (review.decision === "pass") !== summary.automaticPassed &&
    !review.conclusion.trim()
  )
    errors.push(
      "Indica el motivo de la decision distinta del resultado automatico.",
    );
  return errors;
}

export function isReviewCurrent(
  review: ReviewEnvelope,
  summary: StudentReviewSummary,
): boolean {
  return (
    Boolean(review.decision) &&
    validateStudentDecision(review, summary).length === 0
  );
}

export function isReviewItemRelevantForStudent(
  programType: string,
  student: { target_grade: string | null },
  item: { grade?: string | null },
): boolean {
  if (programType === "kids" || programType === "kids_progressive") {
    const target = CHILD_PROGRAM_GRADES.indexOf(
      normalizeChildGrade(
        student.target_grade,
      ) as (typeof CHILD_PROGRAM_GRADES)[number],
    );
    if (!item.grade?.trim()) return target >= 0;
    const grade = CHILD_PROGRAM_GRADES.indexOf(
      normalizeChildGrade(item.grade) as (typeof CHILD_PROGRAM_GRADES)[number],
    );
    return target >= 0 && grade >= 0 && grade <= target;
  }
  const normalize = (value: string | null | undefined) =>
    String(value ?? "")
      .trim()
      .toUpperCase();
  return (
    Boolean(student.target_grade && item.grade) &&
    normalize(student.target_grade) === normalize(item.grade)
  );
}
