import { createClient } from "@supabase/supabase-js";

const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const memberMap = await getMemberMap();
const today = new Date();

const summary = {
  rankings: await normalizeRankings(),
  notes: await normalizeNotes(),
  manualNotices: await normalizeManualNotices(),
  automaticNotices: await regenerateAutomaticNotices(),
  behaviorReports: await normalizeBehaviorReports(),
  profileCache: await rebuildProfileCache()
};

console.log(JSON.stringify(summary, null, 2));

async function normalizeRankings() {
  const attendance = await getAttendanceForKids();
  const rankingRows = [];

  for (const member of memberMap.values()) {
    if (member.class !== "kids" || member.status !== "active") continue;

    const dates = attendance.get(member.id) ?? [];
    const attendance30d = countSince(dates, 30);
    const attendance90d = countSince(dates, 90);
    const lastAttendanceOn = dates[0] ?? null;
    const daysWithoutAttendance = lastAttendanceOn ? daysBetween(parseIsoDate(lastAttendanceOn), today) : null;
    const score = attendance30d * 3 + attendance90d;

    rankingRows.push({
      member_id: member.id,
      legacy_id: member.legacy_id,
      attendance_30d: attendance30d,
      attendance_90d: attendance90d,
      last_attendance_on: lastAttendanceOn,
      days_without_attendance: daysWithoutAttendance,
      score,
      position: null,
      level: null,
      constancy_status: constancyStatus(attendance30d, daysWithoutAttendance),
      motivational_message: motivationalMessage(null, null, attendance30d, daysWithoutAttendance),
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  rankingRows
    .sort((a, b) => b.score - a.score || (a.days_without_attendance ?? 9999) - (b.days_without_attendance ?? 9999))
    .forEach((row, index) => {
      row.position = index + 1;
      row.level = rankingLevel(row.position, row.score);
      row.motivational_message = motivationalMessage(row.level, row.position, row.attendance_30d, row.days_without_attendance);
    });

  await supabase.from("child_rankings").delete().not("id", "is", null);
  await upsertChunks("child_rankings", rankingRows, "legacy_id");
  return rankingRows.length;
}

async function normalizeNotes() {
  const rows = await getLegacyRows("NINOS_NOTAS_SENSEI");
  const notes = rows
    .map(({ row_data: row }, index) => {
      const member = memberMap.get(clean(row.ID));
      return {
        member_id: member?.id,
        legacy_id: `NINOS_NOTAS_SENSEI:${clean(row.ID)}:${index + 2}`,
        note_date: parseDate(row.Fecha),
        note_type: clean(row.Tipo) || null,
        note: clean(row.Nota) || null,
        visible_family: parseBool(row.Visible_Familia),
        author: clean(row.Autor) || null,
        updated_at: new Date().toISOString()
      };
    })
    .filter((item) => item.member_id && (item.note || item.note_type || item.note_date));

  await supabase.from("child_notes").delete().not("id", "is", null);
  await upsertChunks("child_notes", notes, "legacy_id");
  return notes.length;
}

async function normalizeManualNotices() {
  const rows = await getLegacyRows("NINOS_AVISOS");
  const notices = rows
    .map(({ row_data: row }, index) => {
      const title = clean(row.Titulo);
      const member = memberMap.get(clean(row.ID));
      return {
        member_id: member?.id,
        legacy_id: `NINOS_AVISOS:${clean(row.ID)}:${index + 2}`,
        notice_date: parseDate(row.Fecha),
        title: title || "MANUAL",
        body: clean(row.Aviso) || null,
        color: clean(row.Color) || null,
        active: parseBool(row.Activo),
        source: isAutomaticLegacyTitle(title) ? "legacy_auto" : "manual",
        updated_at: new Date().toISOString()
      };
    })
    .filter((item) => item.member_id && (item.body || item.title !== "MANUAL"));

  await supabase.from("child_notices").delete().in("source", ["manual", "legacy_auto"]);
  await upsertChunks("child_notices", notices, "legacy_id");
  return notices.length;
}

async function regenerateAutomaticNotices() {
  const { data, error } = await supabase
    .from("child_rankings")
    .select("member_id,legacy_id,attendance_30d,days_without_attendance,position");

  if (error) throw error;

  const notices = [];
  for (const row of data) {
    const generated = automaticNoticesFor(row);
    generated.forEach((notice, index) => {
      notices.push({
        member_id: row.member_id,
        legacy_id: `AUTO:${row.legacy_id}:${index + 1}`,
        notice_date: toIsoDate(today),
        title: notice.title,
        body: notice.body,
        color: notice.color,
        active: true,
        source: "system",
        updated_at: new Date().toISOString()
      });
    });
  }

  await supabase.from("child_notices").delete().eq("source", "system");
  await upsertChunks("child_notices", notices, "legacy_id");
  return notices.length;
}

async function normalizeBehaviorReports() {
  const rows = await getLegacyRows("NINOS_COMPORTAMIENTO");
  const reports = rows
    .map(({ row_data: row }, index) => {
      const member = memberMap.get(clean(row.ID));
      return {
        member_id: member?.id,
        legacy_id: `NINOS_COMPORTAMIENTO:${clean(row.ID)}:${index + 2}`,
        report_date: parseDate(row.Fecha),
        attitude: clean(row.Actitud) || null,
        attention: clean(row.Atencion) || null,
        respect: clean(row.Respeto) || null,
        effort: clean(row.Esfuerzo) || null,
        companionship: clean(row["CompaÃ±erismo"]) || clean(row.Companerismo) || null,
        observation: clean(row.Observacion) || null,
        updated_at: new Date().toISOString()
      };
    })
    .filter((item) => item.member_id && Object.values(item).some(Boolean));

  await supabase.from("child_behavior_reports").delete().not("id", "is", null);
  await upsertChunks("child_behavior_reports", reports, "legacy_id");
  return reports.length;
}

async function rebuildProfileCache() {
  const rankings = await getRowsByMember("child_rankings");
  const notes = await getRowsByMember("child_notes", "note_date");
  const notices = await getRowsByMember("child_notices", "notice_date", { active: true });
  const behaviors = await getRowsByMember("child_behavior_reports", "report_date");
  const cacheRows = [];

  for (const member of memberMap.values()) {
    if (member.class !== "kids" || member.status !== "active") continue;
    const ranking = first(rankings.get(member.id));
    const latestNote = first((notes.get(member.id) ?? []).filter((note) => note.visible_family));
    const latestBehavior = first(behaviors.get(member.id));
    const activeNotices = notices.get(member.id) ?? [];

    cacheRows.push({
      member_id: member.id,
      legacy_id: member.legacy_id,
      token: member.ficha_token,
      status: "OK",
      error: null,
      profile_json: {
        id: member.legacy_id,
        nombre: member.first_name,
        apellidos: member.last_name ?? "",
        nombreCompleto: member.display_name,
        fotoAlumno: member.photo_url ?? member.legacy_photo_ref ?? "",
        gradoActual: member.grade ?? "",
        gradoObjetivo: nextKidsGrade(member.grade),
        fechaIngreso: formatDisplayDate(member.joined_on),
        antiguedad: seniority(member.joined_on),
        ultimaAsistencia: formatDisplayDate(ranking?.last_attendance_on),
        asistencias30d: ranking?.attendance_30d ?? 0,
        asistencias90d: ranking?.attendance_90d ?? 0,
        diasSinVenir: ranking?.days_without_attendance ?? 0,
        score: ranking?.score ?? 0,
        posicionRanking: ranking?.position ?? "",
        nivelRanking: ranking?.level ?? "",
        mensajeMotivador: ranking?.motivational_message ?? "",
        estadoConstancia: ranking?.constancy_status ?? "",
        notaSensei: latestNote?.note ?? "",
        tipoNota: latestNote?.note_type ?? "",
        fechaNota: formatDisplayDate(latestNote?.note_date),
        avisos: activeNotices.map((notice) => ({
          titulo: notice.title,
          aviso: notice.body,
          color: notice.color,
          fecha: formatDisplayDate(notice.notice_date)
        })),
        comportamiento: {
          fecha: formatDisplayDate(latestBehavior?.report_date),
          actitud: latestBehavior?.attitude ?? "",
          atencion: latestBehavior?.attention ?? "",
          respeto: latestBehavior?.respect ?? "",
          esfuerzo: latestBehavior?.effort ?? "",
          companerismo: latestBehavior?.companionship ?? "",
          observacion: latestBehavior?.observation ?? ""
        },
        actualizado: new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date())
      },
      refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  await supabase.from("child_profile_cache").delete().not("id", "is", null);
  await upsertChunks("child_profile_cache", cacheRows, "legacy_id");
  return cacheRows.length;
}

async function getMemberMap() {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("members")
      .select("id,legacy_id,first_name,last_name,display_name,class,status,grade,photo_url,legacy_photo_ref,ficha_token,joined_on")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    data.forEach((member) => {
      if (member.legacy_id) map.set(member.legacy_id, member);
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function getAttendanceForKids() {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("attendance_logs")
      .select("member_id,attended_on,members!inner(class,status)")
      .eq("members.class", "kids")
      .eq("members.status", "active")
      .order("attended_on", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    data.forEach((row) => {
      if (!map.has(row.member_id)) map.set(row.member_id, []);
      map.get(row.member_id).push(row.attended_on);
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function getRowsByMember(table, dateColumn, filters = {}) {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    let query = supabase.from(table).select("*").range(from, from + pageSize - 1);
    if (dateColumn) query = query.order(dateColumn, { ascending: false, nullsFirst: false });
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query;
    if (error) throw error;
    data.forEach((row) => {
      if (!map.has(row.member_id)) map.set(row.member_id, []);
      map.get(row.member_id).push(row);
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return map;
}

async function getLegacyRows(sheetTitle) {
  const { data: sheet, error: sheetError } = await supabase
    .from("legacy_sheets")
    .select("id")
    .eq("title", sheetTitle)
    .single();
  if (sheetError) throw sheetError;

  const allRows = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("legacy_rows")
      .select("row_data")
      .eq("legacy_sheet_id", sheet.id)
      .order("row_number", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

async function upsertChunks(table, rows, onConflict) {
  for (const chunk of chunks(rows, 200)) {
    if (!chunk.length) continue;
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

function automaticNoticesFor(row) {
  const notices = [];
  if (row.position === 1) {
    notices.push({ title: "Maxima implicacion", body: "Esta liderando el ranking con una constancia excelente.", color: "#dcfce7" });
  }
  if (row.position > 1 && row.position <= 3) {
    notices.push({ title: "Top implicacion", body: "Esta entre los alumnos mas constantes del grupo.", color: "#dbeafe" });
  }
  if (row.attendance_30d >= 4 && row.position > 3) {
    notices.push({ title: "Buena constancia", body: "Esta entrenando de forma regular. Buen trabajo.", color: "#fef9c3" });
  }
  if (row.attendance_30d >= 1 && row.attendance_30d < 4) {
    notices.push({ title: "En progreso", body: "Va mejorando poco a poco. La constancia es la clave.", color: "#fef3c7" });
  }
  if (row.days_without_attendance >= 21 && row.days_without_attendance < 30) {
    notices.push({ title: "Falta continuidad", body: "Hace varias semanas que no entrena. Es importante retomar el habito.", color: "#fee2e2" });
  }
  if (row.days_without_attendance >= 30) {
    notices.push({ title: "Sin actividad reciente", body: "Lleva tiempo sin entrenar. Es importante volver poco a poco.", color: "#fecaca" });
  }
  return notices;
}

function rankingLevel(position, score) {
  if (position === 1 && score > 0) return "Maxima implicacion";
  if (position <= 3 && score > 0) return "Top implicacion";
  if (score >= 16) return "Muy buena constancia";
  if (score >= 8) return "Buena constancia";
  if (score > 0) return "En progreso";
  return "Sin actividad reciente";
}

function constancyStatus(attendance30d, daysWithoutAttendance) {
  if (daysWithoutAttendance >= 30) return "Necesita volver a coger ritmo";
  if (attendance30d >= 4) return "Muy constante";
  if (attendance30d >= 2) return "Buena constancia";
  if (attendance30d >= 1) return "En progreso";
  return "Sin actividad reciente";
}

function motivationalMessage(level, position, attendance30d, daysWithoutAttendance) {
  if (level === "Maxima implicacion") return "Esta entrenando con una constancia excelente.";
  if (level === "Top implicacion") return "Muy buen ritmo. Esta entre los alumnos mas constantes.";
  if (level === "Muy buena constancia") return "Buen trabajo. La constancia se esta notando.";
  if (daysWithoutAttendance >= 30) return "Ahora lo importante es recuperar el habito poco a poco.";
  if (attendance30d <= 0) return "Cada vuelta al tatami cuenta. Lo importante es seguir.";
  return "Va progresando. Con constancia seguira mejorando.";
}

function nextKidsGrade(value) {
  const grades = ["MINARAI", "BLANCO-AMARILLO", "5 KYU", "AMARILLO-NARANJA", "4 KYU", "NARANJA-VERDE", "3 KYU", "VERDE-AZUL", "2 KYU", "AZUL-MARRON", "1 KYU"];
  const normalized = normalizeGrade(value);
  const index = grades.indexOf(normalized);
  return index >= 0 && index < grades.length - 1 ? grades[index + 1] : "";
}

function normalizeGrade(value) {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  const aliases = {
    BLANCO: "MINARAI",
    "5KYU": "5 KYU",
    AMARILLO: "5 KYU",
    "4KYU": "4 KYU",
    NARANJA: "4 KYU",
    "3KYU": "3 KYU",
    VERDE: "3 KYU",
    "2KYU": "2 KYU",
    AZUL: "2 KYU",
    "1KYU": "1 KYU",
    MARRON: "1 KYU"
  };
  return aliases[normalized] ?? normalized;
}

function countSince(dates, days) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  return dates.filter((date) => parseIsoDate(date) >= cutoff).length;
}

function seniority(dateText) {
  const date = parseIsoDate(dateText);
  if (!date) return "";
  let months = (today.getFullYear() - date.getFullYear()) * 12 + today.getMonth() - date.getMonth();
  if (today.getDate() < date.getDate()) months -= 1;
  if (months < 1) return "Menos de 1 mes";
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${months} meses`;
  if (!rest) return `${years} ano${years > 1 ? "s" : ""}`;
  return `${years} ano${years > 1 ? "s" : ""} y ${rest} meses`;
}

function formatDisplayDate(dateText) {
  const date = parseIsoDate(dateText);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-ES").format(date);
}

function parseIsoDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

function parseDate(value) {
  const text = clean(value);
  if (!text || text === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseBool(value, defaultValue = false) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ["true", "verdadero", "si", "sí", "1", "x", "activo"].includes(normalized);
}

function isAutomaticLegacyTitle(value) {
  const title = clean(value).toLowerCase();
  return ["maxima implicacion", "top implicacion", "buena constancia", "en progreso", "falta continuidad", "sin actividad reciente"].some((needle) =>
    title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(needle)
  );
}

function first(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

function cleanEnv(value) {
  return value?.replace(/^\uFEFF/, "").trim().replace(/^["']|["']$/g, "");
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
