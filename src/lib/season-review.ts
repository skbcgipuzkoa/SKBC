import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

type MemberRow = {
  id: string;
  legacy_id: string | null;
  ika_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  status: string | null;
  grade: string | null;
  joined_on: string | null;
  birth_date: string | null;
  last_exam_on: string | null;
  next_exam_on: string | null;
  semaphore: string | null;
  attendance_count: number | null;
  attendance_percentage: number | null;
  minimum_attendance: number | null;
  missing_attendance: number | null;
  family_email: string | null;
  guardian_phone: string | null;
  student_phone: string | null;
  photo_url: string | null;
};

type ClassRow = {
  class_date: string;
  class_group: "kids" | "adults";
  closed: boolean;
};

type CalendarClosure = {
  starts_on: string;
  ends_on: string;
  title?: string | null;
  applies_to: "all" | "kids" | "adults";
};

type AttendanceRow = {
  attended_on: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_role: string | null;
};

type TechnicalRow = {
  class_date: string;
  technique_id: string | null;
  technique_name: string;
  category: string | null;
  grade: string | null;
  trained_grade: string | null;
  counts_as_progression: boolean;
  completed: boolean;
};

type CourseRow = {
  kind: "national" | "international" | "taikai";
  course_date: string;
  title: string | null;
  location: string | null;
  sensei: string | null;
  competition_category: string | null;
  competition_result: string | null;
  competition_medal: string | null;
  competition_notes: string | null;
};

type ExamRow = {
  exam_date: string;
  grade: string;
  cycle_attendance?: number | null;
  examiner: string | null;
  registered_by?: string | null;
  result: string | null;
  report_url: string | null;
  diploma_url: string | null;
};

type LegacyExamRow = {
  row_number: number;
  row_data: Record<string, unknown>;
  legacy_sheets: { title: string } | null;
};

type BehaviorRow = {
  report_date: string | null;
  attitude: string | null;
  attention: string | null;
  respect: string | null;
  effort: string | null;
  companionship: string | null;
  observation: string | null;
};

type SpecialRow = {
  status?: string | null;
  notes: string | null;
  black_belt_special_classes?: { class_date: string; title: string | null; instructor: string | null } | null;
  shakujo_classes?: { class_date: string; title: string | null; instructor: string | null } | null;
};

type ReviewData = {
  member: MemberRow;
  from: string;
  to: string;
  classDates: string[];
  attendedDates: string[];
  attendance: AttendanceRow[];
  attendanceRate: number | null;
  classCoverageReliable: boolean;
  techniques: TechnicalRow[];
  courseCounts: Record<string, number>;
  courses: CourseRow[];
  exams: ExamRow[];
  behavior: BehaviorRow[];
  busen: SpecialRow[];
  shakujo: SpecialRow[];
  closures: CalendarClosure[];
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
};

const PAGE = { width: 595, height: 842, left: 48, right: 547, bottom: 52, top: 790 };
const navy = rgb(0.05, 0.1, 0.2);
const blue = rgb(0.02, 0.32, 0.67);
const gold = rgb(0.74, 0.56, 0.2);
const muted = rgb(0.42, 0.47, 0.56);
const soft = rgb(0.96, 0.98, 1);

export async function renderSeasonReviewPdf(memberId: string, from?: string | null, to?: string | null) {
  return renderSeasonReviewBatchPdf([memberId], from, to);
}

export async function renderSeasonReviewBatchPdf(memberIds: string[], from?: string | null, to?: string | null) {
  const ids = unique(memberIds).slice(0, 80);
  if (!ids.length) throw new Error("No hay kenshis seleccionados.");

  const reviews: ReviewData[] = [];
  for (const id of ids) reviews.push(await buildReviewData(id, from, to));
  return renderPdf(reviews);
}

