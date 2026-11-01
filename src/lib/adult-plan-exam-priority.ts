import { classifyExamCurriculumItem, evaluateExamTechnicalReadiness, type ExamCurriculumItem } from "@/lib/exam-technical-readiness";
export type ExamPriorityPupil = {
    id: string;
    name: string;
    curriculum: ExamCurriculumItem[];
    repetitions: Map<string, number>;
    requiredRepetitions: number;
    proximity: number;
};
export type ExamPriorityRequirement = {
    grade_pattern: string;
    adult_required_repetitions: number;
    min_months?: number;
};
const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
export function matchExamRequirement(grade: string, rows: ExamPriorityRequirement[]): ExamPriorityRequirement {
    const value = normalize(grade);
    return rows.find(row => { const pattern = normalize(row.grade_pattern); return pattern === "*" || pattern === value || (pattern === "* KYU" && value.endsWith(" KYU")) || (pattern === "* DAN" && value.endsWith(" DAN")); }) ?? { grade_pattern: "*", adult_required_repetitions: 2, min_months: value.endsWith(" DAN") ? Number.parseInt(value, 10) * 12 : 12 };
}
function count(pupil: ExamPriorityPupil, item: ExamCurriculumItem) { return pupil.repetitions.get(item.id) ?? pupil.repetitions.get(normalize(item.name)) ?? 0; }
function deficit(pupil: ExamPriorityPupil, item: ExamCurriculumItem) { return Math.max(0, (classifyExamCurriculumItem(item) === "fundamental" ? pupil.requiredRepetitions : 1) - count(pupil, item)); }
export function examPriorityBenefit(techniqueId: string, pupils: ExamPriorityPupil[]) {
    let beneficiaries = 0, completedItems = 0, score = 0;
    for (const pupil of pupils) {
        const item = pupil.curriculum.find(item => item.id === techniqueId);
        if (!item || deficit(pupil, item) <= 0)
            continue;
        beneficiaries++;
        if (deficit(pupil, item) === 1)
            completedItems++;
        const remaining = pupil.curriculum.reduce((sum, item) => sum + deficit(pupil, item), 0);
        // Shared needs lead; closeness breaks ties while every deficit receives weight.
        score += 100 + 20 / Math.max(1, remaining) + Math.max(0, Math.min(1, pupil.proximity)) * 10;
    }
    return { beneficiaries, completedItems, missingRepetitions: beneficiaries, score };
}
export function projectedExamPlan(techniqueIds: string[], pupils: ExamPriorityPupil[]) {
    const ids = new Set(techniqueIds);
    let missingRepetitions = 0;
    const completedNames: string[] = [];
    for (const pupil of pupils) {
        if (!pupil.curriculum.length || pupil.requiredRepetitions <= 0)
            continue;
        const repetitions = new Map(pupil.repetitions);
        for (const item of pupil.curriculum)
            if (ids.has(item.id) && deficit(pupil, item) > 0) {
                repetitions.set(item.id, count(pupil, item) + 1);
                missingRepetitions++;
            }
        const before = evaluateExamTechnicalReadiness(pupil.curriculum, pupil.repetitions, pupil.requiredRepetitions);
        const after = evaluateExamTechnicalReadiness(pupil.curriculum, repetitions, pupil.requiredRepetitions);
        if ((!before.fundamentalReady || before.specialReviewPending.length > 0) && after.fundamentalReady && after.specialReviewPending.length === 0)
            completedNames.push(pupil.name);
    }
    return { missingRepetitions, completedNames };
}
export function getPlanExamPriorityNotice(focus: string | null | undefined) { const marker = "PREPARACION DE EXAMEN"; const index = focus?.indexOf(marker) ?? -1; return index < 0 ? null : focus!.slice(index); }
export function examPlanFocus(techniqueId: string, selectedIds: string[], pupils: ExamPriorityPupil[], attendanceKnown: boolean, includeSummary = true) {
    const benefit = examPriorityBenefit(techniqueId, pupils);
    const total = projectedExamPlan(selectedIds, pupils);
    return `PREPARACION DE EXAMEN: esta propuesta reduciria ${benefit.missingRepetitions} repeticiones pendientes para ${benefit.beneficiaries} kenshis.${includeSummary ? ` El plan completo reduciria ${total.missingRepetitions} repeticiones pendientes.${total.completedNames.length ? ` Programa tecnico y revision especial completos previstos: ${total.completedNames.join(", ")}.` : " Ningun programa completo previsto con este plan."}` : ""} ${attendanceKnown ? "Proyeccion para asistentes registrados" : "Proyeccion para adultos activos del grupo; asistencia aun no confirmada"}, condicionada a asistir y completar las propuestas. Revisar tiempo, asistencia y valoracion del profesor antes del examen; no acredita aptitud ni registra progreso.`;
}
