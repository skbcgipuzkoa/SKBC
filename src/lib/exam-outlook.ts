import { kidsGrades } from "./grades.ts";
import {
  classifyExamCurriculumItem,
  type ExamCurriculumItem,
} from "./exam-technical-readiness.ts";
import { resolveExamEligibilityTime } from "./exam-eligibility-time.ts";

export type OutlookMember = {
  id: string;
  display_name: string;
  legacy_id: string | null;
  class: "kids" | "adults";
  status: string;
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
  last_exam_cycle_on?: string | null;
};
export type OutlookRequirement = {
  member_class: "kids" | "adults";
  grade_pattern: string;
  min_months: number;
  attendance_ratio: number;
  adult_required_repetitions: number;
  technical_blocks_exam: boolean;
};
export type OutlookTechnique = ExamCurriculumItem & { grade: string };
export type OutlookHistory = {
  member_id: string;
  class_date: string;
  class_id?: string | null;
  technique_id: string | null;
  technique_name: string;
  technique_grade: string | null;
  completed: boolean;
  counts_as_progression: boolean;
};
export type OutlookClosure = {
  starts_on: string;
  ends_on: string;
  applies_to: string;
};
export type ExamOutlook = {
  notificationReady?: boolean;
  notificationApproval?: { date: string; targetGrade: string; confirmed: boolean };
  deferredFromCall?: string | null;
  memberId: string;
  name: string;
  legacyId: string | null;
  memberClass: "kids" | "adults";
  currentGrade: string | null;
  targetGrade: string;
  callDate: string | null;
  classification: "ready" | "projected" | "notyet" | "unknown";
  candidate: boolean;
  feasibility: "possible" | "impossible" | "unknown";
  impossibilityReasons: string[];
  preparationCandidate: boolean;
  planningReasons: string[];
  currentReady: boolean;
  estimatedReadyOn: string | null;
  marginDays: number | null;
  deficits: string[];
  uncertainty: string[];
  teacherReviewRequired: boolean;
  evidence: {
    windowStart: string;
    windowEnd: string;
    observedDays: number;
    attendanceDays: number;
    availableSessions: number;
    remainingSessions: number;
    usefulTechnicalGain: number;
    missingAttendance: number | null;
  };
};
export type ExamOutlookInput = {
  member: OutlookMember;
  today: string;
  horizonDays?: number;
  attendance: string[];
  history: OutlookHistory[];
  curriculum: OutlookTechnique[];
  requirements: OutlookRequirement[];
  calls: string[];
  closures: OutlookClosure[];
  advanceMonths?: number;
  attendanceCredit?: number;
  scheduledTrainingDates?: string[];
  todayClassClosed?: boolean;
  cancelledTrainingDates?: string[];
};
const grades = [
  "MINARAI",
  "5 KYU",
  "4 KYU",
  "3 KYU",
  "2 KYU",
  "1 KYU",
  "1 DAN",
  "2 DAN",
  "3 DAN",
  "4 DAN",
  "5 DAN",
  "6 DAN",
  "7 DAN",
  "8 DAN",
  "9 DAN",
];
const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
/** Same legacy aliases as the child fiche, preserving unknown grades for review. */
export function nextOutlookKidGrade(grade: string | null): string {
  const key = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, string> = {
    MINARAI: "BLANCO",
    "5KYU": "AMARILLO",
    "4KYU": "NARANJA",
    "3KYU": "VERDE",
    "2KYU": "AZUL",
    "1KYU": "MARRON",
    BLANCOYAMARILLO: "BLANCOAMARILLO",
    AMARILLOYNARANJA: "AMARILLONARANJA",
    NARANJAYVERDE: "NARANJAVERDE",
    VERDEYAZUL: "VERDEAZUL",
    AZULYMARRON: "AZULMARRON",
  };
  const normalized = key(grade ?? "");
  const index = kidsGrades.findIndex(
    (g) => key(g) === (aliases[normalized] ?? normalized),
  );
  return index < 0
    ? (grade ?? "")
    : kidsGrades[Math.min(index + 1, kidsGrades.length - 1)];
}
export function madridToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
const date = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (s: string, n: number) =>
  iso(new Date(date(s).getTime() + n * 86400000));
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(date(s).getTime()) &&
  iso(date(s)) === s;
