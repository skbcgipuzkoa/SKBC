import { adultGrades } from "@/lib/grades";
import { getKamokuSummaryFallback } from "@/lib/kamoku-summary-fallbacks";
import { adaptTechniqueSummary } from "@/lib/technique-summary-adapter";

export type ConsultationTechnique = {
  id: string;
  legacy_id: string | null;
  grade: string;
  base_name: string | null;
  name: string;
  variant: string | null;
  variant_note: string | null;
  category: string;
  content_type: string | null;
  summary_es: string | null;
  active: boolean;
  active_in_planning: boolean;
};

export type ConsultationTechniqueView = ConsultationTechnique & {
  effective_summary_es: string;
};

export type ConsultationFilters = {
  q?: string;
  grade?: string;
  category?: string;
  base?: string;
  variant?: string;
  planning?: string;
};

export function limitTechniquesByMaxGrade(techniques: ConsultationTechniqueView[], maxGrade: string | null | undefined) {
  const maxOrder = gradeOrder(maxGrade ?? "");
  if (maxOrder === 999) return [];
  return techniques.filter((technique) => gradeOrder(technique.grade) <= maxOrder);
}

export function buildConsultationOptions(techniques: ConsultationTechniqueView[]) {
  return {
    grades: adultGrades.filter((grade) => techniques.some((technique) => sameNormalized(technique.grade, grade))),
    categories: uniqueSorted(techniques.map((technique) => technique.category)),
    bases: uniqueSorted(techniques.map((technique) => technique.base_name)),
    variants: uniqueSorted(techniques.flatMap((technique) => detectVariants(technique)))
  };
}

export function filterConsultationTechniques(techniques: ConsultationTechniqueView[], filters: ConsultationFilters) {
  const q = normalize(filters.q);
  return techniques.filter((technique) => {
    const variants = detectVariants(technique).map(normalize);
    if (q && !normalize(`${technique.name} ${technique.base_name ?? ""} ${technique.category} ${technique.variant ?? ""} ${technique.variant_note ?? ""} ${technique.effective_summary_es ?? ""}`).includes(q)) return false;
    if (filters.grade && !sameNormalized(technique.grade, filters.grade)) return false;
    if (filters.category && !sameNormalized(technique.category, filters.category)) return false;
    if (filters.base && !sameNormalized(technique.base_name, filters.base)) return false;
    if (filters.variant && !variants.includes(normalize(filters.variant))) return false;
    if (filters.planning === "yes" && !technique.active_in_planning) return false;
    if (filters.planning === "no" && technique.active_in_planning) return false;
    return true;
  });
}

export function effectiveTechniqueSummary(technique: Pick<ConsultationTechnique, "summary_es" | "name" | "variant" | "variant_note">) {
  if (technique.summary_es !== null) return technique.summary_es.trim();
  return adaptTechniqueSummary(getKamokuSummaryFallback(technique.name), technique);
}

export function detectVariants(technique: Pick<ConsultationTechnique, "name" | "variant" | "variant_note">) {
  const explicit = technique.variant?.trim();
  const haystack = normalize(`${technique.name} ${technique.variant} ${technique.variant_note}`).toLowerCase();
  const detected = ["katate", "morote", "ryote", "ura", "omote", "mae", "ushiro"]
    .filter((variant) => new RegExp(`(^|[\\s(/-])${variant}([\\s)/-]|$)`, "i").test(haystack))
    .map(titleCase);
  return uniqueSorted([explicit, ...detected]);
}

export function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function sameNormalized(a: string | null | undefined, b: string | null | undefined) {
  return normalize(a) === normalize(b);
}

export function compareConsultationTechniques(a: ConsultationTechnique, b: ConsultationTechnique) {
  return gradeOrder(a.grade) - gradeOrder(b.grade) || a.name.localeCompare(b.name);
}

export function isKnownAdultGrade(grade: string | null | undefined) {
  return gradeOrder(grade ?? "") !== 999;
}

function gradeOrder(grade: string) {
  const index = adultGrades.findIndex((item) => sameNormalized(item, grade));
  return index === -1 ? 999 : index;
}

function uniqueSorted(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
