export const clubMilestones = [
  { date: "2023-10-10", line: "Fundación de SKBC Gipuzkoa" },
  { date: "2024-11-12", line: "Inicio de los entrenamientos en Gainberri" }
] as const;

export function formatMilestoneDate(date: string) {
  return date.split("-").reverse().join("/");
}

export const gainberriTrainingStart = clubMilestones[1].date;