async function buildReviewData(memberId: string, from?: string | null, to?: string | null): Promise<ReviewData> {
  const supabase = createAdminClient();
  const requestedTo = parseDateParam(to) ?? todayIso();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id,legacy_id,ika_id,display_name,class,status,grade,joined_on,birth_date,last_exam_on,next_exam_on,semaphore,attendance_count,attendance_percentage,minimum_attendance,missing_attendance,family_email,guardian_phone,student_phone,photo_url")
    .eq("id", memberId)
    .single<MemberRow>();

  if (memberError || !member) throw new Error("Kenshi no encontrado.");

  const requestedFrom = parseDateParam(from) ?? member.joined_on ?? `${requestedTo.slice(0, 4)}-01-01`;
  const analysisFrom = maxIso(requestedFrom, member.joined_on ?? requestedFrom);

  const [classesResult, attendanceResult, techniquesResult, coursesResult, examsResult, behaviorResult, busenResult, shakujoResult, closuresResult] = await Promise.all([
    supabase.from("classes").select("class_date,class_group,closed").eq("class_group", member.class).eq("closed", true).gte("class_date", analysisFrom).lte("class_date", requestedTo).returns<ClassRow[]>(),
    supabase.from("attendance_logs").select("attended_on,official_grade,trained_grade,technical_role").eq("member_id", member.id).gte("attended_on", analysisFrom).lte("attended_on", requestedTo).order("attended_on", { ascending: true }).returns<AttendanceRow[]>(),
    supabase.from("member_technical_history").select("class_date,technique_id,technique_name,category,grade,trained_grade,counts_as_progression,completed").eq("member_id", member.id).eq("completed", true).gte("class_date", analysisFrom).lte("class_date", requestedTo).order("class_date", { ascending: true }).returns<TechnicalRow[]>(),
    supabase.from("courses").select("kind,course_date,title,location,sensei,competition_category,competition_result,competition_medal,competition_notes").eq("member_id", member.id).gte("course_date", analysisFrom).lte("course_date", requestedTo).order("course_date", { ascending: true }).returns<CourseRow[]>(),
    supabase.from("exams").select("exam_date,grade,cycle_attendance,examiner,registered_by,result,report_url,diploma_url").eq("member_id", member.id).gte("exam_date", analysisFrom).lte("exam_date", requestedTo).order("exam_date", { ascending: true }).returns<ExamRow[]>(),
    supabase.from("child_behavior_reports").select("report_date,attitude,attention,respect,effort,companionship,observation").eq("member_id", member.id).order("report_date", { ascending: false }).limit(8).returns<BehaviorRow[]>(),
    supabase.from("black_belt_special_attendance").select("status,notes,black_belt_special_classes(class_date,title,instructor)").eq("member_id", member.id).order("created_at", { ascending: false }).limit(12).returns<SpecialRow[]>(),
    supabase.from("shakujo_attendance").select("notes,shakujo_classes(class_date,title,instructor)").eq("member_id", member.id).order("created_at", { ascending: false }).limit(12).returns<SpecialRow[]>(),
    supabase
      .from("club_calendar_closures")
      .select("starts_on,ends_on,title,applies_to")
      .or(`applies_to.eq.all,applies_to.eq.${member.class}`)
      .lte("starts_on", requestedTo)
      .gte("ends_on", analysisFrom)
      .eq("active", true)
      .returns<CalendarClosure[]>()
  ]);

  const attendedDates = unique((attendanceResult.data ?? []).map((item) => item.attended_on)).sort();
  const closures = closuresResult.data ?? [];
  const classDates = buildPossibleClassDates(
    analysisFrom,
    requestedTo,
    member.class,
    closures,
    (classesResult.data ?? []).map((item) => item.class_date)
  );
  const classCoverageReliable = classDates.length >= attendedDates.length;
  const attendanceRate = classDates.length && classCoverageReliable ? Math.round((attendedDates.length / classDates.length) * 100) : null;

  const legacyExams = await loadLegacyExams(supabase, member.legacy_id, analysisFrom, requestedTo);
  const mergedExams = mergeExams(examsResult.data ?? [], legacyExams);

  return {
    member,
    from: analysisFrom,
    to: requestedTo,
    classDates,
    attendedDates,
    attendance: attendanceResult.data ?? [],
    attendanceRate,
    classCoverageReliable,
    techniques: techniquesResult.data ?? [],
    courses: coursesResult.data ?? [],
    exams: mergedExams,
    behavior: behaviorResult.error ? [] : behaviorResult.data ?? [],
    busen: busenResult.error ? [] : busenResult.data ?? [],
    shakujo: shakujoResult.error ? [] : shakujoResult.data ?? [],
    closures,
    courseCounts: countCourses(coursesResult.data ?? [])
  };
}

async function renderPdf(reviews: ReviewData[]) {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique)
  };

  for (const review of reviews) {
    await drawCoverPage(doc, fonts, review);
    drawPersonalPage(doc, fonts, review);
    drawDevelopmentPage(doc, fonts, review);
    drawNextStepsPage(doc, fonts, review);
    drawClubPage(doc, fonts, review);
  }

  return Buffer.from(await doc.save());
}

