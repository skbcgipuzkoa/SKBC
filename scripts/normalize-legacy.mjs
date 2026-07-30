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
  techniques: 0,
  attendance: 0,
  exams: 0,
  courses: 0,
  technicalGroups: 0,
  technicalPlans: 0,
  assignments: 0,
  dojoHistory: 0,
  memberHistory: 0
};

summary.classes = await normalizeClasses();
summary.techniques = await normalizeTechniques();
summary.attendance = await normalizeAttendance();
summary.exams = await normalizeExams();
summary.courses = await normalizeCourses();
summary.technicalGroups = await normalizeTechnicalGroups();
summary.technicalPlans = await normalizeTechnicalPlans();
summary.assignments = await normalizeAssignments();
summary.dojoHistory = await normalizeDojoHistory();
summary.memberHistory = await normalizeMemberHistory();

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

  for (const chunk of chunks(uniqueByLegacyId(classes), 200)) {
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
      variant: firstClean(row.VARIANTE, row.VARIANTE_TECNICA) ?? detectTechniqueVariant(clean(row.NOMBRE_TECNICA)).variant,
      variant_note: firstClean(row.NOTA_VARIANTE, row.DESCRIPCION_VARIANTE) ?? detectTechniqueVariant(clean(row.NOMBRE_TECNICA)).variantNote,
      category: normalizeTechniqueCategory(row.CATEGORIA),
      content_type: clean(row.TIPO_CONTENIDO) || null,
      summary_es: firstClean(
        row.RESUMEN_ES,
        row.RESUMEN,
        row.Resumen,
        row.DESCRIPCION_ES,
        row.DESCRIPCION,
        row.Descripción,
        row.EXPLICACION,
        row.Explicacion,
        row.DETALLE,
        row.Detalle
      ),
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

  for (const chunk of chunks(uniqueByLegacyId(techniques), 200)) {
    const { error } = await supabase.from("techniques").upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return techniques.length;
}

async function normalizeAttendance() {
  const rows = await getLegacyRows("ASISTENCIAS_LOG");
  const memberMap = await getIdMap("members", "legacy_id");
  const classMap = await getIdMap("classes", "legacy_id");

  const attendance = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.LOG_ID),
      class_id: classMap.get(clean(row.ID_CLASE)) ?? null,
      member_id: memberMap.get(clean(row.ID)),
      attended_on: parseDate(row.Fecha),
      official_grade: clean(row.GRADO_OFICIAL_DEL_DIA) || null,
      trained_grade: clean(row.GRADO_TECNICO_ENTRENADO) || null,
      technical_role: normalizeTechnicalRole(row.ROL_TECNICO_EN_CLASE),
      technical_note: clean(row.OBSERVACION_TECNICA) || null,
      use_for_history: parseBool(row.USAR_PARA_HISTORIAL, true)
    }))
    .filter((item) => item.legacy_id && item.member_id && item.attended_on);

  for (const chunk of chunks(uniqueByLegacyId(attendance), 200)) {
    const { error } = await supabase.from("attendance_logs").upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return attendance.length;
}

async function normalizeExams() {
  const rows = await getLegacyRows("EXAMENES");
  const memberMap = await getIdMap("members", "legacy_id");

  await supabase.from("exams").delete().not("id", "is", null);

  const exams = rows
    .map(({ row_data: row }, index) => ({
      legacy_row: index + 2,
      exam_date: parseDate(row.FechaExamen),
      member_id: memberMap.get(normalizeLegacyKey(row.ID)),
      grade: clean(row.Grado),
      cycle_attendance: parseInteger(row.AsistenciasCiclo),
      examiner: clean(row.Examinador) || null,
      registered_by: clean(row.RegistradoPor) || null,
      diploma_url: clean(row.URL_Diploma) || null,
      report_url: clean(row.InformePDF) || null,
      report_created_at: parseTimestamp(row.InformeCreadoEl),
      report_created_by: clean(row.InformeCreadoPor) || null,
      report_type: clean(row.InformeTipo) || null,
      report_file_name: clean(row.InformeNombreArchivo) || null
    }))
    .filter((item) => item.exam_date && item.member_id && item.grade);

  for (const chunk of chunks(exams, 200)) {
    const { error } = await supabase.from("exams").insert(chunk);
    if (error) throw error;
  }

  return exams.length;
}

