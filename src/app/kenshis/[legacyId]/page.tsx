import { ArrowLeft, LogOut } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ensureFichaTokenAction, logoutAction, updateKenshiAction } from "@/app/actions";
import { KenshiForm } from "@/components/kenshi-form";
import { hasInternalAccess } from "@/lib/auth";
import { driveImageUrl } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  ika_id: string | null;
  first_name: string;
  last_name: string | null;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
  next_exam_on: string | null;
  exam_notice: string | null;
  exam_history: string | null;
  attendance_history: string | null;
  site_url: string | null;
  semaphore: string | null;
  family_email: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  student_phone: string | null;
  address: string | null;
  photo_url: string | null;
  ficha_token: string | null;
  legacy_ficha_url: string | null;
};

type Attendance = {
  attended_on: string;
  official_grade: string | null;
  trained_grade: string | null;
  technical_role: string;
  classes: { name: string | null } | null;
};

type Exam = {
  exam_date: string;
  grade: string;
  examiner: string | null;
  diploma_url: string | null;
};

type Course = {
  kind: string;
  course_date: string;
  location: string | null;
  title: string | null;
  sensei: string | null;
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

type ChildNote = {
  note_date: string | null;
  note_type: string | null;
  note: string | null;
  author: string | null;
};

type ChildNotice = {
  notice_date: string | null;
  title: string;
  body: string | null;
  color: string | null;
  source: string;
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

export default async function KenshiDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ legacyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const { legacyId } = await params;
  const notices = await searchParams;
  const supabase = createAdminClient();

  const { data: member, error } = await supabase
    .from("members")
    .select(
      "id,legacy_id,ika_id,first_name,last_name,class,status,grade,joined_on,last_exam_on,next_exam_on,exam_notice,exam_history,attendance_history,site_url,semaphore,family_email,guardian_name,guardian_phone,student_phone,address,photo_url,ficha_token,legacy_ficha_url"
    )
    .eq("legacy_id", legacyId)
    .single<Member>();

  if (error || !member) notFound();
  const photoSrc = driveImageUrl(member.photo_url);

  const [{ data: attendance }, { data: exams }, { data: courses }, childRankingResult, childNotesResult, childNoticesResult, childBehaviorResult] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("attended_on,official_grade,trained_grade,technical_role,classes(name)")
      .eq("member_id", member.id)
      .order("attended_on", { ascending: false })
      .limit(12)
      .returns<Attendance[]>(),
    supabase
      .from("exams")
      .select("exam_date,grade,examiner,diploma_url")
      .eq("member_id", member.id)
      .order("exam_date", { ascending: false })
      .returns<Exam[]>(),
    supabase
      .from("courses")
      .select("kind,course_date,location,title,sensei")
      .eq("member_id", member.id)
      .order("course_date", { ascending: false })
      .returns<Course[]>(),
    member.class === "kids"
      ? supabase
          .from("child_rankings")
          .select("attendance_30d,attendance_90d,last_attendance_on,days_without_attendance,score,position,level,constancy_status,motivational_message")
          .eq("member_id", member.id)
          .maybeSingle<ChildRanking>()
      : Promise.resolve({ data: null, error: null }),
    member.class === "kids"
      ? supabase
          .from("child_notes")
          .select("note_date,note_type,note,author")
          .eq("member_id", member.id)
          .eq("visible_family", true)
          .order("note_date", { ascending: false, nullsFirst: false })
          .limit(3)
          .returns<ChildNote[]>()
      : Promise.resolve({ data: [], error: null }),
    member.class === "kids"
      ? supabase
          .from("child_notices")
          .select("notice_date,title,body,color,source")
          .eq("member_id", member.id)
          .eq("active", true)
          .order("notice_date", { ascending: false, nullsFirst: false })
          .limit(6)
          .returns<ChildNotice[]>()
      : Promise.resolve({ data: [], error: null }),
    member.class === "kids"
      ? supabase
          .from("child_behavior_reports")
          .select("report_date,attitude,attention,respect,effort,companionship,observation")
          .eq("member_id", member.id)
          .order("report_date", { ascending: false, nullsFirst: false })
          .limit(1)
          .returns<ChildBehavior[]>()
      : Promise.resolve({ data: [], error: null })
  ]);
  const childRanking = childRankingResult.data;
  const childNotes = childNotesResult.data ?? [];
  const childNotices = childNoticesResult.data ?? [];
  const childBehavior = childBehaviorResult.data?.[0] ?? null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis" aria-current="page">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings">Rankings</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">
              <a className="text-link" href="/kenshis"><ArrowLeft size={14} aria-hidden="true" /> Volver</a>
            </p>
            <h1>{member.first_name} {member.last_name}</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="profile-grid">
          <article className="card profile-card">
            {photoSrc ? <img src={photoSrc} alt="" /> : <div className="avatar-placeholder" />}
            <div>
              <span className={`pill ${member.status}`}>{member.status === "active" ? "Activo" : "Inactivo"}</span>
              <h2>{member.grade ?? "Sin grado"}</h2>
              <p className="muted">{member.class === "kids" ? "Ninos" : "Adultos"}</p>
            </div>
          </article>
          <article className="card detail-list">
            <h2>Datos</h2>
            <p><strong>ID SKBC:</strong> {member.legacy_id}</p>
            <KenshiForm
              action={updateKenshiAction}
              submitLabel="Guardar cambios"
              hiddenFields={{ memberId: member.id, legacyId: member.legacy_id ?? "" }}
              saved={notices.saved === "kenshi"}
              error={notices.error === "kenshi"}
              initial={{
                firstName: member.first_name,
                lastName: member.last_name,
                ikaId: member.ika_id,
                grade: member.grade,
                joinedOn: member.joined_on,
                class: member.class,
                status: member.status,
                familyEmail: member.family_email,
                guardianName: member.guardian_name,
                guardianPhone: member.guardian_phone,
                studentPhone: member.student_phone,
                address: member.address,
                siteUrl: member.site_url,
                examHistory: member.exam_history
              }}
            />
            {notices.error === "photo" ? <p className="form-error">No se pudo subir la foto.</p> : null}
            {notices.saved === "ficha" ? <p className="save-ok">Enlace de ficha nueva creado.</p> : null}
            {notices.error === "ficha" ? <p className="form-error">No se pudo crear el enlace de ficha nueva.</p> : null}
            <div className="profile-actions">
              {member.ficha_token ? <a className="text-link" href={`/ficha/${member.ficha_token}`} target="_blank">Abrir ficha nueva</a> : (
                <form action={ensureFichaTokenAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <input type="hidden" name="legacyId" value={member.legacy_id ?? ""} />
                  <button className="mini-action selected" type="submit">Crear enlace ficha nueva</button>
                </form>
              )}
              {member.legacy_ficha_url ? <a className="text-link" href={member.legacy_ficha_url} target="_blank">Abrir ficha actual</a> : null}
            </div>
          </article>
        </section>

        <h2 className="section-title">Datos calculados</h2>
        <section className="grid stats compact">
          <article className="card"><h2>Ultimo examen</h2><div className="metric small">{member.last_exam_on ?? "-"}</div></article>
          <article className="card"><h2>Proximo examen</h2><div className="metric small">{member.next_exam_on ?? "-"}</div></article>
          <article className="card"><h2>Semaforo</h2><div className="metric small">{member.semaphore ?? "-"}</div></article>
          <article className="card"><h2>Aviso</h2><p className="muted">{member.exam_notice ?? "-"}</p></article>
        </section>

        {member.class === "kids" ? (
          <>
            <h2 className="section-title">Ficha infantil nueva</h2>
            <section className="grid stats compact">
              <article className="card">
                <h2>Ranking</h2>
                <div className="metric small">{childRanking?.position ? `#${childRanking.position}` : "-"}</div>
                <p className="muted">{childRanking?.level ?? "Sin actividad reciente"}</p>
              </article>
              <article className="card">
                <h2>Asistencia 30/90</h2>
                <div className="metric small">{childRanking ? `${childRanking.attendance_30d}/${childRanking.attendance_90d}` : "-"}</div>
                <p className="muted">{childRanking?.constancy_status ?? "-"}</p>
              </article>
              <article className="card">
                <h2>Ultima asistencia</h2>
                <div className="metric small">{childRanking?.last_attendance_on ?? "-"}</div>
                <p className="muted">{childRanking?.days_without_attendance ?? 0} dias sin venir</p>
              </article>
              <article className="card">
                <h2>Mensaje</h2>
                <p className="muted">{childRanking?.motivational_message ?? "-"}</p>
              </article>
            </section>

            <section className="split-section">
              <article>
                <h2 className="section-title">Avisos activos</h2>
                <div className="stack-list">
                  {childNotices.length ? childNotices.map((notice) => (
                    <div className="notice-row" key={`${notice.source}-${notice.title}-${notice.notice_date}`} style={{ borderLeftColor: notice.color ?? "#d9e2ec" }}>
                      <strong>{notice.title}</strong>
                      <p>{notice.body ?? "-"}</p>
                      <span className="muted">{notice.notice_date ?? "-"} · {notice.source === "system" ? "Sistema" : "Manual"}</span>
                    </div>
                  )) : <p className="muted">Sin avisos activos.</p>}
                </div>
              </article>
              <article>
                <h2 className="section-title">Notas y comportamiento</h2>
                <div className="stack-list">
                  {childNotes.length ? childNotes.map((note) => (
                    <div className="notice-row" key={`${note.note_date}-${note.note}`}>
                      <strong>{note.note_type ?? "Nota sensei"}</strong>
                      <p>{note.note ?? "-"}</p>
                      <span className="muted">{note.note_date ?? "-"} · {note.author ?? "-"}</span>
                    </div>
                  )) : <p className="muted">Sin notas visibles para familia.</p>}
                  {childBehavior ? (
                    <div className="notice-row">
                      <strong>Comportamiento</strong>
                      <p>Actitud: {childBehavior.attitude ?? "-"} · Atencion: {childBehavior.attention ?? "-"} · Respeto: {childBehavior.respect ?? "-"} · Esfuerzo: {childBehavior.effort ?? "-"}</p>
                      <span className="muted">{childBehavior.report_date ?? "-"} · {childBehavior.observation ?? "Sin observacion"}</span>
                    </div>
                  ) : null}
                </div>
              </article>
            </section>
          </>
        ) : null}

        <h2 className="section-title">Ultimas asistencias</h2>
        <section className="table-wrap">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Clase</th><th>Grado oficial</th><th>Grado entrenado</th><th>Rol</th></tr>
            </thead>
            <tbody>
              {(attendance ?? []).map((item) => (
                <tr key={`${item.attended_on}-${item.classes?.name}`}>
                  <td data-label="Fecha">{item.attended_on}</td>
                  <td data-label="Clase">{item.classes?.name ?? "-"}</td>
                  <td data-label="Grado oficial">{item.official_grade ?? "-"}</td>
                  <td data-label="Grado entrenado">{item.trained_grade ?? "-"}</td>
                  <td data-label="Rol">{item.technical_role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="split-section">
          <article>
            <h2 className="section-title">Examenes</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Grado</th><th>Examinador</th><th>Documento</th></tr></thead>
                <tbody>
                  {(exams ?? []).map((item) => (
                    <tr key={`${item.exam_date}-${item.grade}`}>
                      <td data-label="Fecha">{item.exam_date}</td>
                      <td data-label="Grado">{item.grade}</td>
                      <td data-label="Examinador">{item.examiner ?? "-"}</td>
                      <td data-label="Documento">{item.diploma_url ? <a className="text-link" href={item.diploma_url} target="_blank">Abrir</a> : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
          <article>
            <h2 className="section-title">Cursos</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Fecha</th><th>Tipo</th><th>Curso</th><th>Lugar</th></tr></thead>
                <tbody>
                  {(courses ?? []).map((item) => (
                    <tr key={`${item.course_date}-${item.kind}-${item.title}`}>
                      <td data-label="Fecha">{item.course_date}</td>
                      <td data-label="Tipo">{item.kind === "national" ? "Nacional" : "Internacional"}</td>
                      <td data-label="Curso">{item.title ?? "-"}</td>
                      <td data-label="Lugar">{item.location ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