async function drawCoverPage(doc: PDFDocument, fonts: Fonts, input: ReviewData) {
  const page = newPage(doc);
  page.drawRectangle({ x: 34, y: 720, width: 527, height: 88, color: navy });
  page.drawRectangle({ x: 34, y: 720, width: 527, height: 5, color: gold });
  await drawLogo(doc, page, 48, 735, 56);
  await drawMemberPhoto(doc, page, input.member.photo_url, 448, 604, 92);

  page.drawText("SKBC Gipuzkoa", { x: 116, y: 774, size: 18, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText("Informe personal de temporada", { x: 116, y: 748, size: 13, font: fonts.regular, color: rgb(0.82, 0.88, 0.96) });
  page.drawText(`${formatDate(input.from)} - ${formatDate(input.to)}`, { x: 390, y: 750, size: 11, font: fonts.bold, color: rgb(1, 1, 1) });

  drawWrapped(page, "Review oficial", 70, 670, 420, 12, 16, fonts.bold, gold);
  const nameY = drawTitleWrapped(page, input.member.display_name, 70, 632, 330, fonts.bold, navy);
  drawWrapped(page, `${input.member.class === "kids" ? "Ficha infantil" : "Ficha adulta"} - ${input.member.grade ?? "Sin grado"}`, 70, nameY - 6, 330, 13, 17, fonts.regular, muted);

  const message = input.member.class === "kids" ? childMotivationalMessage(input) : motivationalMessage(input);
  drawWrapped(page, message, 70, 540, 455, 14, 20, fonts.italic, navy);

  const cards = statCards(input);
  cards.forEach((card, index) => {
    const x = 70 + (index % 2) * 230;
    const y = 410 - Math.floor(index / 2) * 92;
    drawStatCard(page, x, y, card[0], card[1], card[2], fonts.bold, fonts.regular);
  });

  drawSection(page, "Lectura rapida", quickReading(input), 70, 205, fonts);
  drawFooter(page, fonts, input, 1);
}

function drawPersonalPage(doc: PDFDocument, fonts: Fonts, input: ReviewData) {
  const page = newPage(doc);
  drawPageHeader(page, fonts, "Datos personales y asistencia", input);
  let y = 690;
  y = drawSection(page, "Ficha del kenshi", [
    `Nombre: ${input.member.display_name}.`,
    `ID SKBC: ${input.member.legacy_id ?? "-"} · ID IKA: ${input.member.ika_id ?? "pendiente"}.`,
    `Grado actual: ${input.member.grade ?? "sin grado"} · Estado: ${input.member.status ?? "-"}.`,
    `Fecha de ingreso: ${formatDate(input.member.joined_on)} · Fecha de nacimiento: ${formatDate(input.member.birth_date)}.`,
    `Contacto registrado: ${input.member.family_email ?? "sin email"} · Telefono: ${input.member.guardian_phone ?? input.member.student_phone ?? "sin telefono"}.`
  ], 70, y, fonts);

  y = drawSection(page, "Asistencia del periodo", buildAttendanceLines(input), 70, y - 10, fonts);
  y = drawSection(page, "Asistencia por meses", monthLines(input.attendedDates, input.classDates), 70, y - 10, fonts);
  drawSection(page, "Ultimas asistencias registradas", lastItems(input.attendedDates, 12).map(formatDate), 70, y - 10, fonts);
  drawFooter(page, fonts, input, 2);
}

function drawDevelopmentPage(doc: PDFDocument, fonts: Fonts, input: ReviewData) {
  const page = newPage(doc);
  drawPageHeader(page, fonts, input.member.class === "kids" ? "Seguimiento infantil" : "Trabajo tecnico y progreso", input);

  if (input.member.class === "kids") {
    let y = drawSection(page, "Que miramos en la etapa infantil", [
      "En niños el foco principal es la constancia, la actitud, la atencion, el respeto, la seguridad y las ganas de aprender.",
      "Por ahora el sistema no utiliza un progreso tecnico cerrado como en adultos, asi que este informe no compara al niño con un programa de examen adulto.",
      "La asistencia y las notas del sensei ayudan a ver la evolucion general durante la temporada."
    ], 70, 690, fonts);
    y = drawSection(page, "Comportamiento y notas", behaviorLines(input.behavior), 70, y - 10, fonts);
    drawSection(page, "Mensaje para seguir avanzando", [
      input.attendedDates.length >= 15
        ? "Muy buena regularidad. El objetivo es mantener esa energia y seguir creciendo con calma."
        : "La mejora mas importante para la siguiente etapa es venir con regularidad y disfrutar del camino."
    ], 70, y - 10, fonts);
  } else {
    const top = topTechniques(input.techniques, 12);
    let y = drawSection(page, "Resumen tecnico", [
      `Tecnicas diferentes practicadas: ${unique(input.techniques.map((item) => item.technique_id ?? item.technique_name)).length}.`,
      `Repeticiones registradas: ${input.techniques.length}.`,
      `Tecnicas que han sumado al progreso de grado: ${unique(input.techniques.filter((item) => item.counts_as_progression).map((item) => item.technique_id ?? item.technique_name)).length}.`,
      "El progreso hacia examen mide las tecnicas del grado objetivo. El historial tecnico global guarda tambien tecnica comun, repaso, ayuda, cambios de grupo y trabajo acumulado."
    ], 70, 690, fonts);
    y = drawSection(page, "Tecnicas mas practicadas", top.length ? top.map((item) => `${item.name}: ${item.count} veces.`) : ["No hay tecnicas registradas en este periodo."], 70, y - 10, fonts);
    drawSection(page, "Trabajo reciente", lastItems(input.techniques, 12).map((item) => `${formatDate(item.class_date)} - ${item.technique_name} (${item.trained_grade ?? item.grade ?? "-"}).`), 70, y - 10, fonts);
  }
  drawFooter(page, fonts, input, 3);
}

function drawClubPage(doc: PDFDocument, fonts: Fonts, input: ReviewData) {
  const page = newPage(doc);
  drawPageHeader(page, fonts, "Cursos, examenes y club", input);
  let y = drawSection(page, "Cursos y actividades", courseLines(input), 70, 690, fonts);
  y = drawSection(page, "Examenes", examLines(input.exams), 70, y - 10, fonts);
  if (input.member.class === "adults") {
    y = drawSection(page, "Busen y Shakujo", specialLines(input), 70, y - 10, fonts);
  }
  drawSection(page, "Informacion del club", [
    "SKBC Gipuzkoa guarda en tiempo real las asistencias, tecnicas, cursos, examenes, diplomas y seguimiento personal en el sistema nuevo.",
    "Este informe se genera automaticamente con los datos disponibles en el periodo elegido. Si algun dato no aparece, puede revisarse desde el club.",
    "El objetivo del informe no es comparar, sino ayudar a cada kenshi a entender su camino y mantener la motivacion."
  ], 70, y - 10, fonts);
  drawFooter(page, fonts, input, 5);
}

function drawNextStepsPage(doc: PDFDocument, fonts: Fonts, input: ReviewData) {
  const page = newPage(doc);
  drawPageHeader(page, fonts, input.member.class === "kids" ? "Proxima etapa infantil" : "Proxima etapa tecnica", input);
  if (input.member.class === "kids") {
    let y = drawSection(page, "Lectura para la familia", childFamilyLines(input), 70, 690, fonts);
    y = drawSection(page, "Objetivos recomendados", childNextObjectiveLines(input), 70, y - 10, fonts);
    y = drawSection(page, "Como ayudar desde casa", [
      "Lo mas importante es ayudar a que venga con regularidad y con ganas, sin convertir el aprendizaje en presion.",
      "Preguntar que ha aprendido, felicitar los pequenos avances y reforzar el respeto al dojo ayuda mucho.",
      "Si hay una nota del sensei, conviene leerla como una orientacion positiva, no como una comparacion con otros ninos."
    ], 70, y - 10, fonts);
    drawSection(page, "Mensaje del club", [
      "En SKBC Gipuzkoa queremos que cada nino crezca con seguridad, respeto, humildad y alegria por aprender.",
      "La ficha y este informe se actualizan desde los datos registrados en clase, para que la familia pueda seguir la evolucion sin perder detalle."
    ], 70, y - 10, fonts);
  } else {
    let y = drawSection(page, "Estado hacia examen", adultExamReadinessLines(input), 70, 690, fonts);
    y = drawSection(page, "Trabajo tecnico recomendado", adultTechniqueAdviceLines(input), 70, y - 10, fonts);
    y = drawSection(page, "Implicacion y compromiso", adultCommitmentLines(input), 70, y - 10, fonts);
    drawSection(page, "Lectura del sensei", [
      "Este informe debe leerse como una guia de trabajo. La decision final de convocatoria siempre combina datos, criterio tecnico y observacion real en el tatami.",
      "La constancia pesa mucho: entrenar de forma regular suele ser mas importante que acumular muchas asistencias de golpe en poco tiempo."
    ], 70, y - 10, fonts);
  }
  drawFooter(page, fonts, input, 4);
}

function newPage(doc: PDFDocument) {
  const page = doc.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: soft });
  page.drawRectangle({ x: 34, y: 34, width: 527, height: 774, borderColor: gold, borderWidth: 1.5, color: rgb(1, 1, 1) });
  return page;
}

