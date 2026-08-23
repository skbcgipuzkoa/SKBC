import { createSign } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_LEGACY_SPREADSHEET_ID = "1GGVrz7UVNhlDu-NaE9qGs4U2bxXkh7pzXfdixTjYDrc";
const sheetsScope = "https://www.googleapis.com/auth/spreadsheets";

type MemberSnapshot = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
};

type ExamSnapshot = {
  id: string;
  exam_date: string;
  member_id: string;
  grade: string;
  cycle_attendance: number | null;
  examiner: string | null;
  registered_by: string | null;
  diploma_url: string | null;
};

type CourseSnapshot = {
  id: string;
  kind: "national" | "international" | "taikai";
  course_date: string;
  member_id: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
  notes: string | null;
  legacy_id: string | null;
};

type AttendanceSnapshot = {
  id: string;
  legacy_id: string | null;
  class_id: string | null;
  member_id: string;
  attended_on: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_role: string;
  use_for_history: boolean | null;
};

type ClassSnapshot = {
  id: string;
  legacy_id: string | null;
  class_group: "kids" | "adults";
};

export async function syncLegacyExam(examId: string) {
  const supabase = createAdminClient();
  const { data: exam, error } = await supabase
    .from("exams")
    .select("id,exam_date,member_id,grade,cycle_attendance,examiner,registered_by,diploma_url")
    .eq("id", examId)
    .single<ExamSnapshot>();

  if (error || !exam) throw error ?? new Error("Examen no encontrado para sincronizar.");
  const member = await getMemberSnapshot(exam.member_id);
  const row = [
    exam.exam_date,
    member.legacy_id ?? "",
    member.display_name,
    member.class === "kids" ? "NIÑOS" : "ADULTOS",
    exam.grade,
    exam.cycle_attendance ?? 0,
    exam.examiner ?? "",
    exam.registered_by ?? "WEB SKBC",
    "",
    exam.diploma_url ?? ""
  ];

  await appendLegacyRow({
    eventType: "exam.created",
    targetSheet: "EXAMENES",
    sourceTable: "exams",
    sourceId: exam.id,
    payload: { exam, member },
    values: row
  });
}

export async function syncLegacyCourse(courseId: string) {
  const supabase = createAdminClient();
  const { data: course, error } = await supabase
    .from("courses")
    .select("id,kind,course_date,member_id,location,title,sensei,notes,legacy_id")
    .eq("id", courseId)
    .single<CourseSnapshot>();

  if (error || !course) throw error ?? new Error("Curso no encontrado para sincronizar.");
  const member = await getMemberSnapshot(course.member_id);
  const row = [
    course.course_date,
    member.legacy_id ?? "",
    course.location ?? "",
    course.title ?? "",
    course.sensei ?? "",
    course.notes ?? "",
    course.legacy_id ?? `CURS-NEW-${course.id.slice(0, 8)}`,
    new Date().toISOString()
  ];

  await appendLegacyRow({
    eventType: "course.created",
    targetSheet: course.kind === "international" ? "CURSOS_INT" : "CURSOS_NAC",
    sourceTable: "courses",
    sourceId: course.id,
    payload: { course, member },
    values: row
  });
}

export async function syncLegacyAttendance(attendanceId: string) {
  const supabase = createAdminClient();
  const { data: attendance, error } = await supabase
    .from("attendance_logs")
    .select("id,legacy_id,class_id,member_id,attended_on,official_grade,trained_grade,technical_role,use_for_history")
    .eq("id", attendanceId)
    .single<AttendanceSnapshot>();

  if (error || !attendance) throw error ?? new Error("Asistencia no encontrada para sincronizar.");
  const member = await getMemberSnapshot(attendance.member_id);
  const clase = attendance.class_id ? await getClassSnapshot(attendance.class_id) : null;

  await appendLegacyRow({
    eventType: "attendance.saved",
    targetSheet: "ASISTENCIAS_LOG",
    sourceTable: "attendance_logs",
    sourceId: attendance.id,
    payload: { attendance, member, class: clase },
    values: [
      attendance.attended_on,
      member.legacy_id ?? "",
      clase?.class_group === "kids" ? "Niños" : "Adultos",
      clase?.legacy_id ?? attendance.class_id ?? "",
      attendance.official_grade ?? "",
      attendance.trained_grade ?? "",
      attendance.technical_role ?? "student",
      "",
      attendance.use_for_history ?? true
    ]
  });
}

export async function syncLegacyChildNote(input: {
  memberId: string;
  legacyId: string;
  noteDate: string;
  noteType: string;
  note: string;
  visibleFamily: boolean;
  author: string;
}) {
  const member = await getMemberSnapshot(input.memberId);
  await appendLegacyRow({
    eventType: "child_note.saved",
    targetSheet: "NINOS_NOTAS_SENSEI",
    sourceTable: "child_notes",
    sourceId: `MANUAL-NOTE-${input.legacyId}`,
    payload: input,
    values: [
      member.legacy_id ?? input.legacyId,
      firstName(member.display_name),
      lastName(member.display_name),
      input.noteDate,
      input.noteType,
      input.note,
      input.visibleFamily,
      input.author
    ]
  });
}

