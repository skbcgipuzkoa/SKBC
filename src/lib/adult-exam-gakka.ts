import {
  ADULT_EXAM_CURRICULUM_GRADES,
  getAdultExamCurriculum,
  type AdultGakkaDelivery,
} from "./adult-exam-curriculum.ts";
export type AdultGakkaRequirement = AdultGakkaDelivery & {
  key: string;
  name: string;
  sourceName: string;
  summary: string;
};
export type AdultGakkaPlan = {
  grade: string;
  oral: AdultGakkaRequirement[];
  requiredWritten: AdultGakkaRequirement[];
  choiceWritten: AdultGakkaRequirement[];
  choiceCount: 0 | 3;
  externalNotes: AdultGakkaRequirement[];
};
export type AdultGakkaItemLike = {
  name?: string | null;
  section?: string | null;
  category?: string | null;
  grade?: string | null;
  weight?: number | null;
  active?: boolean;
  gakka?: AdultGakkaDelivery;
};
function cleanName(name: string) {
  return name.replace(/^\s*(?:Entrega previa|En el examen)\s*:\s*/i, "").trim();
}
/** Exact source-topic identity, ignoring delivery prefixes, accents, case and punctuation only. */
export function gakkaIdentity(name: string | null | undefined) {
  return cleanName(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function gradeLabel(grade: string | null | undefined) {
  const key = (grade ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return (
    (
      {
        SHODAN: "1 DAN",
        NIDAN: "2 DAN",
        SANDAN: "3 DAN",
        YONDAN: "4 DAN",
        GODAN: "5 DAN",
      } as Record<string, string>
    )[key] ?? key.replace(/^([1-5])(KYU|DAN)$/, "$1 $2")
  );
}
export function getAdultGakkaPlan(
  grade: string | null | undefined,
): AdultGakkaPlan {
  const label = gradeLabel(grade);
  const plan: AdultGakkaPlan = {
    grade: label,
    oral: [],
    requiredWritten: [],
    choiceWritten: [],
    choiceCount: 0,
    externalNotes: [],
  };
  for (const item of getAdultExamCurriculum(label)) {
    if (!item.gakka) continue;
    const requirement: AdultGakkaRequirement = {
      ...item.gakka,
      key: label + "|" + gakkaIdentity(item.name),
      name: cleanName(item.name),
      sourceName: item.name,
      summary: item.gakka.mode === "external" && label === "5 DAN" ? "El hokai de Daikenshi se examina por separado. Confirma sus requisitos y entregas con el responsable de esa evaluación." : item.summary ?? "",
    };
    if (requirement.mode === "oral") plan.oral.push(requirement);
    else if (requirement.mode === "written-required")
      plan.requiredWritten.push(requirement);
    else if (requirement.mode === "written-choice")
      plan.choiceWritten.push(requirement);
    else plan.externalNotes.push(requirement);
  }
  if (plan.choiceWritten.length) plan.choiceCount = 3;
  if (label === "4 DAN")
    plan.externalNotes.push({
      key: "4 DAN|no exam day theory",
      name: "No se requiere Gakka en la convocatoria",
      sourceName: "At the grading: Not required",
      summary:
        "BSKF Dan 2024, página impresa 9: Seikenshi exige seis trabajos previos; no hay una prueba teórica adicional el día del examen.",
      mode: "external",
      timing: "external",
    });
  return plan;
}
let sourceTopicNames: Set<string> | undefined;
export function isAdultGakkaItem(item: AdultGakkaItemLike) {
  const isMarker = (value: string | null | undefined) =>
    gakkaIdentity(value).replace(/ /g, "").startsWith("gakka");
  if (item.gakka || isMarker(item.section) || isMarker(item.category))
    return true;
  sourceTopicNames ??= new Set(
    ADULT_EXAM_CURRICULUM_GRADES.flatMap((grade) =>
      getAdultExamCurriculum(grade)
        .filter((row) => row.gakka)
        .map((row) => gakkaIdentity(row.name)),
    ),
  );
  return sourceTopicNames.has(gakkaIdentity(item.name));
}
export function sectionForGakka(
  requirement: Pick<AdultGakkaRequirement, "mode">,
) {
  return (
    {
      oral: "GAKKA_ORAL",
      "written-required": "GAKKA_ENTREGA",
      "written-choice": "GAKKA_SELECCION",
      external: "GAKKA_EXTERNO",
    } as const
  )[requirement.mode];
}
/** Read-only runtime view. Closed history and every children's item remain byte-for-byte untouched. */
export function normalizeAdultGakkaItems<T extends AdultGakkaItemLike>(
  items: T[],
  program: string,
  status: string,
): T[] {
  if (
    !["adults", "dan_tribunal"].includes(program) ||
    ["completed", "archived"].includes(status)
  )
    return items;
  const plans = new Map<string, AdultGakkaPlan>();
  return items.map((item) => {
    if (!isAdultGakkaItem(item)) return item;
    const grade = gradeLabel(item.grade);
    let plan = plans.get(grade);
    if (!plan) {
      plan = getAdultGakkaPlan(grade);
      plans.set(grade, plan);
    }
    const identity = gakkaIdentity(item.name);
    const requirement = [
      ...plan.oral,
      ...plan.requiredWritten,
      ...plan.choiceWritten,
      ...plan.externalNotes,
    ].find(
      (row) =>
        gakkaIdentity(row.sourceName) === identity ||
        gakkaIdentity(row.name) === identity,
    );
    if (!requirement)
      return {
        ...item,
        section: "GAKKA_FUERA_DE_GRADO",
        weight: 0,
        gakka: { mode: "external", timing: "external" },
      } as T;
    const wasSelection = gakkaIdentity(item.section) === "gakka seleccion";
    return {
      ...item,
      name: requirement.name,
      section: sectionForGakka(requirement),
      weight: requirement.mode === "oral" ? 1 : 0,
      gakka: { mode: requirement.mode, timing: requirement.timing },
      ...(requirement.mode === "written-choice" && !wasSelection
        ? { active: false }
        : {}),
    } as T;
  });
}