async function normalizeCourses() {
  const memberMap = await getIdMap("members", "legacy_id");
  await supabase.from("courses").delete().not("id", "is", null);

  const national = await courseRows("CURSOS_NAC", "national", memberMap);
  const international = await courseRows("CURSOS_INT", "international", memberMap);
  const courses = [...national, ...international];

  for (const chunk of chunks(courses, 200)) {
    const { error } = await supabase.from("courses").insert(chunk);
    if (error) throw error;
  }

  return courses.length;
}

async function normalizeTechnicalGroups() {
  const rows = await getLegacyRows("GRUPOS_TECNICOS_CLASE");
  const classMap = await getIdMap("classes", "legacy_id");

  const groups = rows
    .map(({ row_data: row }) => ({
      class_id: classMap.get(clean(row.ID_CLASE)),
      legacy_id: clean(row.ID_GRUPO_TECNICO),
      grade: clean(row.GRADO_TECNICO) || clean(row.GRADO) || "SIN GRADO",
      active: parseBool(row.ACTIVO, true)
    }))
    .filter((item) => item.class_id && item.legacy_id);

  await supabase.from("class_technical_groups").delete().not("id", "is", null);

  for (const chunk of chunks(groups, 200)) {
    const { error } = await supabase.from("class_technical_groups").insert(chunk);
    if (error) throw error;
  }

  return groups.length;
}

async function normalizeTechnicalPlans() {
  const rows = await getLegacyRows("PLAN_TECNICO_ADULTOS");
  const classMap = await getIdMap("classes", "legacy_id");
  const techniqueMap = await getIdMap("techniques", "legacy_id");
  const groupMap = await getTechnicalGroupMap();

  const plans = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID_PLAN),
      class_id: classMap.get(clean(row.ID_CLASE)),
      technical_group_id: groupMap.get(groupKey(clean(row.ID_CLASE), clean(row.ID_GRUPO_TECNICO))) ?? null,
      class_date: parseDate(row.FECHA),
      session_type: clean(row.TIPO_SESION_TECNICA) || null,
      grade: clean(row.GRADO) || null,
      group_grade: clean(row.GRADO_GRUPO) || null,
      target_grade: clean(row.GRADO_OBJETIVO) || null,
      technique_id: techniqueMap.get(clean(row.ID_TECNICA)) ?? null,
      technique_grade: clean(row.GRADO_TECNICA) || null,
      technique_base: clean(row.TECNICA_BASE) || null,
      technique_name: clean(row.NOMBRE_TECNICA),
      variant: firstClean(row.VARIANTE, row.VARIANTE_TECNICA) ?? detectTechniqueVariant(clean(row.NOMBRE_TECNICA)).variant,
      variant_note: firstClean(row.NOTA_VARIANTE, row.DESCRIPCION_VARIANTE) ?? detectTechniqueVariant(clean(row.NOMBRE_TECNICA)).variantNote,
      category: normalizeTechniqueCategory(row.CATEGORIA),
      content_type: clean(row.TIPO_CONTENIDO) || null,
      summary_es: firstClean(
        row.RESUMEN_ES,
        row.RESUMEN,
        row.Resumen,
        row.DESCRIPCION_ES,
        row.DESCRIPCION,
        row.Descripción,
        row.EXPLICACION,
        row.Explicacion,
        row.DETALLE,
        row.Detalle
      ),
      proposal_type: clean(row.TIPO_PROPUESTA) || null,
      focus: clean(row.ENFOQUE_TECNICO) || null,
      suggested_order: parseInteger(row.ORDEN_SUGERENCIA),
      score_at_that_moment: parseDecimal(row.PUNTUACION_EN_ESE_MOMENTO),
      completed: parseBool(row.REALIZADA),
      notes: clean(row.OBSERVACIONES) || null,
      used_for_history: parseBool(row.USADA_PARA_HISTORIAL)
    }))
    .filter((item) => item.legacy_id && item.class_id && item.class_date && item.technique_name);

  for (const chunk of chunks(uniqueByLegacyId(plans), 200)) {
    const { error } = await supabase.from("technical_plans").upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return plans.length;
}

