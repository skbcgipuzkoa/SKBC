export type ExamNoticeDetails = {
  segments: string[];
  fundamentalMissingFirst: number;
  fundamentalMissingRequired: number;
  fundamentalComplete: boolean;
  specialReviewPending: string[];
};

export function parseExamNotice(notice: string | null | undefined): ExamNoticeDetails {
  const raw = String(notice ?? "").trim();
  const segments = raw.split("|").map((part) => part.trim()).filter(Boolean);
  const fundamentalMissingFirst = numberFrom(raw, [
    /(\d+)\s+tecnicas?\s+Goho\/Juho\s+sin registrar/i,
    /(\d+)\s+tecnicas?\s+aun sin registrar/i
  ]);
  const fundamentalMissingRequired = numberFrom(raw, [
    /(\d+)\s+por debajo de\s+\d+\s+reps?/i,
    /(\d+)\s+tecnicas?\s+Goho\/Juho\s+pendientes de\s+\d+\s+repeticiones/i,
    /(\d+)\s+tecnicas?\s+pendientes/i
  ]);
  const specialMatch = raw.match(/Revision del profesor pendiente:\s*(.+?)\.\s*Programar/i);

  return {
    segments,
    fundamentalMissingFirst,
    fundamentalMissingRequired,
    fundamentalComplete: /Tecnico fundamental:.*(?:todas las tecnicas|Goho\/Juho completos)/i.test(raw),
    specialReviewPending: specialMatch
      ? specialMatch[1].split(",").map((name) => name.trim()).filter(Boolean)
      : []
  };
}

function numberFrom(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return Number(match[1] ?? 0);
  }
  return 0;
}
