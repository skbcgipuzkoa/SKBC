import { notFound } from "next/navigation";
import { driveImageUrl } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase/admin";

const LOGO_IKA_URL = "https://lh3.googleusercontent.com/d/1F1VTa2ygk4PRG4wEukoeRWkBAt_vKORy=w300";
const LOGO_SKBC_URL = "https://lh3.googleusercontent.com/d/1HL7qwSkhxFsHdwg6lpidBe5EjGE-W1GI=w300";
const ADULT_GRADES = ["MINARAI", "5 KYU", "4 KYU", "3 KYU", "2 KYU", "1 KYU", "1 DAN", "2 DAN", "3 DAN", "4 DAN", "5 DAN", "6 DAN"];
const REPETITION_GOAL = 3;

type Member = {
  id: string;
  legacy_id: string | null;
  ika_id: string | null;
  first_name: string;
  last_name: string | null;
  display_name: string;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
  next_exam_on: string | null;
  exam_notice: string | null;
  semaphore: string | null;
  photo_url: string | null;
  site_url: string | null;
  attendance_count: number | null;
  attendance_percentage: number | null;
  minimum_attendance: number | null;
  total_cycle_sessions: number | null;
  missing_attendance: number | null;
};

type Attendance = {
  attended_on: string;
  official_grade: string | null;
  trained_grade: string | null;
  classes: { name: string | null } | null;
};

type Exam = {
  exam_date: string;
  grade: string;
  cycle_attendance: number | null;
  examiner: string | null;
  registered_by: string | null;
  diploma_url: string | null;
  report_url: string | null;
};

type Course = {
  kind: "national" | "international";
  course_date: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
};

type Technique = {
  id: string;
  grade: string;
  base_name: string | null;
  name: string;
  category: string;
  active: boolean;
  active_in_planning: boolean;
};

type TechnicalHistory = {
  technique_id: string | null;
  technique_name: string;
  category: string | null;
  completed: boolean;
  counts_as_progression: boolean;
};

type AdultBonus = {
  member_id: string;
  points: number;
};

type ChildRanking = {
  attendance_30d: number;
  attendance_90d: number;
  last_attendance_on: string | null;
  days_without_attendance: number | null;
  score: number;
  position: number | null;
  level: string | null;
  constancy_status: string | null;
  motivational_message: string | null;
};

type ChildNotice = {
  notice_date: string | null;
  title: string;
  body: string | null;
  color: string | null;
};

type ChildNote = {
  note_date: string | null;
  note_type: string | null;
  note: string | null;
  author: string | null;
};

type ChildBehavior = {
  report_date: string | null;
  attitude: string | null;
  attention: string | null;
  respect: string | null;
  effort: string | null;
  companionship: string | null;
  observation: string | null;
};

