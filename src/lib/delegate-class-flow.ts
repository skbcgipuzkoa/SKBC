export type DelegateMode = "adults" | "kids" | "combined";
export type DelegateStep = "start" | "kids-attendance" | "technical" | "attendance";
export type DelegateClassGroup = "kids" | "adults";

export function normalizeDelegateStep(
  value: string | null | undefined,
  mode: DelegateMode,
  hasStarted: boolean,
  hasKidsClass: boolean,
  hasAdultClass: boolean
): DelegateStep {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (isDelegateStep(normalized)) return normalized;
  if (!hasStarted) return "start";
  if (mode === "combined") return hasKidsClass ? "kids-attendance" : hasAdultClass ? "technical" : "attendance";
  if (mode === "kids") return "attendance";
  return hasAdultClass ? "technical" : "attendance";
}

export function delegateAttendanceGroups(mode: DelegateMode, step: DelegateStep): DelegateClassGroup[] {
  if (mode === "kids") return ["kids"];
  if (mode === "adults") return ["adults"];
  return step === "kids-attendance" ? ["kids"] : ["adults"];
}

export function delegateClassesForSubmission<T extends { class_group: DelegateClassGroup }>(
  classes: T[],
  mode: DelegateMode,
  nextStep: string
) {
  const partialCombined = mode === "combined" && nextStep === "technical";
  const groups: DelegateClassGroup[] = mode === "kids"
    ? ["kids"]
    : mode === "adults"
      ? ["adults"]
      : partialCombined
        ? ["kids"]
        : ["adults", "kids"];

  return {
    classes: classes.filter((item) => groups.includes(item.class_group)),
    closeClasses: !partialCombined
  };
}

export function hasAttendanceForEveryClass(classIds: string[], attendedClassIds: string[]) {
  if (!classIds.length) return false;
  const attended = new Set(attendedClassIds);
  return classIds.every((classId) => attended.has(classId));
}

export function hasRequiredDelegateGroups(
  mode: DelegateMode,
  classes: Array<{ class_group: DelegateClassGroup }>
) {
  const groups = new Set(classes.map((item) => item.class_group));
  if (mode === "combined") return groups.has("adults") && groups.has("kids");
  return groups.has(mode);
}

function isDelegateStep(value: string): value is DelegateStep {
  return value === "start" || value === "kids-attendance" || value === "technical" || value === "attendance";
}
