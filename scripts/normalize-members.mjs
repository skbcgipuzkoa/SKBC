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

const rows = await getLegacyRows("Sheet1");
const members = rows
  .map(({ row_data: row }) => ({
    legacy_id: clean(row.ID),
    first_name: clean(row.Nombre),
    last_name: clean(row.Apellidos) || null,
    guardian_name: clean(row.Tutor) || null,
    guardian_phone: clean(row["Teléfono Tutor"]) || null,
    student_phone: clean(row["Teléfono Alumno"]) || null,
    family_email: clean(row.EmailFamilia) || null,
    address: clean(row["Dirección"]) || null,
    joined_on: parseDate(row["Fecha Ingreso"]),
    class: normalizeClass(row.Clase),
    status: normalizeStatus(row.Estado),
    grade: clean(row["Grado"]) || clean(row["Grado "]) || null,
    photo_url: clean(row.AlumnoFotoURL) || null,
    legacy_photo_ref: clean(row.AlumnoFoto) || null,
    ficha_token: clean(row.TOKEN_FICHA_WEB) || null,
    legacy_ficha_url: clean(row.URL_FICHA_WEB) || clean(row.FICHA_PERSONAL) || null,
    ika_id: clean(row["ID de IKA"]) || clean(row.IKA_ID) || null,
    attendance_count: parseInteger(row.Asistencias),
    exam_history: clean(row["Historial Exámenes"]) || null,
    last_exam_on: parseDate(row["Fecha Ultimo examen"]),
    exam_notice: clean(row.Aviso) || null,
    next_exam_on: parseDate(row.ProximoExamen),
    attendance_history: clean(row.HistorialAsistencias) || null,
    total_attendance: parseInteger(row.AsistenciasTotales),
    semaphore: clean(row.Semaforo) || null,
    attendance_percentage: parseDecimal(row.PorcentajeAsistencia),
    minimum_attendance: parseInteger(row.MinimoAsistencias),
    total_cycle_sessions: parseInteger(row.TotalSesionesCiclo),
    missing_attendance: parseInteger(row.FaltanAsistencias),
    site_url: clean(row.URL_Site) || null,
    legacy_sheet_url: clean(row.ID_FICHA) || clean(row.URL_FICHA) || null,
    legacy_student_sheet_id: clean(row.ID_FICHA_ALUMNO) || null,
    legacy_student_folder_id: clean(row.ID_CARPETA_ALUMNO) || null,
    legacy_student_folder_url: clean(row.URL_CARPETA_ALUMNO) || null,
    parent_sheet_url: clean(row.FICHA_PADRES) || null,
    sensei_notes_link: clean(row.NOTAS_SENSEI) || null,
    updated_at: new Date().toISOString()
  }))
  .filter((member) => member.legacy_id && member.first_name && member.class);

for (const chunk of chunks(members, 200)) {
  const { error } = await supabase.from("members").upsert(chunk, { onConflict: "legacy_id" });
  if (error) throw error;
}

console.log(JSON.stringify({ members: members.length }, null, 2));

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

function normalizeClass(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized.includes("ni")) return "kids";
  if (normalized.includes("adult")) return "adults";
  return null;
}

function normalizeStatus(value) {
  return clean(value).toLowerCase() === "inactivo" ? "inactive" : "active";
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

function parseInteger(value) {
  const text = clean(value);
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

function cleanEnv(value) {
  return value?.replace(/^\uFEFF/, "").trim();
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