export default async function PublicFichaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: member, error } = await supabase
    .from("members")
    .select("id,legacy_id,ika_id,first_name,last_name,display_name,class,status,grade,joined_on,last_exam_on,next_exam_on,exam_notice,semaphore,photo_url,site_url,attendance_count,attendance_percentage,minimum_attendance,total_cycle_sessions,missing_attendance")
    .eq("ficha_token", token)
    .single<Member>();

  if (error || !member) notFound();

  const [{ data: attendance }, { data: exams }, { data: courses }] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("attended_on,official_grade,trained_grade,classes(name)")
      .eq("member_id", member.id)
      .order("attended_on", { ascending: false })
      .returns<Attendance[]>(),
    supabase
      .from("exams")
      .select("exam_date,grade,cycle_attendance,examiner,registered_by,diploma_url,report_url")
      .eq("member_id", member.id)
      .order("exam_date", { ascending: false })
      .returns<Exam[]>(),
    supabase
      .from("courses")
      .select("kind,course_date,location,title,sensei")
      .eq("member_id", member.id)
      .order("course_date", { ascending: false })
      .returns<Course[]>()
  ]);

  if (member.class === "kids") {
    const [{ data: childRanking }, { data: childNotices }, { data: childNote }, { data: behavior }] = await Promise.all([
      supabase
        .from("child_rankings")
        .select("attendance_30d,attendance_90d,last_attendance_on,days_without_attendance,score,position,level,constancy_status,motivational_message")
        .eq("member_id", member.id)
        .maybeSingle<ChildRanking>(),
      supabase
        .from("child_notices")
        .select("notice_date,title,body,color")
        .eq("member_id", member.id)
        .eq("active", true)
        .order("notice_date", { ascending: false, nullsFirst: false })
        .returns<ChildNotice[]>(),
      supabase
        .from("child_notes")
        .select("note_date,note_type,note,author")
        .eq("member_id", member.id)
        .eq("visible_family", true)
        .order("note_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle<ChildNote>(),
      supabase
        .from("child_behavior_reports")
        .select("report_date,attitude,attention,respect,effort,companionship,observation")
        .eq("member_id", member.id)
        .order("report_date", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle<ChildBehavior>()
    ]);

    return <KidsFicha member={member} attendance={attendance ?? []} exams={exams ?? []} ranking={childRanking} notices={childNotices ?? []} note={childNote} behavior={behavior} />;
  }

  const targetGrade = nextAdultGrade(member.grade);
  const date180 = daysAgo(180);
  const [{ data: techniques }, { data: technicalHistory }, { data: allAdults }, { data: allAttendance }, { data: recentCourses }, bonusResult] = await Promise.all([
    supabase
      .from("techniques")
      .select("id,grade,base_name,name,category,active,active_in_planning")
      .eq("grade", targetGrade)
      .eq("active", true)
      .eq("active_in_planning", true)
      .returns<Technique[]>(),
    supabase
      .from("member_technical_history")
      .select("technique_id,technique_name,category,completed,counts_as_progression")
      .eq("member_id", member.id)
      .eq("completed", true)
      .returns<TechnicalHistory[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,status")
      .eq("class", "adults")
      .eq("status", "active")
      .returns<Array<Pick<Member, "id" | "legacy_id" | "display_name" | "class" | "status">>>(),
    supabase
      .from("attendance_logs")
      .select("member_id,attended_on")
      .returns<Array<{ member_id: string; attended_on: string }>>(),
    supabase
      .from("courses")
      .select("member_id,course_date,kind")
      .gte("course_date", date180)
      .returns<Array<{ member_id: string; course_date: string; kind: "national" | "international" }>>(),
    supabase
      .from("adult_ranking_bonuses")
      .select("member_id,points")
      .gte("bonus_date", date180)
      .returns<AdultBonus[]>()
  ]);

  const technicalProgress = buildTechnicalProgress(targetGrade, techniques ?? [], technicalHistory ?? []);
  const adultActivity = buildAdultActivity(attendance ?? [], courses ?? []);
  const ranking = buildAdultRanking(member.id, allAdults ?? [], allAttendance ?? [], recentCourses ?? [], bonusResult.error ? [] : bonusResult.data ?? []);

  return <AdultFicha member={member} attendance={attendance ?? []} exams={exams ?? []} courses={courses ?? []} activity={adultActivity} technicalProgress={technicalProgress} ranking={ranking} />;
}

function AdultFicha({
  member,
  attendance,
  exams,
  courses,
  activity,
  technicalProgress,
  ranking
}: {
  member: Member;
  attendance: Attendance[];
  exams: Exam[];
  courses: Course[];
  activity: ReturnType<typeof buildAdultActivity>;
  technicalProgress: ReturnType<typeof buildTechnicalProgress>;
  ranking: ReturnType<typeof buildAdultRanking>;
}) {
  const photoSrc = driveImageUrl(member.photo_url);
  const nacionales = courses.filter((course) => course.kind === "national");
  const internacionales = courses.filter((course) => course.kind === "international");

  return (
    <main className="legacy-ficha adult-ficha">
      <HeaderLogos member={member} photoSrc={photoSrc} eyebrow="FICHA PRO · SKBC GIPUZKOA" />

      <section className={`ficha-alert ficha-${normalizeCss(member.semaphore ?? "gris")}`}>
        <strong>{member.semaphore ?? "SIN DATOS"}</strong>
        <span>{member.exam_notice ?? "Sin aviso de examen registrado."}</span>
      </section>

      <section className="ficha-actions">
        {member.site_url ? <a href={member.site_url} target="_blank">AREA TECNICA PERSONAL</a> : null}
        <a href="https://akapi80.github.io/Juego-SKBC/" target="_blank">ENTRENAR JUGANDO</a>
        <a href="https://stirring-madeleine-467faf.netlify.app/technique-consultation/" target="_blank">CONSULTAR TECNICAS</a>
      </section>

      <section className="ficha-section">
        <h2>Datos del kenshi</h2>
        <div className="ficha-card ficha-fields">
          <Field label="ID SKBC" value={member.legacy_id} />
          <Field label="ID IKA" value={member.ika_id ?? "Pendiente"} />
          <Field label="Nombre" value={member.first_name} />
          <Field label="Apellidos" value={member.last_name} />
          <Field label="Club" value="SKBC Gipuzkoa" />
          <Field label="Grado" value={member.grade} />
          <Field label="Grado objetivo" value={technicalProgress.targetGrade} />
          <Field label="Fecha ingreso" value={formatDate(member.joined_on)} />
          <Field label="Antigüedad" value={ageText(member.joined_on)} />
          <Field label="Exámenes" value={String(exams.length)} />
          <Field label="Cursos" value={String(courses.length)} />
          <Field label="Último entreno" value={formatDate(activity.lastAttendance)} />
          <Field label="Asistencias 12m" value={String(activity.attendance12m)} />
          <Field label="Asistencias 6m" value={String(activity.attendance6m)} />
          <Field label="Asistencias 1m" value={String(activity.attendance1m)} />
          <Field label="Semanas sin entrenar" value={activity.weeksSinceLast === null ? "-" : String(activity.weeksSinceLast)} />
        </div>
      </section>

      <section className="ficha-section">
        <h2>Actividad e implicación</h2>
        <div className="ficha-triple">
          <StatusBlock title="Estado" value={activity.visualStatus} />
          <StatusBlock title="Esta semana" value={activity.activeThisWeek ? "SI" : "NO"} />
          <StatusBlock title="Implicación" value={activity.involvement} />
        </div>
        {ranking ? <p className="ficha-ranking">{ranking.message} · Score {ranking.score}</p> : null}
      </section>

      <section className="ficha-section">
        <h2>Progreso técnico</h2>
        <div className="ficha-card">
          <div className="progress-grid">
            <Progress label="GOHO" value={technicalProgress.pctGoho} />
            <Progress label="JUHO" value={technicalProgress.pctJuho} />
            <Progress label="GLOBAL" value={technicalProgress.pctGlobal} />
          </div>
          <div className="ficha-fields small-fields">
            <Field label="Técnicas objetivo" value={String(technicalProgress.total)} />
            <Field label="Completadas" value={String(technicalProgress.completed)} />
            <Field label="Pendientes" value={String(technicalProgress.pending.length)} />
            <Field label="Objetivo por técnica" value={`${REPETITION_GOAL} reps`} />
          </div>
        </div>
        <ResponsiveTable
          columns={["Técnica", "Categoría", "Progreso", "Faltan", "Estado"]}
          rows={technicalProgress.details.map((technique) => [
            technique.name,
            technique.category,
            `${technique.repetitions}/${REPETITION_GOAL}`,
            String(technique.missing),
            technique.completed ? "COMPLETADA" : technique.repetitions > 0 ? "EN PROGRESO" : "PENDIENTE"
          ])}
          empty="Sin técnicas cargadas para el grado objetivo."
        />
      </section>

      <section className="ficha-section">
        <h2>Exámenes</h2>
        <ResponsiveTable
          columns={["Fecha", "Grado", "Nota/asistencias", "Sensei", "Informe"]}
          rows={exams.map((exam) => [
            formatDate(exam.exam_date),
            exam.grade,
            exam.cycle_attendance !== null ? `${exam.cycle_attendance} asistencias` : "-",
            exam.examiner ?? "-",
            <DocumentLinks key={`${exam.exam_date}-${exam.grade}`} exam={exam} />
          ])}
          empty="Sin exámenes registrados."
        />
      </section>

      <section className="ficha-section">
        <h2>Cursos nacionales</h2>
        <CourseTable courses={nacionales} />
      </section>

      <section className="ficha-section">
        <h2>Cursos internacionales</h2>
        <CourseTable courses={internacionales} />
      </section>

      <Footer />
    </main>
  );
}

function KidsFicha({
  member,
  attendance,
  exams,
  ranking,
  notices,
  note,
  behavior
}: {
  member: Member;
  attendance: Attendance[];
  exams: Exam[];
  ranking: ChildRanking | null;
  notices: ChildNotice[];
  note: ChildNote | null;
  behavior: ChildBehavior | null;
}) {
  const photoSrc = driveImageUrl(member.photo_url);
  const objective = nextKidGrade(member.grade);
  return (
    <main className="legacy-ficha kids-ficha">
      <HeaderLogos member={member} photoSrc={photoSrc} eyebrow="SKBC Gipuzkoa · Ficha infantil" />

      <section className="kid-badges">
        <span>Grado: {member.grade ?? "-"}</span>
        <span>Objetivo: {objective}</span>
        <span>Antigüedad: {ageText(member.joined_on) || "-"}</span>
      </section>

      <section className="ficha-actions">
        <a href="https://akapi80.github.io/SKBC-KIDS/" target="_blank">ENTRENAR JUGANDO</a>
      </section>

      <section className="ficha-section">
        <h2>Asistencia</h2>
        <div className="ficha-triple">
          <StatusBlock title="Último entreno" value={formatDate(ranking?.last_attendance_on ?? attendance[0]?.attended_on ?? null)} />
          <StatusBlock title="Últimos 30 días" value={String(ranking?.attendance_30d ?? countSince(attendance, 30))} />
          <StatusBlock title="Últimos 90 días" value={String(ranking?.attendance_90d ?? countSince(attendance, 90))} />
          <StatusBlock title="Días sin venir" value={ranking?.days_without_attendance === null || ranking?.days_without_attendance === undefined ? "-" : String(ranking.days_without_attendance)} />
        </div>
      </section>

      <section className="ficha-section">
        <h2>Ranking</h2>
        <div className="ficha-triple">
          <StatusBlock title="Posición" value={ranking?.position ? `#${ranking.position}` : "-"} />
          <StatusBlock title="Nivel" value={ranking?.level ?? "-"} />
          <StatusBlock title="Score" value={String(ranking?.score ?? 0)} />
          <StatusBlock title="Constancia" value={ranking?.constancy_status ?? "-"} />
        </div>
        {ranking?.motivational_message ? <p className="ficha-ranking">{ranking.motivational_message}</p> : null}
      </section>

      <section className="ficha-section">
        <h2>Avisos importantes</h2>
        <div className="notice-stack">
          {notices.length ? notices.map((notice) => (
            <article className="ficha-notice" key={`${notice.notice_date}-${notice.title}`} style={{ borderLeftColor: notice.color ?? "#e5e7eb" }}>
              <strong>{notice.title}</strong>
              <p>{notice.body ?? ""}</p>
              <span>{formatDate(notice.notice_date)}</span>
            </article>
          )) : <div className="ficha-card">Sin avisos activos.</div>}
        </div>
      </section>

      <section className="ficha-section">
        <h2>Historial de exámenes</h2>
        <div className="exam-card-list">
          {exams.length ? exams.map((exam) => (
            <article className="ficha-card exam-card" key={`${exam.exam_date}-${exam.grade}`}>
              <strong>{exam.grade}</strong>
              <span>APTO · {formatDate(exam.exam_date)}</span>
              <p>Examinador: {exam.examiner ?? "-"}</p>
              <p>Registrado por: {exam.registered_by ?? "-"}</p>
              <DocumentLinks exam={exam} />
            </article>
          )) : <div className="ficha-card">Sin exámenes registrados.</div>}
        </div>
      </section>

      <section className="ficha-section">
        <h2>Nota del Sensei</h2>
        <div className="ficha-card">
          <p>{note?.note ?? "Sin nota visible para familia."}</p>
          <span className="ficha-muted">{note?.note_date ? `${formatDate(note.note_date)} · ${note.note_type ?? "Nota"}` : ""}</span>
        </div>
      </section>

      <section className="ficha-section">
        <h2>Comportamiento en clase</h2>
        <div className="ficha-card ficha-fields">
          <Field label="Actitud" value={behavior?.attitude} />
          <Field label="Atención" value={behavior?.attention} />
          <Field label="Respeto" value={behavior?.respect} />
          <Field label="Esfuerzo" value={behavior?.effort} />
          <Field label="Compañerismo" value={behavior?.companionship} />
          <Field label="Observación" value={behavior?.observation} />
        </div>
      </section>

      <Footer />
    </main>
  );
}

function HeaderLogos({ member, photoSrc, eyebrow }: { member: Member; photoSrc: string | null; eyebrow: string }) {
  return (
    <section className="ficha-hero">
      <div className="logo-box"><img src={LOGO_IKA_URL} alt="IKA" /></div>
      <div className="student-box">
        {photoSrc ? <img src={photoSrc} alt="" /> : <div className="student-placeholder" />}
        <p>{eyebrow}</p>
        <h1>{member.display_name}</h1>
        <span>{member.status === "active" ? "ACTIVO" : "INACTIVO"} · ID SKBC {member.legacy_id ?? "-"} · ID IKA {member.ika_id ?? "pendiente"}</span>
      </div>
      <div className="logo-box"><img src={LOGO_SKBC_URL} alt="SKBC Gipuzkoa" /></div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="ficha-field">
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === "" ? "-" : value}</strong>
    </div>
  );
}

function StatusBlock({ title, value }: { title: string; value: string }) {
  return (
    <article className="status-block">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="ficha-progress">
      <div><strong>{label}</strong><span>{pct}%</span></div>
      <i><b style={{ width: `${pct}%` }} /></i>
    </div>
  );
}

function CourseTable({ courses }: { courses: Course[] }) {
  return (
    <ResponsiveTable
      columns={["Fecha", "Curso", "Lugar", "Sensei"]}
      rows={courses.map((course) => [formatDate(course.course_date), course.title ?? "-", course.location ?? "-", course.sensei ?? "-"])}
      empty="Sin cursos registrados."
    />
  );
}

function ResponsiveTable({ columns, rows, empty }: { columns: string[]; rows: Array<Array<React.ReactNode>>; empty: string }) {
  return (
    <div className="ficha-table-wrap">
      <table className="ficha-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td data-label={columns[cellIndex]} key={columns[cellIndex]}>{cell}</td>)}
            </tr>
          )) : <tr><td colSpan={columns.length}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function DocumentLinks({ exam }: { exam: Exam }) {
  return (
    <span className="doc-links">
      {exam.report_url ? <a href={exam.report_url} target="_blank">Ver informe</a> : null}
      {exam.diploma_url ? <a href={exam.diploma_url} target="_blank">Ver diploma</a> : null}
      {!exam.report_url && !exam.diploma_url ? "-" : null}
    </span>
  );
}

function Footer() {
  return <footer className="ficha-footer">Datos del sistema nuevo SKBC. Ficha privada de consulta personal.</footer>;
}

function buildAdultActivity(attendance: Attendance[], courses: Course[]) {
  const today = startOfDay(new Date());
  const dates = attendance.map((row) => parseDate(row.attended_on)).filter((date): date is Date => Boolean(date));
  const last = dates[0] ?? null;
  const weeksSinceLast = last ? Math.floor(daysBetweenDates(last, today) / 7) : null;
  const attendance12m = dates.filter((date) => date >= addMonths(today, -12)).length;
  const attendance6m = dates.filter((date) => date >= addMonths(today, -6)).length;
  const attendance1m = dates.filter((date) => date >= addMonths(today, -1)).length;
  const activeThisWeek = dates.some((date) => date >= startOfWeek(today));
  const courses12m = courses.filter((course) => {
    const date = parseDate(course.course_date);
    return date && date >= addMonths(today, -12);
  }).length;
  const visualStatus = calculateVisualStatus(weeksSinceLast, attendance1m, activeThisWeek);
  const involvement = calculateInvolvement(attendance1m, attendance6m, courses12m, activeThisWeek);
  return { lastAttendance: last ? formatDateObject(last) : null, weeksSinceLast, attendance12m, attendance6m, attendance1m, activeThisWeek, courses12m, visualStatus, involvement };
}

function buildTechnicalProgress(targetGrade: string, techniques: Technique[], history: TechnicalHistory[]) {
  const repetitions = new Map<string, number>();
  for (const row of history) {
    if (!row.completed || !row.counts_as_progression) continue;
    const idKey = row.technique_id ? `id:${row.technique_id}` : "";
    const nameKey = `name:${normalize(row.technique_name)}`;
    if (idKey) repetitions.set(idKey, (repetitions.get(idKey) ?? 0) + 1);
    repetitions.set(nameKey, (repetitions.get(nameKey) ?? 0) + 1);
  }

  const details = techniques.map((technique) => {
    const reps = repetitions.get(`id:${technique.id}`) ?? repetitions.get(`name:${normalize(technique.name)}`) ?? 0;
    const repetitionsCapped = Math.min(reps, REPETITION_GOAL);
    return {
      id: technique.id,
      name: technique.name,
      category: technique.category.toUpperCase(),
      repetitions: reps,
      missing: Math.max(0, REPETITION_GOAL - reps),
      completed: reps >= REPETITION_GOAL,
      pct: repetitionsCapped / REPETITION_GOAL
    };
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || a.name.localeCompare(b.name));

  const byCategory = (category: string) => details.filter((item) => item.category === category);
  const average = (items: typeof details) => items.length ? items.reduce((sum, item) => sum + item.pct, 0) / items.length : 0;
  return {
    targetGrade,
    details,
    pending: details.filter((item) => !item.completed),
    completed: details.filter((item) => item.completed).length,
    total: details.length,
    pctGoho: average(byCategory("GOHO")),
    pctJuho: average(byCategory("JUHO")),
    pctGlobal: average(details)
  };
}

function buildAdultRanking(memberId: string, members: Array<{ id: string; legacy_id: string | null; display_name: string }>, attendance: Array<{ member_id: string; attended_on: string }>, courses: Array<{ member_id: string; course_date: string; kind: "national" | "international" }>, bonuses: AdultBonus[]) {
  const date30 = daysAgo(30);
  const date90 = daysAgo(90);
  const attendance30 = countByMember(attendance.filter((row) => row.attended_on >= date30));
  const attendance90 = countByMember(attendance.filter((row) => row.attended_on >= date90));
  const lastAttendance = latestByMember(attendance);
  const coursePoints = countCoursePoints(courses);
  const bonusPoints = sumByMember(bonuses);
  const ranked = members
    .filter((member) => member.legacy_id !== "13")
    .map((member) => {
      const a30 = attendance30.get(member.id) ?? 0;
      const a90 = attendance90.get(member.id) ?? 0;
      const daysWithoutAttendance = lastAttendance.get(member.id) ? daysBetween(lastAttendance.get(member.id) as string, new Date().toISOString().slice(0, 10)) : 0;
      const score = a30 * 3 + a90 - daysWithoutAttendance + (coursePoints.get(member.id) ?? 0) + (bonusPoints.get(member.id) ?? 0);
      return { ...member, score };
    })
    .sort((a, b) => b.score - a.score || a.display_name.localeCompare(b.display_name));
  const index = ranked.findIndex((row) => row.id === memberId);
  if (index === -1) return null;
  const row = ranked[index];
  return { position: index + 1, score: row.score, message: rankingMessage(row.display_name, index + 1) };
}

function calculateVisualStatus(weeksSinceLast: number | null, attendance1m: number, activeThisWeek: boolean) {
  if (activeThisWeek && attendance1m >= 4) return "A TOPE";
  if (weeksSinceLast !== null && weeksSinceLast <= 1 && attendance1m >= 2) return "MUY ACTIVO";
  if (weeksSinceLast !== null && weeksSinceLast <= 3) return "ACTIVO";
  if (weeksSinceLast !== null && weeksSinceLast <= 8) return "POCO ACTIVO";
  return "INACTIVO";
}

function calculateInvolvement(attendance1m: number, attendance6m: number, courses12m: number, activeThisWeek: boolean) {
  const score = (activeThisWeek ? 2 : 0) + Math.min(attendance1m, 6) + Math.min(Math.floor(attendance6m / 4), 4) + Math.min(courses12m * 2, 4);
  if (score >= 10) return "MUY IMPLICADO";
  if (score >= 7) return "IMPLICADO";
  if (score >= 4) return "IMPLICACION MEDIA";
  if (score >= 2) return "POCA IMPLICACION";
  return "MUY BAJA IMPLICACION";
}

function rankingMessage(displayName: string, position: number) {
  const firstName = displayName.split(" ")[0] || displayName;
  if (position === 1) return `Top 1: ${firstName}, eres el numero 1 del club. Increible, sigue asi.`;
  if (position === 2) return `Top 2: ${firstName}, estas en el puesto 2. Un paso mas y llegas a lo mas alto.`;
  if (position === 3) return `Top 3: ${firstName}, top 3 del club. Estas en el podio, genial.`;
  if (position <= 5) return `Top 5: ${firstName}, top 5 del club. Tu implicacion se nota, sigue asi.`;
  if (position <= 10) return `Top 10: ${firstName}, estas en el top 10. Vas muy bien, no pares.`;
  if (position <= 15) return `Puesto ${position}: ${firstName}, estas en la mitad alta, puedes subir mas.`;
  return `Puesto ${position}: ${firstName}, mas asistencias y cursos te haran subir rapido en el ranking.`;
}

function nextAdultGrade(grade: string | null) {
  const normalized = normalize(grade);
  const index = ADULT_GRADES.indexOf(normalized);
  if (index === -1) return grade ?? "";
  return ADULT_GRADES[Math.min(index + 1, ADULT_GRADES.length - 1)];
}

function nextKidGrade(grade: string | null) {
  const map = new Map([
    ["MINARAI", "BLANCO-AMARILLO"],
    ["BLANCOAMARILLO", "AMARILLO"],
    ["AMARILLO", "AMARILLO-NARANJA"],
    ["AMARILLONARANJA", "NARANJA"],
    ["NARANJA", "NARANJA-VERDE"],
    ["NARANJAVERDE", "VERDE"],
    ["VERDE", "VERDE-AZUL"],
    ["VERDEAZUL", "AZUL"],
    ["AZUL", "AZUL-MARRON"],
    ["AZULMARRON", "MARRON"],
    ["MARRON", "1 KYU"]
  ]);
  return map.get(normalize(grade).replace(/\s|-/g, "")) ?? "SIGUIENTE ETAPA";
}

function countSince(attendance: Attendance[], days: number) {
  const limit = startOfDay(new Date());
  limit.setDate(limit.getDate() - days);
  return attendance.filter((row) => {
    const date = parseDate(row.attended_on);
    return date && date >= limit;
  }).length;
}

function countByMember(rows: Array<{ member_id: string }>) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.member_id, (counts.get(row.member_id) ?? 0) + 1));
  return counts;
}

function sumByMember(rows: Array<{ member_id: string; points: number }>) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.member_id, (counts.get(row.member_id) ?? 0) + row.points));
  return counts;
}

function countCoursePoints(rows: Array<{ member_id: string; kind: "national" | "international" }>) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.member_id, (counts.get(row.member_id) ?? 0) + (row.kind === "international" ? 3 : 1)));
  return counts;
}

function latestByMember(rows: Array<{ member_id: string; attended_on: string }>) {
  const latest = new Map<string, string>();
  rows.forEach((row) => {
    const current = latest.get(row.member_id);
    if (!current || row.attended_on > current) latest.set(row.member_id, row.attended_on);
  });
  return latest;
}

function ageText(value: string | null) {
  const date = parseDate(value);
  if (!date) return "";
  const today = new Date();
  let years = today.getFullYear() - date.getFullYear();
  let months = today.getMonth() - date.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years <= 0) return `${months} meses`;
  if (months === 0) return `${years} años`;
  return `${years} años y ${months} meses`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = parseDate(value);
  if (!date) return value;
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateObject(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) next.setDate(0);
  return startOfDay(next);
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 86400000)) : 0;
}

function daysBetweenDates(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeCss(value: string) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