async function normalizeAssignments() {
  const rows = await getLegacyRows("ASIGNACION_TECNICA_ALUMNO_CLASE");
  const classMap = await getIdMap("classes", "legacy_id");
  const memberMap = await getIdMap("members", "legacy_id");
  const techniqueMap = await getIdMap("techniques", "legacy_id");
  const planMap = await getIdMap("technical_plans", "legacy_id");

  const assignments = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID_ASIGNACION),
      class_id: classMap.get(clean(row.ID_CLASE)),
      plan_id: planMap.get(clean(row.ID_PLAN)) ?? null,
      technique_id: techniqueMap.get(clean(row.ID_TECNICA)) ?? null,
      member_id: memberMap.get(clean(row.ID_ALUMNO)),
      assigned_on: parseDate(row.FECHA),
      group_grade: clean(row.GRADO_GRUPO_ASIGNADO) || null,
      active: parseBool(row.ACTIVO, true),
      completed: parseBool(row.REALIZADA),
      counts_as_progression: parseBool(row.CUENTA_COMO_PROGRESION),
      counts_as_review: parseBool(row.CUENTA_COMO_REPASO),
      counts_for_stats: parseBool(row.CUENTA_PARA_ESTADISTICA, true),
      notes: clean(row.OBSERVACIONES) || null,
      created_by: clean(row.CREADO_POR) || "legacy",
      created_at: parseTimestamp(row.CREADO_EL) ?? new Date().toISOString()
    }))
    .filter((item) => item.legacy_id && item.class_id && item.member_id && item.assigned_on);

  for (const chunk of chunks(uniqueByLegacyId(assignments), 200)) {
    const { error } = await supabase
      .from("member_technique_assignments")
      .upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return assignments.length;
}

async function normalizeDojoHistory() {
  const rows = await getLegacyRows("HISTORIAL_TECNICO_ADULTOS");
  const classMap = await getIdMap("classes", "legacy_id");
  const techniqueMap = await getIdMap("techniques", "legacy_id");
  const groupMap = await getTechnicalGroupMap();

  const history = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID_HISTORIAL),
      class_id: classMap.get(clean(row.ID_CLASE)) ?? null,
      class_date: parseDate(row.FECHA),
      technical_group_id: groupMap.get(groupKey(clean(row.ID_CLASE), clean(row.ID_GRUPO_TECNICO))) ?? null,
      group_grade: clean(row.GRADO_GRUPO) || null,
      target_grade: clean(row.GRADO_OBJETIVO) || null,
      technique_id: techniqueMap.get(clean(row.ID_TECNICA)) ?? null,
      technique_grade: clean(row.GRADO_TECNICA) || null,
      technique_base: clean(row.TECNICA_BASE) || null,
      technique_name: clean(row.NOMBRE_TECNICA),
      category: normalizeTechniqueCategory(row.CATEGORIA),
      content_type: clean(row.TIPO_CONTENIDO) || null,
      proposal_type: clean(row.TIPO_PROPUESTA) || null,
      focus: clean(row.ENFOQUE_TECNICO) || null,
      completed: parseBool(row.REALIZADA),
      counts_repetition: parseBool(row.CONTABILIZA_REPETICION, true),
      notes: clean(row.OBSERVACIONES) || null
    }))
    .filter((item) => item.legacy_id && item.class_date && item.technique_name);

  for (const chunk of chunks(uniqueByLegacyId(history), 200)) {
    const { error } = await supabase
      .from("dojo_technical_history")
      .upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return history.length;
}

