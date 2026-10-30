export const delegateChildObjectives = [
  "Atencion y disciplina",
  "Coordinacion",
  "Ukemi / caidas",
  "Kihon",
  "Goho basico",
  "Juho basico",
  "Trabajo en pareja",
  "Juego tecnico",
  "Preparacion examen",
  "Trabajo por grados",
  "Howa / valores"
] as const;

export const delegateChildActivities = [
  { value: "calentamiento", label: "Calentamiento" },
  { value: "coordinacion", label: "Coordinacion" },
  { value: "caidas", label: "Caidas" },
  { value: "kihon", label: "Kihon" },
  { value: "goho", label: "Goho" },
  { value: "juho", label: "Juho" },
  { value: "pareja", label: "Trabajo en pareja" },
  { value: "juego-tecnico", label: "Juego tecnico" },
  { value: "howa", label: "Howa" },
  { value: "examen", label: "Preparacion de grado" }
] as const;

export const delegateChildActivityValues = delegateChildActivities.map((activity) => activity.value);
