import { createAdminClient } from "@/lib/supabase/admin";

const repeatBlockDays = 14;

const nextGrade = new Map([
  ["MINARAI", "5 KYU"],
  ["5 KYU", "4 KYU"],
  ["4 KYU", "3 KYU"],
  ["3 KYU", "2 KYU"],
  ["2 KYU", "1 KYU"],
  ["1 KYU", "1 DAN"],
  ["1 DAN", "2 DAN"],
  ["2 DAN", "3 DAN"],
  ["3 DAN", "4 DAN"],
  ["4 DAN", "5 DAN"],
  ["5 DAN", "6 DAN"],
  ["6 DAN", "7 DAN"],
  ["7 DAN", "8 DAN"],
  ["8 DAN", "9 DAN"],
  ["9 DAN", "9 DAN"]
]);

type ClassRow = {
  id: string;
  legacy_id: string | null;
  class_date: string;
  class_group: "kids" | "adults";
  class_type: string | null;
  plan_generated: boolean;
  closed: boolean;
};

type TechnicalGroup = {
  id: string;
  legacy_id: string | null;
  grade: string;
  active: boolean;
};

type Technique = {
  id: string;
  legacy_id: string | null;
  grade: string;
  base_name: string | null;
  name: string;
  variant: string | null;
  variant_note: string | null;
  category: string | null;
  content_type: string | null;
  summary_es: string | null;
  program_order: number | null;
  curriculum_order: number | null;
  active: boolean;
  active_in_planning: boolean;
  force_next: boolean;
  score: number | null;
  repetitions: number | null;
  last_trained_on: string | null;
  plan_repetitions?: number;
  plan_last_trained_on?: string | null;
};

type ExistingPlan = {
  legacy_id: string | null;
  class_id: string;
  class_date: string;
  technique_id: string | null;
  completed: boolean;
  used_for_history: boolean;
};

type SelectedTechnique = {
  technique: Technique;
  proposalType: string;
  focus: string;
  usedForHistory: boolean;
};

export async function generateAdultTechnicalPlan(classId: string) {
  const supabase = createAdminClient();

  const { data: clase, error: classError } = await supabase
    .from("classes")
    .select("id,legacy_id,class_date,class_group,class_type,plan_generated,closed")
    .eq("id", classId)
    .single<ClassRow>();

  if (classError || !clase) {
    throw new Error("Clase no encontrada.");
  }

  if (clase.class_group !== "adults") {
    throw new Error("El plan tecnico automatico solo esta replicado para adultos.");
  }

  if (clase.closed) {
    throw new Error("No se puede generar plan para una clase cerrada.");
  }

  const { data: currentPlan, error: currentPlanError } = await supabase
    .from("technical_plans")
    .select("id")
    .eq("class_id", clase.id)
    .limit(1);

  if (currentPlanError) throw currentPlanError;
  if (clase.plan_generated || (currentPlan?.length ?? 0) > 0) {
    throw new Error("Esta clase ya tiene plan tecnico.");
  }

  const [{ data: groups, error: groupsError }, { data: techniques, error: techniquesError }] =
    await Promise.all([
      supabase
        .from("class_technical_groups")
        .select("id,legacy_id,grade,active")
        .eq("class_id", clase.id)
        .eq("active", true)
        .returns<TechnicalGroup[]>(),
      supabase
        .from("techniques")
        .select("id,legacy_id,grade,base_name,name,variant,variant_note,category,content_type,summary_es,program_order,curriculum_order,active,active_in_planning,force_next,score,repetitions,last_trained_on")
        .eq("active", true)
        .eq("active_in_planning", true)
        .returns<Technique[]>()
    ]);

  if (groupsError) throw groupsError;
  if (techniquesError) throw techniquesError;
  if (!groups?.length) {
    throw new Error("La clase no tiene grupos tecnicos activos.");
  }

  const enrichedTechniques = await addRecentPlanHistory(clase.id, techniques ?? []);
  const legacyPrefix = `PLA_${Date.now().toString(36).toUpperCase()}`;
  let legacyCounter = 1;

  const inserts = groups.flatMap((group) => {
    const gradeWork = resolveWorkGrade(group.grade);
    const targetGrade = resolveTargetGrade(group.grade);
    const selected = selectTechniquesForGroup(gradeWork, clase.class_type, enrichedTechniques);

    return selected.map((item, index) => ({
      legacy_id: `${legacyPrefix}_${String(legacyCounter++).padStart(3, "0")}`,
      class_id: clase.id,
      technical_group_id: group.id,
      class_date: clase.class_date,
      session_type: clase.class_type,
      grade: gradeWork,
      group_grade: group.grade,
      target_grade: targetGrade,
      technique_id: item.technique.id,
      technique_grade: item.technique.grade,
      technique_base: item.technique.base_name,
      technique_name: item.technique.name,
      variant: item.technique.variant,
      variant_note: item.technique.variant_note,
      category: categoryForDb(item.technique.category),
      content_type: item.technique.content_type,
      summary_es: item.technique.summary_es,
      proposal_type: item.proposalType,
      focus: item.focus,
      suggested_order: index + 1,
      score_at_that_moment: item.technique.score ?? 0,
      completed: false,
      notes: item.focus,
      used_for_history: item.usedForHistory,
      updated_at: new Date().toISOString()
    }));
  });

  if (!inserts.length) {
    throw new Error("No se encontraron tecnicas candidatas para los grupos.");
  }

  const { error: insertError } = await supabase.from("technical_plans").insert(inserts);
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from("classes")
    .update({ plan_generated: true, updated_at: new Date().toISOString() })
    .eq("id", clase.id);

  if (updateError) throw updateError;

  return inserts.length;
}