function drawPageHeader(page: PDFPage, fonts: Fonts, title: string, input: ReviewData) {
  page.drawRectangle({ x: 34, y: 742, width: 527, height: 66, color: navy });
  page.drawRectangle({ x: 34, y: 742, width: 527, height: 4, color: gold });
  page.drawText(title, { x: 58, y: 778, size: 17, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText(input.member.display_name, { x: 58, y: 756, size: 10, font: fonts.regular, color: rgb(0.82, 0.88, 0.96) });
  page.drawText(`${formatDate(input.from)} - ${formatDate(input.to)}`, { x: 405, y: 756, size: 9, font: fonts.bold, color: rgb(1, 1, 1) });
}

async function drawLogo(doc: PDFDocument, page: PDFPage, x: number, y: number, size: number) {
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "skbc-icon.png"));
    const image = await doc.embedPng(bytes);
    page.drawImage(image, { x, y, width: size, height: size });
  } catch {
    page.drawCircle({ x: x + size / 2, y: y + size / 2, size: size / 2, color: rgb(1, 1, 1) });
  }
}

async function drawMemberPhoto(doc: PDFDocument, page: PDFPage, photoUrl: string | null, x: number, y: number, size: number) {
  page.drawRectangle({ x, y, width: size, height: size, borderColor: gold, borderWidth: 1.5, color: rgb(1, 1, 1) });
  if (!photoUrl?.startsWith("http")) return;
  try {
    const response = await fetch(photoUrl);
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? "";
    const image = contentType.includes("png") ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const inner = size - 8;
    const imageRatio = image.width / image.height;
    const boxRatio = 1;
    let width = inner;
    let height = inner;
    if (imageRatio > boxRatio) {
      width = inner;
      height = inner / imageRatio;
    } else {
      height = inner;
      width = inner * imageRatio;
    }
    page.drawImage(image, { x: x + 4 + (inner - width) / 2, y: y + 4 + (inner - height) / 2, width, height });
  } catch {
    return;
  }
}

function drawStatCard(page: PDFPage, x: number, y: number, title: string, value: string, subtitle: string, bold: PDFFont, regular: PDFFont) {
  page.drawRectangle({ x, y, width: 205, height: 72, borderColor: rgb(0.85, 0.89, 0.94), borderWidth: 1, color: rgb(0.98, 0.99, 1) });
  page.drawText(title, { x: x + 14, y: y + 48, size: 10, font: bold, color: muted });
  page.drawText(value, { x: x + 14, y: y + 22, size: 22, font: bold, color: blue });
  drawWrapped(page, subtitle, x + 82, y + 31, 105, 9, 11, regular, muted);
}

function drawSection(page: PDFPage, title: string, lines: string[], x: number, y: number, fonts: Fonts) {
  if (y < 120) return y;
  page.drawText(title, { x, y, size: 15, font: fonts.bold, color: navy });
  let cursor = y - 24;
  for (const line of lines.filter(Boolean).slice(0, 22)) {
    if (cursor < PAGE.bottom + 18) break;
    page.drawCircle({ x: x + 4, y: cursor + 5, size: 2, color: gold });
    cursor = drawWrapped(page, sanitize(line), x + 16, cursor, 430, 11, 15, fonts.regular, muted) - 5;
  }
  return cursor;
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, width: number, size: number, lineHeight: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const words = sanitize(text).split(/\s+/);
  let line = "";
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      page.drawText(line, { x, y: cursor, size, font, color });
      cursor -= lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) page.drawText(line, { x, y: cursor, size, font, color });
  return cursor - lineHeight;
}

