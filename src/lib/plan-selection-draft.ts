export type PlanSelection = Record<string, boolean>;
export const planDraftKey = (classId: string) => `skbc:plan-draft:v1:${classId}`;
export function parsePlanDraft(value: string | null): PlanSelection | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (!Object.entries(parsed).every(([id, checked]) => id.length > 0 && typeof checked === "boolean")) return null;
    return parsed as PlanSelection;
  } catch { return null; }
}
export function mergePlanDraft(server: PlanSelection, draft: PlanSelection): PlanSelection {
  return Object.fromEntries(Object.entries(server).map(([id, checked]) => [id, Object.hasOwn(draft, id) ? draft[id] : checked]));
}
export function planSelectionsAgree(server: PlanSelection, draft: PlanSelection): boolean {
  return Object.entries(server).every(([id, checked]) => !Object.hasOwn(draft, id) || draft[id] === checked);
}