export async function syncLegacyChildBehavior(input: {
  memberId: string;
  legacyId: string;
  reportDate: string;
  attitude: string | null;
  attention: string | null;
  respect: string | null;
  effort: string | null;
  companionship: string | null;
  observation: string | null;
}) {
  const member = await getMemberSnapshot(input.memberId);
  await appendLegacyRow({
    eventType: "child_behavior.saved",
    targetSheet: "NINOS_COMPORTAMIENTO",
    sourceTable: "child_behavior_reports",
    sourceId: `MANUAL-BEHAVIOR-${input.legacyId}`,
    payload: input,
    values: [
      member.legacy_id ?? input.legacyId,
      firstName(member.display_name),
      lastName(member.display_name),
      input.reportDate,
      input.attitude ?? "",
      input.attention ?? "",
      input.respect ?? "",
      input.effort ?? "",
      input.companionship ?? "",
      input.observation ?? ""
    ]
  });
}

async function appendLegacyRow({
  eventType,
  targetSheet,
  sourceTable,
  sourceId,
  payload,
  values
}: {
  eventType: string;
  targetSheet: string;
  sourceTable: string;
  sourceId: string;
  payload: unknown;
  values: unknown[];
}) {
  const supabase = createAdminClient();
  const spreadsheetId = legacySpreadsheetId();

  const { data: completedJob, error: completedError } = await supabase
    .from("legacy_sheet_sync_jobs")
    .select("id")
    .eq("event_type", eventType)
    .eq("target_sheet", targetSheet)
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (completedError) throw completedError;
  if (completedJob) return;

  const { data: job, error: jobError } = await supabase
    .from("legacy_sheet_sync_jobs")
    .insert({
      event_type: eventType,
      target_sheet: targetSheet,
      target_spreadsheet_id: spreadsheetId,
      source_table: sourceTable,
      source_id: sourceId,
      payload: { data: payload, values },
      status: "running",
      attempts: 1,
      started_at: new Date().toISOString()
    })
    .select("id")
    .single<{ id: string }>();

  if (jobError || !job) throw jobError ?? new Error("No se pudo crear la cola de sincronizacion legacy.");

  try {
    await appendSheetValues(spreadsheetId, targetSheet, values);
    await supabase
      .from("legacy_sheet_sync_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id);
  } catch (error) {
    await supabase
      .from("legacy_sheet_sync_jobs")
      .update({ status: "failed", error_message: errorMessage(error), updated_at: new Date().toISOString() })
      .eq("id", job.id);
    throw error;
  }
}

export async function retryLegacySheetSyncJob(jobId: string) {
  const supabase = createAdminClient();
  const { data: job, error } = await supabase
    .from("legacy_sheet_sync_jobs")
    .select("id,target_spreadsheet_id,target_sheet,payload,attempts,status")
    .eq("id", jobId)
    .single<{
      id: string;
      target_spreadsheet_id: string;
      target_sheet: string;
      payload: { values?: unknown[] } | null;
      attempts: number;
      status: string;
    }>();

  if (error || !job) throw error ?? new Error("Trabajo de sincronizacion no encontrado.");
  if (job.status === "completed") return;
  if (!Array.isArray(job.payload?.values)) {
    throw new Error("Este trabajo no tiene valores preparados para reintento.");
  }

  await supabase
    .from("legacy_sheet_sync_jobs")
    .update({
      status: "running",
      attempts: (job.attempts ?? 0) + 1,
      started_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", job.id);

  try {
    await appendSheetValues(job.target_spreadsheet_id, job.target_sheet, job.payload.values);
    await supabase
      .from("legacy_sheet_sync_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id);
  } catch (retryError) {
    await supabase
      .from("legacy_sheet_sync_jobs")
      .update({ status: "failed", error_message: errorMessage(retryError), updated_at: new Date().toISOString() })
      .eq("id", job.id);
    throw retryError;
  }
}

async function appendSheetValues(spreadsheetId: string, sheetName: string, values: unknown[]) {
  const token = await getGoogleAccessToken();
  const range = encodeURIComponent(`'${sheetName}'!A:Z`);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ values: [values] })
    }
  );

  if (!response.ok) throw new Error(`Google Sheets error ${response.status}: ${await response.text()}`);
}

async function getMemberSnapshot(memberId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("members")
    .select("id,legacy_id,display_name,class")
    .eq("id", memberId)
    .single<MemberSnapshot>();

  if (error || !data) throw error ?? new Error("Kenshi no encontrado para sincronizar.");
  return data;
}

async function getClassSnapshot(classId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("classes")
    .select("id,legacy_id,class_group")
    .eq("id", classId)
    .single<ClassSnapshot>();

  if (error || !data) throw error ?? new Error("Clase no encontrada para sincronizar.");
  return data;
}

async function getGoogleAccessToken() {
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return getGoogleOAuthAccessToken();
  }

  const clientEmail = requiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: sheetsScope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${jwtHeader}.${jwtClaim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error(`Google auth error ${response.status}: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google no devolvio access_token.");
  return data.access_token;
}

async function getGoogleOAuthAccessToken() {
  const body = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error(`Google OAuth error ${response.status}: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google OAuth no devolvio access_token.");
  return data.access_token;
}

function legacySpreadsheetId() {
  return cleanEnv(process.env.LEGACY_GOOGLE_SPREADSHEET_ID) || DEFAULT_LEGACY_SPREADSHEET_ID;
}

function requiredEnv(name: string) {
  const value = cleanEnv(process.env[name]);
  if (!value) throw new Error(`Missing env var ${name}.`);
  return value;
}

function cleanEnv(value: string | undefined) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

function lastName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Error desconocido.");
}