async function addRecentPlanHistory(currentClassId: string, techniques: Technique[]) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("technical_plans")
    .select("legacy_id,class_id,class_date,technique_id,completed,used_for_history")
    .neq("class_id", currentClassId)
    .eq("completed", true)
    .eq("used_for_history", true)
    .returns<ExistingPlan[]>();

  if (error) throw error;

  const seen = new Set<string>();
  const history = new Map<string, { repetitions: number; lastDate: string | null }>();

  (data ?? [])
    .filter((row) => row.technique_id && row.class_date)
    .sort((a, b) => a.class_date.localeCompare(b.class_date))
    .forEach((row) => {
      const key = `${row.class_id}::${row.technique_id}`;
      if (seen.has(key) || !row.technique_id) return;
      seen.add(key);
      const current = history.get(row.technique_id) ?? { repetitions: 0, lastDate: null };
      current.repetitions += 1;
      current.lastDate = !current.lastDate || row.class_date > current.lastDate ? row.class_date : current.lastDate;
      history.set(row.technique_id, current);
    });

  return techniques.map((technique) => {
    const recent = history.get(technique.id);
    return {
      ...technique,
      plan_repetitions: (technique.repetitions ?? 0) + (recent?.repetitions ?? 0),
      plan_last_trained_on: maxDate(technique.last_trained_on, recent?.lastDate ?? null)
    };
  });
}

function selectTechniquesForGroup(
  gradeWork: string,
  sessionType: string | null,
  techniques: Technique[]
): SelectedTechnique[] {
  if (normalize(sessionType) === "CONJUNTA" || normalize(gradeWork) === "CONJUNTA") {
    return techniques
      .filter((technique) => normalize(technique.grade) === "CONJUNTA")
      .sort(compareTechniques)
      .slice(0, 5)
      .map((technique) => ({
        technique,
        proposalType: "CONJUNTA",
        focus: "CONJUNTA",
        usedForHistory: true
      }));
  }

  const ownGohoJuho = techniques
    .filter((technique) => normalize(technique.grade) === normalize(gradeWork))
    .filter((technique) => ["GOHO", "JUHO"].includes(normalize(technique.category)))
    .sort(compareTechniques);

  const groupOrder = ownGohoJuho.find((technique) => Number.isFinite(technique.curriculum_order ?? NaN))
    ?.curriculum_order;

  const reviewCandidates = techniques
    .filter((technique) => ["GOHO", "JUHO"].includes(normalize(technique.category)))
    .filter((technique) => {
      if (!Number.isFinite(groupOrder ?? NaN) || (groupOrder ?? 0) <= 1) {
        return normalize(technique.grade) === normalize(gradeWork);
      }
      return (technique.curriculum_order ?? Number.MAX_SAFE_INTEGER) < (groupOrder ?? 0);
    })
    .sort(compareTechniques);

  const selected: SelectedTechnique[] = selectBalancedProgram(ownGohoJuho);
  const selectedIds = new Set(selected.map((item) => item.technique.id));
  const review = reviewCandidates.find((technique) => !selectedIds.has(technique.id));

  if (review) {
    selected.push({
      technique: review,
      proposalType: "REPASO",
      focus: "REPASO",
      usedForHistory: false
    });
    selectedIds.add(review.id);
  }

  fillSelection(selected, selectedIds, ownGohoJuho, "REFUERZO", "REFUERZO", false);
  fillSelection(
    selected,
    selectedIds,
    techniques.filter((technique) => normalize(technique.grade) === normalize(gradeWork)).sort(compareTechniques),
    "REFUERZO",
    "REFUERZO",
    false
  );

  return selected.slice(0, 5);
}