function drawTitleWrapped(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, color: ReturnType<typeof rgb>) {
  const clean = sanitize(text);
  const size = clean.length > 34 ? 24 : clean.length > 24 ? 27 : 30;
  return drawWrapped(page, clean, x, y, width, size, size + 5, font, color);
}

function drawFooter(page: PDFPage, fonts: Fonts, input: ReviewData, pageNumber: number) {
  page.drawText("Datos del sistema nuevo SKBC. Ficha privada actualizada automaticamente en tiempo real.", { x: 58, y: 56, size: 8.5, font: fonts.regular, color: muted });
  page.drawText(`${input.member.legacy_id ?? input.member.id.slice(0, 8)} · pag. ${pageNumber}`, { x: 470, y: 56, size: 8.5, font: fonts.bold, color: muted });
}

function statCards(input: ReviewData) {
  const attendanceValue = input.classCoverageReliable && input.classDates.length ? `${input.attendedDates.length}/${input.classDates.length}` : `${input.attendedDates.length}`;
  const attendanceSubtitle = input.classCoverageReliable && input.attendanceRate !== null ? `${input.attendanceRate}% asistencia` : "asistencias registradas";
  if (input.member.class === "kids") {
    return [
      ["Entrenos", attendanceValue, attendanceSubtitle],
      ["Constancia", childConstancyLabel(input.attendedDates.length), "seguimiento infantil"],
      ["Cursos", `${input.courseCounts.total}`, `${input.courseCounts.international} internacionales`],
      ["Examenes", `${input.exams.length}`, "registrados"]
    ];
  }
  return [
    ["Entrenos", attendanceValue, attendanceSubtitle],
    ["Tecnicas", `${unique(input.techniques.map((item) => item.technique_id ?? item.technique_name)).length}`, `${input.techniques.length} repeticiones`],
    ["Progreso grado", `${unique(input.techniques.filter((item) => item.counts_as_progression).map((item) => item.technique_id ?? item.technique_name)).length}`, "tecnicas objetivo"],
    ["Cursos", `${input.courseCounts.total}`, `${input.courseCounts.international} internacionales`]
  ];
}

function quickReading(input: ReviewData) {
  if (input.member.class === "kids") {
    return [
      `Ha entrenado ${input.attendedDates.length} dias dentro del periodo analizado.`,
      input.behavior[0] ? `Ultima valoracion: actitud ${input.behavior[0].attitude ?? "-"}, atencion ${input.behavior[0].attention ?? "-"}, esfuerzo ${input.behavior[0].effort ?? "-"}.` : "No hay valoracion infantil registrada en el periodo.",
      "El informe infantil prioriza constancia, actitud y participacion positiva en clase."
    ];
  }
  return [
    `Ha entrenado ${input.attendedDates.length} dias y ha practicado ${input.techniques.length} repeticiones tecnicas registradas.`,
    `Semaforo actual: ${input.member.semaphore ?? "-"} · proxima referencia de examen: ${formatDate(input.member.next_exam_on)}.`,
    `Cursos registrados: ${input.courseCounts.total} · examenes en el periodo: ${input.exams.length}.`
  ];
}

function buildAttendanceLines(input: ReviewData) {
  const base = input.classCoverageReliable && input.classDates.length
    ? [`Ha entrenado ${input.attendedDates.length} dias de ${input.classDates.length} clases registradas para su grupo (${input.attendanceRate ?? 0}%).`]
    : [
      `Tiene ${input.attendedDates.length} asistencias registradas en este periodo.`,
      input.classDates.length
        ? `El calendario historico de clases detectado para este periodo no es suficiente para calcular un porcentaje fiable (${input.classDates.length} clases detectadas). Por eso no se muestra un porcentaje cerrado.`
        : "No hay un calendario de clases cerrado suficiente en este periodo para calcular porcentaje de asistencia."
    ];
  if (input.member.attendance_count !== null) base.push(`Ciclo actual del sistema: ${input.member.attendance_count ?? 0}/${input.member.minimum_attendance ?? "-"} asistencias minimas; faltan ${input.member.missing_attendance ?? 0}.`);
  if (input.member.last_exam_on) base.push(`Ultimo examen registrado: ${formatDate(input.member.last_exam_on)}.`);
  if (input.member.next_exam_on) base.push(`Proxima convocatoria teorica o referencia: ${formatDate(input.member.next_exam_on)}.`);
  return base;
}

function childFamilyLines(input: ReviewData) {
  const lines = [
    `Periodo analizado: ${formatDate(input.from)} - ${formatDate(input.to)}.`,
    `Kenshi: ${input.member.display_name}. Grado actual: ${input.member.grade ?? "sin grado registrado"}.`,
    input.member.joined_on ? `Fecha de ingreso en el club: ${formatDate(input.member.joined_on)}.` : "Fecha de ingreso pendiente de completar.",
    input.member.birth_date ? `Fecha de nacimiento registrada: ${formatDate(input.member.birth_date)}.` : "Fecha de nacimiento pendiente de completar.",
    `Asistencias registradas en el periodo: ${input.attendedDates.length}.`,
    input.attendanceRate !== null ? `Porcentaje de asistencia sobre clases detectadas: ${input.attendanceRate}%.` : "El porcentaje de asistencia no se muestra porque el calendario historico del periodo no es completamente fiable.",
    "La etapa infantil se valora por constancia, actitud, respeto, atencion, autonomia, seguridad y participacion positiva."
  ];
  return lines;
}