async function normalizeMemberHistory() {
  const rows = await getLegacyRows("HISTORIAL_TECNICO_ALUMNOS");
  const classMap = await getIdMap("classes", "legacy_id");
  const memberMap = await getIdMap("members", "legacy_id");
  const techniqueMap = await getIdMap("techniques", "legacy_id");
  const assignmentMap = await getIdMap("member_technique_assignments", "legacy_id");
  const groupMap = await getTechnicalGroupMap();

  const history = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID_HIST_ALUMNO),
      class_id: classMap.get(clean(row.ID_CLASE)) ?? null,
      class_date: parseDate(row.FECHA),
      assignment_id: assignmentMap.get(clean(row.ID_ASIGNACION)) ?? null,
      member_id: memberMap.get(clean(row.ID_ALUMNO)),
      member_grade_at_time: clean(row.GRADO_ALUMNO_EN_ESE_MOMENTO) || null,
      technical_group_id: groupMap.get(groupKey(clean(row.ID_CLASE), clean(row.ID_GRUPO_TECNICO))) ?? null,
      group_grade: clean(row.GRADO_GRUPO) || null,
      target_grade: clean(row.GRADO_OBJETIVO) || null,
      technique_id: techniqueMap.get(clean(row.ID_TECNICA)) ?? null,
      technique_name: clean(row.NOMBRE_TECNICA),
      technique_grade: clean(row.GRADO_TECNICA) || null,
      category: normalizeTechniqueCategory(row.CATEGORIA),
      content_type: clean(row.TIPO_CONTENIDO) || null,
      proposal_type: clean(row.TIPO_PROPUESTA) || null,
      completed: parseBool(row.REALIZADA),
      counts_as_progression: parseBool(row.CUENTA_COMO_PROGRESION),
      counts_as_review: parseBool(row.CUENTA_COMO_REPASO),
      counts_for_stats: parseBool(row.CUENTA_PARA_ESTADISTICA, true),
      notes: clean(row.OBSERVACIONES) || null,
      created_by: clean(row.CREADO_POR) || "legacy",
      created_at: parseTimestamp(row.CREADO_EL) ?? new Date().toISOString()
    }))
    .filter((item) => item.legacy_id && item.class_date && item.member_id && item.technique_name);

  for (const chunk of chunks(uniqueByLegacyId(history), 200)) {
    const { error } = await supabase
      .from("member_technical_history")
      .upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return history.length;
}

async function courseRows(sheetTitle, kind, memberMap) {
  const rows = await getLegacyRows(sheetTitle);
  return rows
    .map(({ row_data: row }) => ({
      kind,
      course_date: parseDate(row.Fecha),
      member_id: memberMap.get(clean(row.ID)),
      location: clean(row.Donde) || null,
      title: clean(row.Curso) || null,
      sensei: clean(row.Sensei) || null,
      notes: clean(row.Notas) || null,
      legacy_id: clean(row.LOG_ID) || null
    }))
    .filter((item) => item.course_date && item.member_id);
}

async function getIdMap(table, legacyColumn) {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`id,${legacyColumn}`)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    data.forEach((row) => {
      if (row[legacyColumn]) {
        map.set(String(row[legacyColumn]), row.id);
        map.set(normalizeLegacyKey(row[legacyColumn]), row.id);
      }
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return map;
}

async function getTechnicalGroupMap() {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("class_technical_groups")
      .select("id,legacy_id,classes(legacy_id)")
      .range(from, from + pageSize - 1);

    if (error) throw error;
    data.forEach((row) => {
      const classLegacyId = row.classes?.legacy_id;
      if (classLegacyId && row.legacy_id) map.set(groupKey(classLegacyId, row.legacy_id), row.id);
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return map;
}

function groupKey(classLegacyId, groupLegacyId) {
  return `${classLegacyId}::${groupLegacyId}`;
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

function normalizeTechnicalRole(value) {
  const normalized = clean(value).toLowerCase();
  if (normalized.includes("ense")) return "teaching";
  if (normalized.includes("apoyo")) return "support";
  if (normalized.includes("repas")) return "reviewing";
  if (normalized.includes("observ")) return "observing";
  return "student";
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

function parseTimestamp(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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

function firstClean(...values) {
  const value = values.map((item) => clean(item)).find(Boolean);
  return value || null;
}

function detectTechniqueVariant(name) {
  const normalized = clean(name).toLowerCase();
  if (normalized.includes("katate")) return { variant: "Katate", variantNote: "Agarre 1 a 1." };
  if (normalized.includes("morote")) return { variant: "Morote", variantNote: "Agarre 2 a 1." };
  if (normalized.includes("ryote")) return { variant: "Ryote", variantNote: "Agarre 2 a 2." };
  if (/\bura\b/.test(normalized)) return { variant: "Ura", variantNote: "Variante por fuera." };
  if (/\bomote\b/.test(normalized)) return { variant: "Omote", variantNote: "Variante por dentro." };
  return { variant: null, variantNote: null };
}

function normalizeLegacyKey(value) {
  const text = clean(value);
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text !== "") return String(Math.trunc(numeric));
  return text;
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

function uniqueByLegacyId(items) {
  const map = new Map();
  items.forEach((item) => {
    map.set(item.legacy_id, item);
  });
  return [...map.values()];
}