const days = (a: string, b: string) =>
  Math.round((date(b).getTime() - date(a).getTime()) / 86400000);
export function outlookTrainingDates(
  start: string,
  end: string,
  memberClass: string,
  closures: OutlookClosure[],
) {
  const dates: string[] = [];
  for (let d = plus(start, 1); d <= end; d = plus(d, 1)) {
    const dt = date(d),
      m = dt.getUTCMonth(),
      day = dt.getUTCDate();
    if (
      ![2, 4].includes(dt.getUTCDay()) ||
      [6, 7].includes(m) ||
      (m === 11 && day >= 24) ||
      (m === 0 && day <= 6)
    )
      continue;
    if (
      !closures.some(
        (c) =>
          ["all", memberClass].includes(c.applies_to) &&
          d >= c.starts_on &&
          d <= c.ends_on,
      )
    )
      dates.push(d);
  }
  return dates;
}
export function evaluateExamOutlook(input: ExamOutlookInput): ExamOutlook {
  const { member: m, today } = input;
  if (!validDate(today)) throw new Error("Invalid outlook date");
  const cycle = m.last_exam_on ?? m.joined_on;
  const windowStart =
    cycle && cycle > plus(today, -60) ? cycle : plus(today, -60);
  const observedDays = days(windowStart, today);
  const attendance = [
    ...new Set(
      input.attendance.filter(
        (d) => validDate(d) && d <= today && (!cycle || d > cycle),
      ),
    ),
  ];
  const recent = attendance.filter((d) => d > windowStart);
  const available = outlookTrainingDates(
    windowStart,
    today,
    m.class,
    input.closures,
  ).length;
  const result: ExamOutlook = {
    memberId: m.id,
    name: m.display_name,
    legacyId: m.legacy_id,
    memberClass: m.class,
    currentGrade: m.grade,
    targetGrade:
      m.class === "adults"
        ? grades.indexOf(norm(m.grade)) < 0
          ? (m.grade ?? "")
          : (grades[grades.indexOf(norm(m.grade)) + 1] ?? m.grade ?? "")
        : nextOutlookKidGrade(m.grade),
    callDate: null,
    classification: "unknown",
    candidate: false,
    feasibility: "unknown",
    impossibilityReasons: [],
    preparationCandidate: false,
    planningReasons: [],
    currentReady: false,
    estimatedReadyOn: null,
    marginDays: null,
    deficits: [],
    uncertainty: [],
    teacherReviewRequired: true,
    evidence: {
      windowStart,
      windowEnd: today,
      observedDays,
      attendanceDays: recent.length,
      availableSessions: available,
      remainingSessions: 0,
      usefulTechnicalGain: 0,
      missingAttendance: null,
    },
  };
  if (m.status !== "active") {
    result.uncertainty.push("Kenshi inactivo");
    return result;
  }
  const req = input.requirements.find(
    (r) =>
      r.member_class === m.class &&
      (norm(r.grade_pattern) === norm(m.grade) ||
        norm(r.grade_pattern) === "*" ||
        (norm(r.grade_pattern) === "* KYU" && norm(m.grade).endsWith(" KYU")) ||
        (norm(r.grade_pattern) === "* DAN" && norm(m.grade).endsWith(" DAN"))),
  ) ?? {
    min_months:
      m.class === "adults"
        ? Number(norm(m.grade).match(/^(\d+) DAN$/)?.[1] ?? 1) * 12
        : 12,
    attendance_ratio: 0.4,
    adult_required_repetitions: m.class === "adults" ? 2 : 0,
    technical_blocks_exam: m.class === "adults",
  };
  if (
    ![
      req.min_months,
      req.attendance_ratio,
      req.adult_required_repetitions,
    ].every(Number.isFinite) ||
    req.min_months < 0 ||
    req.attendance_ratio < 0 ||
    req.attendance_ratio > 1 ||
    req.adult_required_repetitions < 0
  ) {
    result.uncertainty.push(
      "Configuracion de requisitos no valida; revisar con el profesor",
    );
    return result;
  }
  const timing = resolveExamEligibilityTime(
    m,
    req.min_months,
    input.advanceMonths ?? 0,
  );
  if (!timing || !cycle || cycle > today) {
    result.uncertainty.push("Falta una fecha de ciclo valida");
    return result;
  }
  if (m.class === "adults" && grades.indexOf(norm(m.grade)) < 0) {
    result.uncertainty.push("Grado adulto desconocido");
    return result;
  }
  const eligible = `${timing.eligibilityDate.getFullYear()}-${String(timing.eligibilityDate.getMonth() + 1).padStart(2, "0")}-${String(timing.eligibilityDate.getDate()).padStart(2, "0")}`;
  const threshold = eligible > today ? eligible : today;
  const call = [...input.calls]
    .sort()
    .find((d) => validDate(d) && d >= threshold);
  if (!call) {
    result.uncertainty.push("Sin convocatoria futura configurada");
    return result;
  }
  result.callDate = call;
  const cancelledDates = new Set(input.cancelledTrainingDates ?? []);
  const scheduledDates = (input.scheduledTrainingDates ?? []).filter(
    (d) => validDate(d) && d >= today && d <= call,
  );
  const future = [
    ...new Set([
      ...outlookTrainingDates(today, call, m.class, input.closures),
      ...scheduledDates.filter((d) => d > today),
    ]),
  ]
    .filter((d) => !cancelledDates.has(d))
    .sort();
  const potentialToday =
    !cancelledDates.has(today) &&
    input.todayClassClosed !== true &&
    (scheduledDates.includes(today) ||
      outlookTrainingDates(
        plus(today, -1),
        today,
        m.class,
        input.closures,
      ).includes(today));
  const attendanceCapacity =
    future.length + Number(potentialToday && !attendance.includes(today));
  result.evidence.remainingSessions = future.length + Number(potentialToday);
  const minimum = Math.ceil(
    outlookTrainingDates(cycle, eligible, m.class, input.closures).length *
      req.attendance_ratio,
  );
  // The authoritative readiness gate uses real attendance; engagement credit is informational only.
  const missingAttendance = Math.max(0, minimum - attendance.length);
  result.evidence.missingAttendance = missingAttendance;
  if (missingAttendance)
    result.deficits.push(
      `${missingAttendance} asistencias para el minimo de ${minimum}`,
    );
  if (eligible > today) result.deficits.push(`Tiempo minimo hasta ${eligible}`);
  const curriculum = (m.class === "kids" ? [] : input.curriculum).filter(
    (t) => norm(t.grade) === norm(result.targetGrade),
  );
  const counts = new Map<string, number>(),
    oldCounts = new Map<string, number>();
  const seenHistory = new Set<string>();
  const recentProgression = new Map<string, number>();
  const practicedToday = new Set<string>();
  for (const h of input.history) {
    if (!h.completed || !validDate(h.class_date) || h.class_date > today)
      continue;
    const item = h.technique_id
      ? curriculum.find((t) => t.id === h.technique_id)
      : curriculum.find(
          (t) =>
            norm(t.name) === norm(h.technique_name) &&
            norm(h.technique_grade) === norm(t.grade) &&
            curriculum.filter((x) => norm(x.name) === norm(h.technique_name))
              .length === 1,
        );
    if (!item) continue;
    const key = `${h.class_id ?? h.class_date}:${item.id}`;
    if (seenHistory.has(key)) continue;
    seenHistory.add(key);
    counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
    if (h.class_date === today) practicedToday.add(item.id);
    if (h.class_date <= windowStart)
      oldCounts.set(item.id, (oldCounts.get(item.id) ?? 0) + 1);
    else if (h.counts_as_progression)
      recentProgression.set(item.id, (recentProgression.get(item.id) ?? 0) + 1);
  }
  const fundamental = curriculum.filter(
    (t) => classifyExamCurriculumItem(t) === "fundamental",
  );
  const repetitions = Math.max(0, req.adult_required_repetitions);
  const missingReps = fundamental.reduce(
    (n, t) => n + Math.max(0, repetitions - (counts.get(t.id) ?? 0)),
    0,
  );
  const usefulGain = fundamental.reduce(
    (n, t) =>
      n +
      Math.min(
        Math.max(0, repetitions - (oldCounts.get(t.id) ?? 0)),
        recentProgression.get(t.id) ?? 0,
      ),
    0,
  );
  result.evidence.usefulTechnicalGain = usefulGain;
  const technicalBlocks =
    m.class === "adults" && req.technical_blocks_exam && repetitions > 0;
  const special = curriculum.filter(
    (t) =>
      classifyExamCurriculumItem(t) === "special-review" &&
      !(counts.get(t.id) ?? 0),
  );
  if (m.class === "kids")
    result.uncertainty.push(
      "Programa infantil: revision tecnica del profesor pendiente; sin porcentaje tecnico inventado",
    );
  if (m.class === "adults" && curriculum.length === 0 && technicalBlocks)
    result.uncertainty.push(
      "Sin programa tecnico verificable para el grado objetivo",
    );
  if (technicalBlocks && missingReps)
    result.deficits.push(
      `${missingReps} repeticiones utiles Goho/Juho pendientes`,
    );
  if (special.length)
    result.deficits.push(
      `Revision del profesor: ${special.map((t) => t.name).join(", ")}`,
    );
  // Absolute upper bounds use available dates, not the observed pace. Multiple
  // techniques can be practiced together, so only individual item deficits bound capacity.
  if (missingAttendance > attendanceCapacity) {
    result.impossibilityReasons.push(
      `Faltan ${missingAttendance} asistencias y quedan ${attendanceCapacity} clases previstas disponibles antes de la convocatoria`,
    );
  }
  if (technicalBlocks) {
    for (const item of fundamental) {
      const missing = Math.max(0, repetitions - (counts.get(item.id) ?? 0));
      const itemCapacity =
        future.length + Number(potentialToday && !practicedToday.has(item.id));
      if (missing > itemCapacity) {
        result.impossibilityReasons.push(
          `${item.name}: faltan ${missing} repeticiones en clases distintas y quedan ${itemCapacity} clases previstas disponibles`,
        );
      }
    }
  }
  if (result.impossibilityReasons.length > 0) {
    result.feasibility = "impossible";
    result.classification = "notyet";
    return result;
  }
  // Unknown adult curriculum cannot establish technical feasibility. Child
  // feasibility covers measured attendance/time; teacher technical review remains explicit.
  result.feasibility =
    technicalBlocks && curriculum.length === 0 ? "unknown" : "possible";
  const engaged180 = attendance.some((d) => d >= plus(today, -180));
  const connected90 = attendance.some((d) => d >= plus(today, -90));
  if (!connected90)
    result.uncertainty.push(
      "Sin asistencia en 90 dias; reactivacion requerida (6/60 dias y 1/21 dias)",
    );
  if (!engaged180)
    result.uncertainty.push("Sin asistencia en 180 dias; revisar reactivacion");
  const worked = fundamental.filter((t) => (counts.get(t.id) ?? 0) > 0).length;
  const attendanceCoverage = minimum > 0 ? attendance.length / minimum : 0;
  const technicalCoverage =
    fundamental.length > 0 ? worked / fundamental.length : 0;
  const active21 = attendance.filter((d) => d >= plus(today, -21)).length;
  result.preparationCandidate =
    m.class === "adults" &&
    days(today, call) <= (input.horizonDays ?? 365) &&
    observedDays >= 28 &&
    recent.length >= 6 &&
    active21 >= 1 &&
    connected90 &&
    attendanceCoverage >= 0.75 &&
    technicalCoverage >= 0.75;
  if (result.preparationCandidate) {
    result.planningReasons = [
      "En preparacion: revisar los requisitos pendientes con el profesor",
      `Asistencia ${attendance.length}/${minimum} (${Math.round(attendanceCoverage * 100)}% del minimo)`,
      `Temario Goho/Juho trabajado ${worked}/${fundamental.length} (${Math.round(technicalCoverage * 100)}%)`,
      `Actividad reciente: ${recent.length}/6 en 60 dias y ${active21}/1 en 21 dias`,
    ];
  }
  result.candidate = result.preparationCandidate;
  result.currentReady =
    eligible <= today &&
    missingAttendance === 0 &&
    (!technicalBlocks || missingReps === 0) &&
    special.length === 0 &&
    engaged180 &&
    connected90 &&
    (m.class === "kids" || curriculum.length > 0 || !technicalBlocks);
  // Children can meet attendance/time; their technical approval is always explicitly pending.
  if (m.class === "kids") result.currentReady = false;
  if (days(today, call) > (input.horizonDays ?? 365))
    result.uncertainty.push(
      "Convocatoria fuera del horizonte de planificacion",
    );
  if (result.currentReady && days(today, call) <= (input.horizonDays ?? 365)) {
    result.classification = "ready";
    result.estimatedReadyOn = today;
    result.marginDays = days(today, call);
    result.candidate = true;
    return result;
  }
  if (observedDays < 28)
    result.uncertainty.push("Historial menor de 28 dias: ritmo desconocido");
  if (!available || !recent.length)
    result.uncertainty.push("Sin ritmo reciente de asistencia verificable");
  const fatal = result.uncertainty.some(
    (s) => !s.startsWith("Programa infantil"),
  );
  if (fatal) return result;
  const attendancePace = Math.min(1, recent.length / available);
  // Forecast only capped useful gains on required items, conditional on practicing the remaining syllabus.
  const technicalPerSession = usefulGain / Math.max(1, recent.length);
  if (technicalBlocks && missingReps > 0 && technicalPerSession === 0) {
    result.uncertainty.push("Sin avance tecnico util reciente");
    return result;
  }
  let estimated: string | null = null;
  for (const d of [...new Set([today, ...future, eligible, call])]
    .filter((d) => d >= today && d <= call)
    .sort()) {
    const i = future.filter((f) => f <= d).length;
    if (d < eligible) continue;
    const expectedAttendance = Math.floor(i * attendancePace + 1e-9);
    if (expectedAttendance < missingAttendance) continue;
    if (
      technicalBlocks &&
      Math.floor(expectedAttendance * technicalPerSession + 1e-9) < missingReps
    )
      continue;
    estimated = d;
    break;
  }
  result.classification = estimated ? "projected" : "notyet";
  result.estimatedReadyOn = estimated;
  result.marginDays = estimated ? days(estimated, call) : null;
  result.candidate = result.preparationCandidate || Boolean(estimated);
  if (estimated && technicalBlocks && missingReps)
    result.uncertainty.push(
      "Proyeccion condicionada a trabajar las tecnicas pendientes, con el ritmo util observado",
    );
  if (special.length)
    result.uncertainty.push(
      "Convocatoria condicionada a revision del profesor",
    );
  return result;
}
export function formatExamOutlookSummary(o: ExamOutlook) {
  const label =
    o.feasibility === "impossible"
      ? "No llega con las clases previstas"
      : {
          ready: "Requisitos registrados",
          projected: "Llega al ritmo actual",
          notyet: "Aun no llega al ritmo actual",
          unknown: "Prevision insuficiente",
        }[o.classification];
  return [
    label,
    o.callDate ? `convocatoria ${o.callDate}` : "",
    o.estimatedReadyOn
      ? `estimado ${o.estimatedReadyOn}${o.marginDays !== null ? ` (${o.marginDays} dias de margen)` : ""}`
      : "",
    ...o.impossibilityReasons,
    ...o.planningReasons,
    ...o.deficits,
    ...o.uncertainty,
    "Pendiente de valoracion del profesor",
  ]
    .filter(Boolean)
    .join(" · ");
}