function childParticipationLines(input: ReviewData) {
  const lines = buildAttendanceLines(input);
  const latest = input.behavior[0];
  if (latest) {
    lines.push(`Ultima nota registrada: actitud ${latest.attitude ?? "-"}, atencion ${latest.attention ?? "-"}, respeto ${latest.respect ?? "-"}, esfuerzo ${latest.effort ?? "-"}.`);
    if (latest.companionship) lines.push(`Companerismo: ${latest.companionship}.`);
  }
  if (input.courses.length) lines.push(`Actividades/cursos registrados: ${input.courses.length}.`);
  if (input.exams.length) lines.push(`Examenes registrados en el periodo: ${input.exams.length}.`);
  return lines;
}

function childNextObjectiveLines(input: ReviewData) {
  if (!input.attendedDates.length) {
    return [
      "Objetivo principal: recuperar la rutina de venir al dojo con tranquilidad.",
      "Cuando vuelva a entrenar con regularidad, el informe mostrara una lectura mas completa de su evolucion."
    ];
  }
  const lines = input.attendanceRate !== null && input.attendanceRate >= 75
    ? [
      "Objetivo principal: mantener esta buena regularidad.",
      "Con esta base, el siguiente paso es seguir reforzando atencion, respeto, esfuerzo y confianza en clase."
    ]
    : [
      "Objetivo principal: ganar continuidad de asistencia.",
      "Venir con mas regularidad ayuda a que los habitos del dojo se consoliden y la evolucion sea mas natural."
    ];
  if (input.behavior[0]?.observation) lines.push(`Nota orientativa del sensei: ${input.behavior[0].observation}`);
  return lines;
}

function adultExamReadinessLines(input: ReviewData) {
  const lines = [
    `Grado actual: ${input.member.grade ?? "sin grado"}.`,
    `Semaforo actual de convocatoria: ${input.member.semaphore ?? "sin dato"}.`,
    input.member.next_exam_on ? `Proxima convocatoria teorica o referencia: ${formatDate(input.member.next_exam_on)}.` : "No hay fecha de convocatoria teorica registrada.",
    input.member.attendance_count !== null ? `Asistencias del ciclo actual: ${input.member.attendance_count ?? 0}/${input.member.minimum_attendance ?? "-"}; faltan ${input.member.missing_attendance ?? 0}.` : "No hay contador de asistencia de ciclo disponible.",
    "La convocatoria real depende de asistencia, tiempo minimo, progreso tecnico, actitud, regularidad e implicacion."
  ];
  if (input.member.last_exam_on) lines.push(`Ultimo examen registrado: ${formatDate(input.member.last_exam_on)}.`);
  return lines;
}

function adultTechniqueAdviceLines(input: ReviewData) {
  const progression = input.techniques.filter((item) => item.counts_as_progression);
  const globalOnly = input.techniques.filter((item) => !item.counts_as_progression);
  const top = topTechniques(input.techniques, 5);
  return [
    `Trabajo tecnico total registrado: ${input.techniques.length} repeticiones.`,
    `Tecnicas diferentes practicadas: ${unique(input.techniques.map((item) => item.technique_id ?? item.technique_name)).length}.`,
    `Repeticiones que han contado para progreso de grado: ${progression.length}.`,
    `Trabajo tecnico general, repaso o fuera de grado: ${globalOnly.length}.`,
    top.length ? `Tecnicas mas repetidas: ${top.map((item) => `${item.name} (${item.count})`).join(", ")}.` : "Todavia no hay suficientes tecnicas para detectar patrones.",
    "Recomendacion: mantener equilibrio entre Goho, Juho, tecnicas nuevas y repasos de grados anteriores."
  ];
}

function adultCommitmentLines(input: ReviewData) {
  const teaching = input.attendance.filter((item) => item.technical_role === "teaching").length;
  const observing = input.attendance.filter((item) => item.technical_role === "observing").length;
  const reviewing = input.attendance.filter((item) => item.technical_role === "reviewing").length;
  const lines = [
    `Asistencias registradas: ${input.attendedDates.length}.`,
    `Dias ensenando o ayudando: ${teaching}.`,
    `Dias observando/supervisando: ${observing}.`,
    `Dias con trabajo parcial o revisado: ${reviewing}.`,
    `Cursos nacionales: ${input.courseCounts.national}; internacionales: ${input.courseCounts.international}; taikai: ${input.courseCounts.taikai}.`
  ];
  if (input.busen.length) lines.push(`Registros Busen recientes: ${input.busen.length}.`);
  if (input.shakujo.length) lines.push(`Registros Shakujo recientes: ${input.shakujo.length}.`);
  return lines;
}

function techniqueCategoryLines(input: ReviewData) {
  if (!input.techniques.length) return ["No hay trabajo tecnico registrado en este periodo."];
  const goho = input.techniques.filter((item) => normalizeText(item.category) === "goho").length;
  const juho = input.techniques.filter((item) => normalizeText(item.category) === "juho").length;
  const other = input.techniques.length - goho - juho;
  const progression = input.techniques.filter((item) => item.counts_as_progression).length;
  return [
    `Goho: ${goho} repeticiones.`,
    `Juho: ${juho} repeticiones.`,
    `Otras categorias o registros generales: ${other}.`,
    `Trabajo que cuenta para progreso de grado: ${progression}.`,
    `Trabajo global acumulado: ${input.techniques.length - progression}.`
  ];
}

