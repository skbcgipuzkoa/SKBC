import assert from "node:assert/strict";
import { buildAdultExamStatusPanel } from "../src/lib/adult-exam-status-panel.ts";

const base = {
  nextExamOn: "2026-12-05",
  attendanceCount: 42,
  minimumAttendance: 38,
  totalCycleSessions: 94,
  fundamentalRepetitions: [2, 2, 1, 0],
  recentAttendance60: 8,
  recentAttendance21: 2
};

const blue = buildAdultExamStatusPanel({
  ...base,
  semaphore: "AZUL",
  examNotice: "AZUL: por tiempo no puede hasta 05/12/2026. Convocatoria objetivo 05/12/2026."
});
assert.equal(blue.semaphore, "AZUL");
assert.equal(blue.criteria.find((item) => item.id === "time")?.tone, "waiting");
assert.equal(blue.criteria.find((item) => item.id === "time")?.progress, null);

const red = buildAdultExamStatusPanel({
  ...base,
  semaphore: "ROJO",
  attendanceCount: 48,
  minimumAttendance: 38,
  examNotice: "ROJO: no convocar por progreso tecnico. | BLOQUEO Tecnico fundamental: no convocar todavia, 2 tecnicas Goho/Juho sin registrar y 4 por debajo de 2 reps. | Revision del profesor pendiente: Mae ukemi. Programar una o varias clases de repaso."
});
assert.equal(red.criteria.find((item) => item.id === "attendance")?.tone, "complete");
assert.equal(red.criteria.find((item) => item.id === "attendance")?.progress, 100);
assert.equal(red.criteria.find((item) => item.id === "fundamentals")?.value, "2 de 4 preparadas");
assert.equal(red.criteria.find((item) => item.id === "fundamentals")?.progress, 50);
assert.equal(
  red.criteria.find((item) => item.id === "fundamentals")?.detail,
  "4 pendientes segun el progreso del examen; minimo 2 repeticiones."
);
assert.equal(JSON.stringify(red).includes("Mae ukemi"), false);

const yellow = buildAdultExamStatusPanel({
  ...base,
  semaphore: "AMARILLO",
  examNotice: "AMARILLO: proxima convocatoria 05/12/2026. | Tecnico fundamental: Goho/Juho completos con 2 repeticiones. | Revision del profesor pendiente: Daisharin. Programar una o varias clases de repaso.",
  fundamentalRepetitions: [2, 2, 2, 2]
});
assert.equal(yellow.criteria.find((item) => item.id === "fundamentals")?.tone, "complete");
assert.equal(JSON.stringify(yellow).includes("Daisharin"), false);

const green = buildAdultExamStatusPanel({
  ...base,
  semaphore: "VERDE",
  examNotice: "VERDE: apto para valoracion. | Tecnico fundamental: Goho/Juho completos con 2+ reps.",
  fundamentalRepetitions: [2, 2, 2, 3]
});
assert.equal(green.title, "Preparado para valorar");
assert.equal(green.criteria.every((item) => item.tone === "complete"), true);

const grey = buildAdultExamStatusPanel({
  ...base,
  semaphore: "GRIS",
  examNotice: "GRIS: revisar reactivacion reciente (2/6 en 60 dias y 0/1 en 21 dias).",
  recentAttendance60: 2,
  recentAttendance21: 0
});
assert.equal(grey.criteria.find((item) => item.id === "activity")?.tone, "blocked");
assert.equal(grey.criteria.find((item) => item.id === "activity")?.progress, 0);

const incompleteRecentWindow = buildAdultExamStatusPanel({
  ...base,
  semaphore: "ROJO",
  examNotice: null,
  recentAttendance60: 6,
  recentAttendance21: 0
});
assert.equal(incompleteRecentWindow.criteria.find((item) => item.id === "activity")?.progress, 0);
assert.equal(incompleteRecentWindow.criteria.find((item) => item.id === "activity")?.tone, "tracking");

const inactive = buildAdultExamStatusPanel({
  ...base,
  semaphore: "INACTIVO",
  examNotice: null,
  recentAttendance60: 0,
  recentAttendance21: 0
});
assert.equal(inactive.semaphore, "INACTIVO");
assert.equal(inactive.title, "Necesita retomar la actividad");
assert.match(inactive.summary, /recuperar la continuidad/i);
assert.equal(inactive.criteria.find((item) => item.id === "activity")?.tone, "blocked");
assert.equal(inactive.criteria.find((item) => item.id === "time")?.progress, null);
assert.equal(inactive.criteria.find((item) => item.id === "time")?.tone, "neutral");

for (const semaphore of [null, "DESCONOCIDO"]) {
  const neutral = buildAdultExamStatusPanel({
    ...base,
    semaphore,
    examNotice: null
  });
  const time = neutral.criteria.find((item) => item.id === "time");
  assert.equal(time?.value, "Sin datos");
  assert.equal(time?.progress, null);
  assert.equal(time?.tone, "neutral");
}

const unknownAttendanceMinimum = buildAdultExamStatusPanel({
  ...base,
  semaphore: "ROJO",
  minimumAttendance: null,
  examNotice: null
});
const unknownAttendance = unknownAttendanceMinimum.criteria.find((item) => item.id === "attendance");
assert.equal(unknownAttendance?.value, "42 registradas");
assert.equal(unknownAttendance?.progress, null);
assert.equal(unknownAttendance?.tone, "neutral");

const unknownFundamentals = buildAdultExamStatusPanel({
  ...base,
  semaphore: "ROJO",
  fundamentalRepetitions: [],
  examNotice: null
});
const unknownFundamentalProgress = unknownFundamentals.criteria.find((item) => item.id === "fundamentals");
assert.equal(unknownFundamentalProgress?.value, "0 de 0 preparadas");
assert.equal(unknownFundamentalProgress?.progress, null);
assert.equal(unknownFundamentalProgress?.tone, "neutral");

assert.equal(green.criteria.find((item) => item.id === "time")?.progress, 100);
assert.equal(typeof green.criteria.find((item) => item.id === "attendance")?.progress, "number");
assert.equal(typeof green.criteria.find((item) => item.id === "fundamentals")?.progress, "number");
assert.equal(typeof green.criteria.find((item) => item.id === "activity")?.progress, "number");

console.log("Adult exam status panel checks passed.");
