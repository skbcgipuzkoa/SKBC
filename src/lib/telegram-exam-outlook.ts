import type { ExamOutlook } from "@/lib/exam-outlook";
import { formatExamCallMonth } from "./exam-call.ts";

/** Telegram HTML: never render user-controlled names or projection details as markup. */
export function formatTelegramExamOutlooks(outlooks: ExamOutlook[]) {
  const ordered = [...outlooks].sort((a, b) => (a.callDate ?? "9999").localeCompare(b.callDate ?? "9999") || a.name.localeCompare(b.name, "es"));
  const eligible = ordered.filter(row => row.feasibility !== "impossible");
  const ready = eligible.filter(row => row.currentReady && row.candidate);
  const projected = eligible.filter(row => !row.currentReady && row.candidate && row.classification === "projected");
  const preparation = eligible.filter(row => !row.currentReady && row.candidate && row.classification !== "projected");
  const followUp = eligible.filter(row => !row.candidate);
  const impossible = ordered.filter(row => row.feasibility === "impossible");
  const section = (title: string, rows: ExamOutlook[], empty: string) => [
    `<b>${title} (${rows.length})</b>`,
    ...(rows.length ? rows.slice(0, 12).map(formatRow) : [empty]),
    ...(rows.length > 12 ? [`Y ${rows.length - 12} más; consulta el detalle en Próximos exámenes.`] : [])
  ].join("\n");
  return [
    "🎓 <b>Exámenes · situación actual y previsión</b>",
    ...(ordered[0]?.evidence.windowEnd ? [`<i>Cálculo a ${ordered[0].evidence.windowEnd.split("-").reverse().join("/")}</i>`] : []),
    "La previsión se recalcula con los registros actuales, aunque el resumen corresponda a un periodo anterior. No concede aptitud ni sustituye la revisión del profesor.",
    section("🟢 Cumplen requisitos registrados hoy", ready, "Ninguno ahora mismo."),
    section("🔵 Posibles candidatos · podrían llegar con su ritmo actual", projected, "Ninguno con una proyección favorable respaldada por datos."),
    section("🟣 Candidatos para preparar · necesitan refuerzo o revisión", preparation, "Sin otros candidatos cercanos a preparar."),
    section("⛔ No llegan con las clases previstas", impossible, "Ningún caso matemáticamente bloqueado con el calendario actual."),
    section("🟠 Seguimiento · faltan datos o preparación", followUp, "Sin otros casos en seguimiento."),
    "Las estimaciones dependen de mantener la asistencia y trabajar los contenidos pendientes. Revisa los casos con poco margen antes de avisar."
  ].join("\n\n");
}

function formatRow(row: ExamOutlook) {
  const date = (value: string) => value.split("-").reverse().join("/");
  return [
    `• <b>${escape(row.name)}</b> (${row.memberClass === "kids" ? "niños" : "adultos"} · objetivo ${escape(row.targetGrade || "por revisar")})`,
    row.callDate ? `  Convocatoria orientativa: ${formatExamCallMonth(row.callDate)} · día pendiente de confirmar.` : "  Sin convocatoria futura calculable.",
    row.feasibility === "impossible" ? `  No es candidato a esta convocatoria con las clases previstas: ${escape((row.impossibilityReasons ?? []).join("; "))}.` : "",
    row.feasibility !== "impossible" && row.preparationCandidate && row.planningReasons?.length ? `  Para preparar: ${escape(row.planningReasons.join("; "))}.` : "",
    row.feasibility !== "impossible" && row.classification === "notyet" ? "  Previsión: no se prevé completar los requisitos al ritmo actual; necesita refuerzo." : row.feasibility !== "impossible" && row.classification === "unknown" ? "  Previsión: faltan datos para asegurar si llegará." : "",
    row.feasibility !== "impossible" && row.estimatedReadyOn ? `  Requisitos estimados para ${date(row.estimatedReadyOn)}${row.marginDays !== null ? ` · margen orientativo hasta final del mes: ${row.marginDays} días${row.marginDays < 30 ? " (margen corto para preparar el examen)" : ""}` : ""}.` : "",
    row.deficits.length ? `  Pendiente hoy: ${escape(row.deficits.join("; "))}.` : "  Sin déficits registrados en los requisitos calculables.",
    row.uncertainty.length ? `  Atención: ${escape(row.uncertainty.join("; "))}.` : "",
    "  Revisión final del profesor pendiente."
  ].filter(Boolean).join("\n");
}

function escape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
