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

const summary = {
  classes: 0,
  techniques: 0
};

summary.classes = await normalizeClasses();
summary.techniques = await normalizeTechniques();

console.log(JSON.stringify(summary, null, 2));

async function normalizeClasses() {
  const rows = await getLegacyRows("CLASES_ADULTOS");
  const classes = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID_CLASE),
      class_date: parseDate(row.FECHA),
      name: clean(row.NOMBRE_CLASE) || clean(row.ID_CLASE) || "Clase sin nombre",
      class_group: normalizeMemberClass(row.GRUPO) ?? "adults",
      class_type: clean(row.TIPO_CLASE) || null,
      responsible: clean(row.RESPONSABLE) || null,
      notes: clean(row.OBSERVACIONES) || null,
      plan_generated: parseBool(row.PLAN_GENERADO),
      closed: parseBool(row.CLASE_CERRADA),
      status: normalizeClassStatus(row.ESTADO),
      updated_at: new Date().toISOString()
    }))
    .filter((item) => item.legacy_id && item.class_date);

  for (const chunk of chunks(classes, 200)) {
    const { error } = await supabase.from("classes").upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return classes.length;
}

async function normalizeTechniques() {
  const rows = await getLegacyRows("TECNICAS_ADULTOS");
  const techniques = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID_TECNICA),
      grade: clean(row.GRADO) || "SIN GRADO",
      base_name: clean(row.TECNICA_BASE) || null,
      name: clean(row.NOMBRE_TECNICA),
      category: normalizeTechniqueCategory(row.CATEGORIA),
      content_type: clean(row.TIPO_CONTENIDO) || null,
      program_order: parseInteger(row.ORDEN_PROGRAMA),
      curriculum_order: parseInteger(row.ORDEN_CURRICULAR),
      active: parseBool(row.ACTIVA, true),
      active_in_planning: parseBool(row.ACTIVA_EN_PLANIFICACION, true),
      force_next: parseBool(row.FORZAR_PROXIMA),
      score: parseDecimal(row.PUNTUACION),
      repetitions: parseInteger(row.REPETICIONES) ?? 0,
      last_trained_on: parseDate(row.ULTIMA_VEZ_ENTRENADA),
      updated_at: new Date().toISOString()
    }))
    .filter((item) => item.legacy_id && item.name && item.category);

  for (const chunk of chunks(techniques, 200)) {
    const { error } = await supabase.from("techniques").upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return techniques.length;
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

function normalizeMemberClass(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized.includes("ni")) return "kids";
  if (normalized.includes("adult")) return "adults";
  return null;
}

function normalizeClassStatus(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("impart")) return "completed";
  return "pending";
}

function normalizeTechniqueCategory(value) {
  const normalized = clean(value).toLowerCase();
  const map = {
    goho: "goho",
    juho: "juho",
    seiho: "seiho",
    ukemi: "ukemi",
    randori: "randori",
    embu: "embu",
    hokei: "hokei",
    kihon: "kihon"
  };
  return map[normalized] ?? null;
}

function parseBool(value, defaultValue = false) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return defaultValue;
  return ["true", "verdadero", "si", "sí", "1", "x"].includes(normalized);
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
  if (!text) return 0;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
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
