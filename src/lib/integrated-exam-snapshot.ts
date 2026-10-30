import { CHILD_PROGRAM_GRADES, normalizeChildGrade, normalizeSelectedGrades } from "./child-program.ts";

export function copyExamSnapshotItems<T extends object>(items: readonly T[], eventId: string): Array<T & { exam_event_id: string }> {
  return items.map((item) => ({ ...item, exam_event_id: eventId }));
}

export type TemplateExamSnapshotItem = {
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

type ProgressiveExamSnapshotRow = Omit<TemplateExamSnapshotItem, "id" | "exam_event_id"> & {
  exam_event_id: string;
};

export function validateTemplateExamItemSelection(
  templateItems: readonly TemplateExamSnapshotItem[],
  selectedIds: readonly string[]
): string[] {
  const ids = selectedIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) throw new Error("Selecciona al menos un contenido evaluable de la plantilla.");
  if (new Set(ids).size !== ids.length) throw new Error("La seleccion de la plantilla contiene elementos duplicados.");

  const byId = new Map(templateItems.map((item) => [item.id, item]));
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) throw new Error("El contenido seleccionado no pertenece a la plantilla.");
    if (!item.active || item.source === "cut" || Number(item.weight) <= 0) {
      throw new Error("El contenido seleccionado ya no es una fila evaluable activa.");
    }
  }
  return ids;
}

export function buildSelectedProgressiveExamSnapshot(
  templateItems: readonly TemplateExamSnapshotItem[],
  selectedIds: readonly string[],
  eventId: string,
  targetGrades: readonly string[]
) {
  const validIds = validateTemplateExamItemSelection(templateItems, selectedIds);
  const byId = new Map(templateItems.map((item) => [item.id, item]));
  const selectedRows = validIds.map((id) => {
    const { id: _id, exam_event_id: _templateEventId, order_index: _oldOrder, ...snapshot } = byId.get(id)!;
    return snapshot;
  });

  const cutsByInsertionIndex = new Map<number, string[]>();
  const normalizedTargets = new Set(normalizeSelectedGrades(targetGrades));
  for (const grade of CHILD_PROGRAM_GRADES.filter((candidate) => normalizedTargets.has(candidate))) {
    const targetOrder = childGradeOrder(grade);
    let insertionIndex = -1;
    for (let index = selectedRows.length - 1; index >= 0; index -= 1) {
      if (childGradeOrder(selectedRows[index].grade) <= targetOrder) {
        insertionIndex = index;
        break;
      }
    }
    if (insertionIndex < 0) continue;
    const cuts = cutsByInsertionIndex.get(insertionIndex) ?? [];
    cuts.push(grade);
    cutsByInsertionIndex.set(insertionIndex, cuts);
  }

  const rows: ProgressiveExamSnapshotRow[] = [];
  let orderIndex = 1;
  selectedRows.forEach((item, index) => {
    rows.push({ ...item, exam_event_id: eventId, order_index: orderIndex++ });
    for (const grade of cutsByInsertionIndex.get(index) ?? []) {
      rows.push({
        exam_event_id: eventId,
        source: "cut",
        section: "CORTE",
        name: `Corte progresivo: se sienta ${grade}`,
        summary: `Los kenshis cuyo objetivo termina en ${grade} pueden finalizar aqui si el examen es progresivo.`,
        grade,
        category: "corte",
        weight: 0,
        order_index: orderIndex++,
        cut_grade: grade,
        active: true
      });
    }
  });
  return rows;
}

function childGradeOrder(grade: string | null) {
  const index = CHILD_PROGRAM_GRADES.indexOf(normalizeChildGrade(grade) as (typeof CHILD_PROGRAM_GRADES)[number]);
  return index < 0 ? CHILD_PROGRAM_GRADES.length : index;
}
