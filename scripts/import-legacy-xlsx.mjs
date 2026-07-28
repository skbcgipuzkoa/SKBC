import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

const spreadsheetId = "1GGVrz7UVNhlDu-NaE9qGs4U2bxXkh7pzXfdixTjYDrc";
const sourceTitle = "shorinji_kempo_club";
const sourceUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

const [, , xlsxPath] = process.argv;

if (!xlsxPath || !existsSync(xlsxPath)) {
  console.error("Usage: npm run import:legacy:xlsx -- <path-to-shorinji_kempo_club.xlsx>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(xlsxPath);

const importRunId = randomUUID();

const spreadsheetRecord = {
  google_spreadsheet_id: spreadsheetId,
  title: sourceTitle,
  locale: "es_ES",
  time_zone: "America/Los_Angeles",
  source_url: sourceUrl,
  notes: "Imported from read-only XLSX export."
};

const { data: spreadsheet, error: spreadsheetError } = await supabase
  .from("legacy_spreadsheets")
  .upsert(spreadsheetRecord, { onConflict: "google_spreadsheet_id" })
  .select("id")
  .single();

if (spreadsheetError) throw spreadsheetError;

const { error: runError } = await supabase.from("import_runs").insert({
  id: importRunId,
  source: xlsxPath,
  legacy_spreadsheet_id: spreadsheet.id,
  status: "running",
  summary: { worksheets: workbook.worksheets.length }
});

if (runError) throw runError;

const summary = {
  worksheets: workbook.worksheets.length,
  sheets: [],
  rows: 0,
  normalized: { members: 0 }
};

try {
  for (const worksheet of workbook.worksheets) {
    const headers = readRowValues(worksheet.getRow(1)).map((value) => normalizeHeader(value));
    const sheetRecord = {
      legacy_spreadsheet_id: spreadsheet.id,
      google_sheet_id: Number.isSafeInteger(worksheet.id) ? worksheet.id : worksheet.orderNo,
      title: worksheet.name,
      sheet_index: worksheet.orderNo,
      row_count: worksheet.actualRowCount,
      column_count: worksheet.actualColumnCount,
      hidden: worksheet.state === "hidden" || worksheet.state === "veryHidden",
      header_row: 1,
      headers
    };

    const { data: legacySheet, error: sheetError } = await supabase
      .from("legacy_sheets")
      .upsert(sheetRecord, { onConflict: "legacy_spreadsheet_id,title" })
      .select("id")
      .single();

    if (sheetError) throw sheetError;

    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = readRowValues(row);
      if (values.every((value) => value === "")) return;

      rows.push({
        legacy_sheet_id: legacySheet.id,
        row_number: rowNumber,
        row_values: values,
        row_data: toRowObject(headers, values)
      });
    });

    await replaceRows(legacySheet.id, rows);
    summary.sheets.push({ title: worksheet.name, rows: rows.length });
    summary.rows += rows.length;

    if (worksheet.name === "Sheet1") {
      summary.normalized.members = await upsertMembers(rows);
    }
  }

  await supabase
    .from("import_runs")
    .update({ status: "completed", finished_at: new Date().toISOString(), summary })
    .eq("id", importRunId);

  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  await supabase
    .from("import_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      summary,
      error: error instanceof Error ? error.message : String(error)
    })
    .eq("id", importRunId);
  throw error;
}

function readRowValues(row) {
  const values = [];
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    values[colNumber - 1] = cellToString(cell.value);
  });
  return values.map((value) => value ?? "");
}

function cellToString(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("result" in value) return cellToString(value.result);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("hyperlink" in value) return String(value.hyperlink ?? "");
  }
  return String(value);
}

function normalizeHeader(value) {
  return String(value ?? "").trim();
}

function toRowObject(headers, values) {
  const row = {};
  values.forEach((value, index) => {
    const header = headers[index] || `COL_${index + 1}`;
    row[header] = value;
  });
  return row;
}

async function replaceRows(legacySheetId, rows) {
  const { error: deleteError } = await supabase
    .from("legacy_rows")
    .delete()
    .eq("legacy_sheet_id", legacySheetId);

  if (deleteError) throw deleteError;

  for (const chunk of chunks(rows, 500)) {
    const { error } = await supabase.from("legacy_rows").insert(chunk);
    if (error) throw error;
  }
}

async function upsertMembers(rows) {
  const members = rows
    .map(({ row_data: row }) => ({
      legacy_id: clean(row.ID),
      first_name: clean(row.Nombre),
      last_name: clean(row.Apellidos),
      guardian_name: clean(row.Tutor),
      guardian_phone: clean(row["Teléfono Tutor"]),
      student_phone: clean(row["Teléfono Alumno"]),
      family_email: clean(row.EmailFamilia),
      address: clean(row["Dirección"]),
      joined_on: parseDate(row["Fecha Ingreso"]),
      class: normalizeClass(row.Clase),
      status: normalizeStatus(row.Estado),
      grade: clean(row["Grado"]) || clean(row["Grado "]),
      photo_url: clean(row.AlumnoFotoURL),
      legacy_photo_ref: clean(row.AlumnoFoto),
      ficha_token: clean(row.TOKEN_FICHA_WEB) || null,
      legacy_ficha_url: clean(row.URL_FICHA_WEB) || clean(row.FICHA_PERSONAL),
      ika_id: clean(row["ID de IKA"]) || clean(row.IKA_ID) || null
    }))
    .filter((member) => member.legacy_id && member.first_name && member.class);

  for (const chunk of chunks(members, 200)) {
    const { error } = await supabase
      .from("members")
      .upsert(chunk, { onConflict: "legacy_id" });
    if (error) throw error;
  }

  return members.length;
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

function clean(value) {
  return String(value ?? "").trim();
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}