function buildPossibleClassDates(from: string, to: string, memberClass: "kids" | "adults", closures: CalendarClosure[], explicitClassDates: string[]) {
  const dates = new Set(
    explicitClassDates.filter((value) => {
      const date = parseIsoDate(value);
      return Boolean(date && isClubTrainingDay(date) && !isExplicitlyClosed(date, closures, memberClass));
    })
  );
  const cursor = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!cursor || !end) return Array.from(dates).sort();

  while (cursor <= end) {
    if (isClubTrainingDay(cursor) && !isExplicitlyClosed(cursor, closures, memberClass)) {
      dates.add(toIsoDate(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Array.from(dates).sort();
}

function monthLines(attendedDates: string[], classDates: string[]) {
  const months = Array.from(new Set([...attendedDates, ...classDates].map((date) => date.slice(0, 7)))).sort();
  if (!months.length) return ["Sin datos mensuales en el periodo."];
  return months.map((month) => {
    const attended = attendedDates.filter((date) => date.startsWith(month)).length;
    const classes = classDates.filter((date) => date.startsWith(month)).length;
    if (classes && attended > classes) {
      return `${formatMonth(month)}: ${attended} asistencias registradas; ${classes} clases detectadas.`;
    }
    return classes ? `${formatMonth(month)}: ${attended}/${classes} asistencias.` : `${formatMonth(month)}: ${attended} asistencias registradas.`;
  });
}

function behaviorLines(rows: BehaviorRow[]) {
  if (!rows.length) return ["No hay notas de comportamiento registradas todavia."];
  return rows.slice(0, 6).map((row) => `${formatDate(row.report_date)} - Actitud: ${row.attitude ?? "-"} · Atencion: ${row.attention ?? "-"} · Respeto: ${row.respect ?? "-"} · Esfuerzo: ${row.effort ?? "-"}${row.observation ? `. Nota: ${row.observation}` : ""}`);
}

function courseLines(input: ReviewData) {
  if (!input.courses.length) return ["No hay cursos, taikai o actividades externas registradas en este periodo."];
  const summary = `Resumen: ${input.courseCounts.national} nacionales, ${input.courseCounts.international} internacionales, ${input.courseCounts.taikai} taikai.`;
  return [summary, ...input.courses.slice(-14).map((course) => {
    const extra = course.kind === "taikai" ? ` · resultado: ${course.competition_result ?? course.competition_medal ?? "pendiente"}` : "";
    return `${formatDate(course.course_date)} - ${kindLabel(course.kind)}: ${course.title ?? "sin titulo"} (${course.location ?? "sin lugar"})${extra}.`;
  })];
}

function examLines(exams: ExamRow[]) {
  if (!exams.length) return ["No hay examenes registrados en este periodo."];
  return exams.slice(-12).map((exam) => `${formatDate(exam.exam_date)} - ${exam.grade} · resultado: ${exam.result ?? "registrado"} · examinador: ${exam.examiner ?? "-"}.`);
}

function specialLines(input: ReviewData) {
  const lines: string[] = [];
  if (input.busen.length) lines.push(`Busen: ${input.busen.length} registros recientes. Ultimo: ${specialDate(input.busen[0], "busen")}.`);
  if (input.shakujo.length) lines.push(`Shakujo: ${input.shakujo.length} asistencias recientes. Ultima: ${specialDate(input.shakujo[0], "shakujo")}.`);
  return lines.length ? lines : ["Sin registros Busen/Shakujo en el periodo consultado."];
}

async function loadLegacyExams(
  supabase: ReturnType<typeof createAdminClient>,
  legacyId: string | null,
  from: string,
  to: string
): Promise<ExamRow[]> {
  if (!legacyId) return [];
  const { data, error } = await supabase
    .from("legacy_rows")
    .select("row_number,row_data,legacy_sheets!inner(title)")
    .eq("legacy_sheets.title", "EXAMENES")
    .order("row_number", { ascending: true })
    .limit(2000)
    .returns<LegacyExamRow[]>();

  if (error) return [];

  return (data ?? [])
    .map((row) => row.row_data)
    .filter((row) => sameLegacyId(row.ID, legacyId))
    .map((row) => ({
      exam_date: parseLegacyDate(row.FechaExamen),
      grade: cleanUnknown(row.Grado),
      cycle_attendance: parseIntegerUnknown(row.AsistenciasCiclo),
      examiner: cleanUnknown(row.Examinador) || null,
      registered_by: cleanUnknown(row.RegistradoPor) || null,
      result: cleanUnknown(row.Resultado) || cleanUnknown(row.Estado) || null,
      diploma_url: cleanUnknown(row.URL_Diploma) || null,
      report_url: cleanUnknown(row.InformePDF) || null
    }))
    .filter((exam) => exam.exam_date && exam.grade && exam.exam_date >= from && exam.exam_date <= to);
}

function mergeExams(primary: ExamRow[], legacy: ExamRow[]) {
  const map = new Map<string, ExamRow>();
  for (const exam of legacy) map.set(examKey(exam), exam);
  for (const exam of primary) {
    const fallback = map.get(examKey(exam));
    map.set(examKey(exam), {
      ...exam,
      cycle_attendance: exam.cycle_attendance ?? fallback?.cycle_attendance ?? null,
      examiner: exam.examiner ?? fallback?.examiner ?? null,
      registered_by: exam.registered_by ?? fallback?.registered_by ?? null,
      result: exam.result ?? fallback?.result ?? null,
      diploma_url: exam.diploma_url ?? fallback?.diploma_url ?? null,
      report_url: exam.report_url ?? fallback?.report_url ?? null
    });
  }
  return Array.from(map.values()).sort((a, b) => a.exam_date.localeCompare(b.exam_date));
}

function examKey(exam: Pick<ExamRow, "exam_date" | "grade">) {
  return `${exam.exam_date}::${normalizeText(exam.grade)}`;
}

function topTechniques(rows: TechnicalRow[], limit: number) {
  const map = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const key = row.technique_id ?? row.technique_name;
    const current = map.get(key) ?? { name: row.technique_name, count: 0 };
    current.count += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

function motivationalMessage(input: ReviewData) {
  const rate = input.attendanceRate;
  if (!input.classDates.length) return "Este informe empieza a tomar forma desde los primeros datos reales de la temporada. Lo importante es construir el camino con constancia.";
  if (rate === null) return `Esta temporada tienes ${input.attendedDates.length} entrenamientos registrados. Seguiremos afinando el historico de clases para que el balance sea cada vez mas exacto.`;
  if (rate >= 85) return `Temporada excelente: has estado muy presente en el dojo, con ${input.attendedDates.length} entrenamientos registrados. Esa regularidad se nota y es la base real del progreso.`;
  if (rate >= 65) return `Muy buen camino: has mantenido una presencia solida durante la temporada. Con un pequeno empujon de constancia, el progreso tecnico se acelera mucho.`;
  if (rate >= 40) return `Has sumado entrenamientos importantes esta temporada. El siguiente paso es ganar continuidad para que cada tecnica se asiente mejor y el avance sea mas natural.`;
  return `Esta temporada ha sido irregular, pero cada vuelta al tatami cuenta. El objetivo ahora es recuperar ritmo poco a poco y volver a construir confianza desde la constancia.`;
}

function childMotivationalMessage(input: ReviewData) {
  const attendanceCount = input.attendedDates.length;
  if (attendanceCount >= 20) return `Muy buena temporada: has venido muchas veces al dojo y eso ayuda a crecer con confianza, respeto y ganas de aprender.`;
  if (attendanceCount >= 10) return `Buen trabajo esta temporada: cada clase suma experiencia, amigos y pequenos avances que se notan poco a poco.`;
  if (attendanceCount > 0) return `Has dado pasos importantes esta temporada. Lo mas importante ahora es seguir viniendo con ganas y disfrutar entrenando.`;
  return "Este informe se ira completando cuando haya entrenamientos registrados en el periodo elegido.";
}

function childConstancyLabel(attendanceCount: number) {
  if (attendanceCount >= 20) return "Muy alta";
  if (attendanceCount >= 10) return "Buena";
  if (attendanceCount > 0) return "En marcha";
  return "Sin datos";
}

function countCourses(courses: CourseRow[]) {
  return {
    national: courses.filter((item) => item.kind === "national").length,
    international: courses.filter((item) => item.kind === "international").length,
    taikai: courses.filter((item) => item.kind === "taikai").length,
    total: courses.length
  };
}

function parseDateParam(value?: string | null) {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function maxIso(a: string, b: string) {
  return a > b ? a : b;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function lastItems<T>(items: T[], count: number) {
  return items.slice(Math.max(0, items.length - count)).reverse();
}

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isClubTrainingDay(date: Date) {
  const day = date.getDay();
  return day === 2 || day === 4;
}

function isExplicitlyClosed(date: Date, closures: CalendarClosure[], memberClass: "kids" | "adults") {
  return closures.some((closure) => {
    if (closure.applies_to !== "all" && closure.applies_to !== memberClass) return false;
    const starts = parseIsoDate(closure.starts_on);
    const ends = parseIsoDate(closure.ends_on);
    return Boolean(starts && ends && starts <= date && date <= ends);
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return "-";
  return `${day}/${month}/${year}`;
}

function formatMonth(value: string) {
  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function kindLabel(kind: string) {
  if (kind === "international") return "curso internacional";
  if (kind === "taikai") return "taikai";
  return "curso nacional";
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function sameLegacyId(value: unknown, legacyId: string) {
  return normalizeLegacyId(value) === normalizeLegacyId(legacyId);
}

function normalizeLegacyId(value: unknown) {
  const text = cleanUnknown(value);
  const numeric = Number(text);
  if (Number.isFinite(numeric) && text !== "") return String(Math.trunc(numeric));
  return text;
}

function cleanUnknown(value: unknown) {
  return String(value ?? "").trim();
}

function parseIntegerUnknown(value: unknown) {
  const parsed = Number.parseInt(cleanUnknown(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLegacyDate(value: unknown) {
  const text = cleanUnknown(value);
  if (!text || text === "-") return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const spanish = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (spanish) return `${spanish[3]}-${spanish[2].padStart(2, "0")}-${spanish[1].padStart(2, "0")}`;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function specialDate(row: SpecialRow, type: "busen" | "shakujo") {
  return formatDate(type === "busen" ? row.black_belt_special_classes?.class_date : row.shakujo_classes?.class_date);
}

function sanitize(value: string) {
  return String(value ?? "")
    .replace(/[·•]/g, "-")
    .replace(/[ñ]/g, "ñ")
    .replace(/[Ñ]/g, "Ñ")
    .replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿñÑ]/g, "");
}
