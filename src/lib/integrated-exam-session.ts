export type ExamSubmissionExtras = {
  stopAfterItemId?: string;
  stopReason?: string;
  adjustments: Array<{ eventStudentId: string; delta: 1 | -1; reason: string }>;
};
type PointAdjustment = { delta: 1 | -1; reason: string };
type ScoreNotes = {
  text: string;
  outsideRoute: boolean;
  adjustments: PointAdjustment[];
  stop?: { afterItemId: string; reason: string };
};
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function reason(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1000)
    throw new Error("Indica un motivo valido de hasta 1000 caracteres.");
  return value.trim();
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new Error("Referencia de examen no valida.");
  return value.trim();
}
function adjustments(value: unknown): PointAdjustment[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Demasiados ajustes de examen.");
  return value.map((entry) => {
    if (!object(entry) || (entry.delta !== 1 && entry.delta !== -1))
      throw new Error("Cada ajuste debe ser +1 o -1.");
    return { delta: entry.delta, reason: reason(entry.reason) };
  });
}
export function parseExamSubmissionExtras(
  form: FormData,
): ExamSubmissionExtras {
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("examAdjustments") ?? "[]"));
  } catch {
    throw new Error("Los ajustes de examen no son validos.");
  }
  if (!Array.isArray(raw) || raw.length > 100)
    throw new Error("Demasiados ajustes de examen.");
  const result: ExamSubmissionExtras = {
    adjustments: raw.map((entry) => {
      if (!object(entry)) throw new Error("Ajuste no valido.");
      const adjustment = adjustments([entry])[0];
      return { ...adjustment, eventStudentId: id(entry.eventStudentId) };
    }),
  };
  const stop = String(form.get("stopAfterItemId") ?? "").trim();
  const stopReason = String(form.get("stopReason") ?? "").trim();
  if (stop) {
    result.stopAfterItemId = id(stop);
    result.stopReason = reason(stopReason);
  } else if (stopReason)
    throw new Error("Falta el punto de cierre del examen.");
  return result;
}
export function encodeScoreNotes(input: {
  text: string;
  outsideRoute?: boolean;
  adjustments?: PointAdjustment[];
  stop?: { afterItemId: string; reason: string };
}): string {
  if (typeof input.text !== "string" || input.text.length > 4000)
    throw new Error("Observacion demasiado larga.");
  return JSON.stringify({
    examScoreNotesVersion: 1,
    text: input.text.trim(),
    outsideRoute: input.outsideRoute === true,
    adjustments: adjustments(input.adjustments ?? []),
    ...(input.stop
      ? {
          stop: {
            afterItemId: id(input.stop.afterItemId),
            reason: reason(input.stop.reason),
          },
        }
      : {}),
  });
}
export function decodeScoreNotes(notes: string | null | undefined): ScoreNotes {
  const legacy = { text: notes ?? "", outsideRoute: false, adjustments: [] };
  if (!notes?.trim().startsWith("{")) return legacy;
  let value: unknown;
  try {
    value = JSON.parse(notes);
  } catch {
    return legacy;
  }
  if (!object(value) || value.examScoreNotesVersion !== 1) return legacy;
  if (typeof value.text !== "string" || typeof value.outsideRoute !== "boolean")
    throw new Error("Observaciones de examen no validas.");
  const result: ScoreNotes = {
    text: value.text,
    outsideRoute: value.outsideRoute,
    adjustments: adjustments(value.adjustments),
  };
  if (value.stop !== undefined) {
    if (!object(value.stop)) throw new Error("Cierre de examen no valido.");
    result.stop = {
      afterItemId: id(value.stop.afterItemId),
      reason: reason(value.stop.reason),
    };
  }
  return result;
}
type SubmissionScore = {
  eventStudentId: string;
  eventItemId: string;
  score: number | null;
  skipped: boolean;
  notes?: string;
};
export function prepareSessionSubmission(input: {
  items: readonly { id: string; order_index: number }[];
  students: readonly { id: string; itemIds: string[] }[];
  scores: readonly SubmissionScore[];
  extras: ExamSubmissionExtras;
}): SubmissionScore[] {
  const extras = input.extras;
  const studentIds = new Set(input.students.map((student) => student.id));
  // Validate typed service inputs too; callers cannot bypass the form parser.
  const normalized = extras.adjustments.map((entry) => ({
    ...adjustments([entry])[0],
    eventStudentId: id(entry.eventStudentId),
  }));
  if (
    normalized.length > 100 ||
    normalized.some((entry) => !studentIds.has(entry.eventStudentId))
  )
    throw new Error("Ajuste de alumno ajeno al examen.");
  const cutoff = extras.stopAfterItemId
    ? input.items.find((item) => item.id === extras.stopAfterItemId)
    : undefined;
  if (extras.stopAfterItemId && !cutoff)
    throw new Error("Punto de cierre ajeno al examen.");
  if (cutoff) reason(extras.stopReason);
  const byId = new Map(input.items.map((item) => [item.id, item]));
  const positions = new Map(input.items.map((item, index) => [item.id, index]));
  const cutoffIndex = cutoff ? positions.get(cutoff.id)! : Infinity;
  const provided = new Map<string, SubmissionScore>();
  for (const row of input.scores) {
    const student = input.students.find(
      (entry) => entry.id === row.eventStudentId,
    );
    const item = byId.get(row.eventItemId);
    const key = row.eventStudentId + ":" + row.eventItemId;
    if (
      !student?.itemIds.includes(row.eventItemId) ||
      !item ||
      provided.has(key)
    )
      throw new Error("Puntuacion duplicada o ajena al temario del alumno.");
    if (cutoff && positions.get(item.id)! > cutoffIndex)
      throw new Error("Hay puntuaciones posteriores al cierre del examen.");
    provided.set(key, row);
  }
  const output: SubmissionScore[] = [];
  for (const student of input.students) {
    const relevant = student.itemIds
      .map((key) => byId.get(key)!)
      .sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
    let first = true;
    for (const item of relevant) {
      const outsideRoute = Boolean(
        cutoff && positions.get(item.id)! > cutoffIndex,
      );
      const row = provided.get(student.id + ":" + item.id);
      if (!outsideRoute && !row)
        throw new Error(
          "Completa todos los puntos con una nota o No evaluado.",
        );
      output.push({
        eventStudentId: student.id,
        eventItemId: item.id,
        score: outsideRoute ? null : row!.score,
        skipped: outsideRoute || row!.skipped,
        notes: encodeScoreNotes({
          text: outsideRoute ? "" : (row?.notes ?? ""),
          outsideRoute,
          adjustments: first
            ? normalized.filter((entry) => entry.eventStudentId === student.id)
            : [],
          stop:
            first && cutoff
              ? { afterItemId: cutoff.id, reason: extras.stopReason! }
              : undefined,
        }),
      });
      first = false;
    }
  }
  if (
    cutoff &&
    !output.some(
      (row) => !row.skipped && row.score !== null && Number.isFinite(row.score),
    )
  )
    throw new Error("Evalua al menos un punto antes de finalizar el examen.");
  return output;
}