function selectBalancedProgram(candidates: Technique[]): SelectedTechnique[] {
  const goho = candidates.filter((technique) => normalize(technique.category) === "GOHO");
  const juho = candidates.filter((technique) => normalize(technique.category) === "JUHO");
  const selected: SelectedTechnique[] = [];
  const ids = new Set<string>();

  if (goho.length < 2 || juho.length < 2) {
    fillSelection(selected, ids, candidates, "PROGRAMA", "PROGRAMA", true, 4);
    return selected.slice(0, 4);
  }

  fillBalancedSelection(selected, ids, candidates, 4, 2);
  fillBalancedSelection(selected, ids, candidates, 4, 3);
  fillBalancedSelection(selected, ids, candidates, 4, 4);
  fillSelection(selected, ids, candidates, "PROGRAMA", "PROGRAMA", true, 4);

  return selected.slice(0, 4);
}

function fillBalancedSelection(
  selected: SelectedTechnique[],
  ids: Set<string>,
  candidates: Technique[],
  totalLimit: number,
  categoryLimit: number
) {
  while (selected.length < totalLimit) {
    const next = nextBalancedCandidate(selected, ids, candidates, categoryLimit);
    if (!next) return;
    selected.push({ technique: next, proposalType: "PROGRAMA", focus: "PROGRAMA", usedForHistory: true });
    ids.add(next.id);
  }
}

function nextBalancedCandidate(
  selected: SelectedTechnique[],
  ids: Set<string>,
  candidates: Technique[],
  categoryLimit: number
) {
  const counts = selected.reduce<Record<string, number>>((acc, item) => {
    const category = normalize(item.technique.category);
    if (category === "GOHO" || category === "JUHO") acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});

  return candidates.find((technique) => {
    const category = normalize(technique.category);
    if (ids.has(technique.id) || !["GOHO", "JUHO"].includes(category)) return false;
    return (counts[category] ?? 0) < categoryLimit;
  });
}

function fillSelection(
  selected: SelectedTechnique[],
  ids: Set<string>,
  candidates: Technique[],
  proposalType: string,
  focus: string,
  usedForHistory: boolean,
  totalLimit = 5,
  categoryLimit = Number.MAX_SAFE_INTEGER
) {
  for (const technique of candidates) {
    if (selected.length >= totalLimit) return;
    if (ids.has(technique.id)) continue;
    const categoryCount = selected.filter((item) => item.technique.category === technique.category).length;
    if (categoryCount >= categoryLimit) continue;
    selected.push({ technique, proposalType, focus, usedForHistory });
    ids.add(technique.id);
  }
}

function compareTechniques(a: Technique, b: Technique) {
  if (a.force_next !== b.force_next) return a.force_next ? -1 : 1;
  if (isRecent(a) !== isRecent(b)) return isRecent(a) ? 1 : -1;
  const repetitions = (a.plan_repetitions ?? 0) - (b.plan_repetitions ?? 0);
  if (repetitions !== 0) return repetitions;
  const dateCompare = compareDates(a.plan_last_trained_on ?? null, b.plan_last_trained_on ?? null);
  if (dateCompare !== 0) return dateCompare;
  const orderCompare = (a.program_order ?? Number.MAX_SAFE_INTEGER) - (b.program_order ?? Number.MAX_SAFE_INTEGER);
  if (orderCompare !== 0) return orderCompare;
  return a.name.localeCompare(b.name, "es");
}

function isRecent(technique: Technique) {
  if (technique.force_next || !technique.plan_last_trained_on) return false;
  const lastDate = new Date(`${technique.plan_last_trained_on}T00:00:00Z`);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - repeatBlockDays);
  return lastDate >= cutoff;
}

function compareDates(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  return a.localeCompare(b);
}

function maxDate(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function resolveWorkGrade(grade: string) {
  return normalize(grade) === "MINARAI" ? "5 KYU" : grade;
}

function resolveTargetGrade(grade: string) {
  return nextGrade.get(normalize(grade)) ?? grade;
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function categoryForDb(value: string | null | undefined) {
  const normalized = normalize(value).toLowerCase();
  return normalized || null;
}
