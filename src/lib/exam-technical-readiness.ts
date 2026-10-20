export type ExamCurriculumItem = {
  id: string;
  name: string;
  category: string | null;
  content_type: string | null;
};

export type ExamTechnicalReadiness = {
  fundamentalReady: boolean;
  fundamentalMissingFirst: number;
  fundamentalMissingRequired: number;
  specialReviewPending: string[];
};

export function classifyExamCurriculumItem(item: ExamCurriculumItem): "fundamental" | "special-review" {
  const category = normalize(item.category);
  if (category === "GOHO" || category === "JUHO") return "fundamental";
  return "special-review";
}

export function evaluateExamTechnicalReadiness(
  curriculum: ExamCurriculumItem[],
  repetitions: Map<string, number>,
  requiredRepetitions: number
): ExamTechnicalReadiness {
  const fundamental = curriculum.filter((item) => classifyExamCurriculumItem(item) === "fundamental");
  const specialReview = curriculum.filter((item) => classifyExamCurriculumItem(item) === "special-review");
  const countFor = (item: ExamCurriculumItem) =>
    repetitions.get(item.id) ?? repetitions.get(normalize(item.name)) ?? 0;
  const fundamentalCounts = fundamental.map(countFor);

  return {
    fundamentalReady: fundamentalCounts.every((count) => count >= requiredRepetitions),
    fundamentalMissingFirst: fundamentalCounts.filter((count) => count === 0).length,
    fundamentalMissingRequired: fundamentalCounts.filter((count) => count < requiredRepetitions).length,
    specialReviewPending: specialReview.filter((item) => countFor(item) === 0).map((item) => item.name)
  };
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}
