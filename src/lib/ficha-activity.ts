export const fichaSections = {
  overview: "Resumen de la ficha", personal: "Datos del kenshi", exam: "Preparación de examen",
  attendance: "Asistencias y actividad", progress: "Progreso técnico", history: "Historial técnico",
  gallery: "Galería de entrenamientos", exams: "Exámenes", courses: "Cursos y taikai",
  notices: "Avisos y notas", ranking: "Ranking", "technical-area": "Área técnica personal",
  "technique-catalog": "Consulta de técnicas", games: "Entrenar jugando"
} as const;
export type FichaSection = keyof typeof fichaSections;
export type FichaActivityEvent = {
  id: string; kind: "time" | "video" | "technique" | "section";
  section: FichaSection; seconds: number; resourceId?: string; label?: string;
};
export type FichaActivityRow = {
  id: string; member_id: string; session_id: string; kind: FichaActivityEvent["kind"];
  section: FichaSection; active_seconds: number; resource_id: string | null;
  resource_label: string | null; created_at: string;
};
export function activityTechniqueLabel(item: { name: string; grade?: string | null; variant?: string | null; variant_note?: string | null; content_type?: string | null }) {
  const kata = item.content_type?.includes("SOTAI") ? "Sotai" : item.content_type?.includes("TANEN") ? "Tan-en" : null;
  return [...new Set([item.name, item.grade, item.variant, item.variant_note, kata].filter(Boolean))].join(" · ").slice(0, 180);
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseFichaActivity(value: unknown): { token: string; sessionId: string; events: FichaActivityEvent[] } | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.token !== "string" || !body.token.trim() || body.token.length > 160 || typeof body.sessionId !== "string" || !uuid.test(body.sessionId)) return null;
  if (!Array.isArray(body.events) || !body.events.length || body.events.length > 20) return null;
  const events: FichaActivityEvent[] = [];
  for (const raw of body.events) {
    if (!raw || typeof raw !== "object") return null;
    const event = raw as Record<string, unknown>;
    if (typeof event.id !== "string" || !uuid.test(event.id) || !["time", "video", "technique", "section"].includes(String(event.kind))) return null;
    if (typeof event.section !== "string" || !Object.hasOwn(fichaSections, event.section)) return null;
    if (!Number.isInteger(event.seconds) || Number(event.seconds) < 0 || Number(event.seconds) > 15 || (event.kind !== "time" && event.seconds !== 0)) return null;
    if (event.resourceId !== undefined && (typeof event.resourceId !== "string" || !/^[\w-]{1,80}$/.test(event.resourceId))) return null;
    if (event.label !== undefined && (typeof event.label !== "string" || event.label.length > 180 || /[\u0000-\u001f]/.test(event.label))) return null;
    events.push({ id: event.id, kind: event.kind as FichaActivityEvent["kind"], section: event.section as FichaSection, seconds: Number(event.seconds),
      ...(typeof event.resourceId === "string" ? { resourceId: event.resourceId } : {}), ...(typeof event.label === "string" ? { label: event.label.trim() } : {}) });
  }
  return { token: body.token.trim(), sessionId: body.sessionId, events };
}
export function activeElapsedSeconds(previous: number, now: number, lastInput: number, visible: boolean, focused: boolean) {
  if (!visible || !focused || now - lastInput > 90_000 || now < previous) return 0;
  // Suspended timers and device sleep never become a long active interval.
  const elapsed = (now - previous) / 1000;
  return elapsed <= 2.5 ? elapsed : 0;
}
export function sectionFromTitle(title: string): FichaSection {
  const text = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/foto|galeria/.test(text)) return "gallery";
  if (/progreso|programa infantil/.test(text)) return "progress";
  if (/historial tecnico/.test(text)) return "history";
  if (/semaforo|preparacion|convocatoria/.test(text)) return "exam";
  if (/examen/.test(text)) return "exams";
  if (/curso|taikai/.test(text)) return "courses";
  if (/asistencia|actividad|implicacion/.test(text)) return "attendance";
  if (/sensei|comportamiento|aviso|nota/.test(text)) return "notices";
  if (/ranking/.test(text)) return "ranking";
  if (/datos|kenshi/.test(text)) return "personal";
  return "overview";
}
export function summarizeFichaActivity(rows: FichaActivityRow[]) {
  const sessions = new Set<string>();
  const sections = new Map<string, { key: string; label: string; seconds: number; sessions: Set<string> }>();
  const videos = new Map<string, { label: string; count: number; lastAt: string }>();
  const techniques = new Map<string, { label: string; count: number; lastAt: string }>();
  let seconds = 0, videoCount = 0;
  let lastAt: string | null = null;
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id); sessions.add(row.session_id);
    if (!lastAt || row.created_at > lastAt) lastAt = row.created_at;
    const section = sections.get(row.section) ?? { key: row.section, label: Object.hasOwn(fichaSections, row.section) ? fichaSections[row.section] : "Otros apartados", seconds: 0, sessions: new Set<string>() };
    section.sessions.add(row.session_id);
    if (row.kind === "time") { section.seconds += row.active_seconds; seconds += row.active_seconds; }
    sections.set(row.section, section);
    if (row.kind === "video" || row.kind === "technique") {
      const target = row.kind === "video" ? videos : techniques;
      const label = row.resource_label || "Recurso sin título";
      const key = `${row.resource_id ?? label}:${label}`;
      const entry = target.get(key) ?? { label, count: 0, lastAt: row.created_at };
      entry.count++; if (row.created_at > entry.lastAt) entry.lastAt = row.created_at;
      target.set(key, entry);
      if (row.kind === "video") videoCount++;
    }
  }
  return { seconds, sessions: sessions.size, lastAt, videoCount, techniqueCount: techniques.size,
    sections: [...sections.values()].map(row => ({ ...row, sessions: row.sessions.size })).sort((a, b) => b.seconds - a.seconds || a.label.localeCompare(b.label, "es")),
    videos: [...videos.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")),
    techniques: [...techniques.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es")) };
}
export function activityDuration(seconds: number) {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return seconds % 60 < 1 ? `${minutes} min` : `${minutes} min ${Math.floor(seconds % 60)} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
