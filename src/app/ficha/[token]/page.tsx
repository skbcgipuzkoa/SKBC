import { notFound } from "next/navigation";
import { driveImageUrl } from "@/lib/drive";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  ika_id: string | null;
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

type ChildNotice = {
  notice_date: string | null;
  title: string;
  body: string | null;
  color: string | null;
};

export default async function PublicFichaPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: member, error } = await supabase
    .from("members")
    .select("id,legacy_id,ika_id,display_name,class,status,grade,joined_on,last_exam_on,next_exam_on,exam_notice,semaphore,photo_url")
    .eq("ficha_token", token)
    .single<Member>();

  if (error || !member) notFound();

  const [{ data: attendance }, { data: exams }, { data: courses }, childRankingResult, childNoticesResult] = await Promise.all([
    supabase
      .from("attendance_logs")
      .select("attended_on,official_grade,trained_grade,classes(name)")
      .eq("member_id", member.id)
      .order("attended_on", { ascending: false })
      .limit(10)
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
          .from("child_notices")
          .select("notice_date,title,body,color")
          .eq("member_id", member.id)
          .eq("active", true)
          .order("notice_date", { ascending: false, nullsFirst: false })
          .limit(4)
          .returns<ChildNotice[]>()
      : Promise.resolve({ data: [], error: null })
  ]);

  const photoSrc = driveImageUrl(member.photo_url);
  const childRanking = childRankingResult.data;
  const childNotices = childNoticesResult.data ?? [];

  return (
    <main className="public-ficha">
      <section className="public-hero">
        <div className="public-profile">
          {photoSrc ? <img src={photoSrc} alt="" /> : <div className="avatar-placeholder" />}
          <div>
            <p className="eyebrow">Ficha SKBC Gipuzkoa</p>
            <h1>{member.display_name}</h1>
            <p>{member.class === "kids" ? "Infantil" : "Adulto"} · {member.status === "active" ? "Activo" : "Inactivo"}</p>
          </div>
        </div>
      </section>

      <section className="grid stats compact">
        <article className="card"><h2>ID SKBC</h2><div className="metric small">{member.legacy_id ?? "-"}</div></article>
        <article className="card"><h2>ID IKA</h2><div className="metric small">{member.ika_id ?? "Pendiente"}</div></article>
        <article className="card"><h2>Grado</h2><div className="metric small">{member.grade ?? "-"}</div></article>
        <article className="card"><h2>Semaforo</h2><div className="metric small">{member.semaphore ?? "-"}</div></article>
      </section>

      <section className="grid stats compact">
        <article className="card"><h2>Fecha ingreso</h2><div className="metric small">{member.joined_on ?? "-"}</div></article>
        <article className="card"><h2>Ultimo examen</h2><div className="metric small">{member.last_exam_on ?? "-"}</div></article>
        <article className="card"><h2>Proximo examen</h2><div className="metric small">{member.next_exam_on ?? "-"}</div></article>
        <article className="card"><h2>Aviso</h2><p className="muted">{member.exam_notice ?? "-"}</p></article>
      </section>

      {member.class === "kids" ? (
        <section className="split-section">
          <article>
            <h2 className="section-title">Constancia</h2>
            <div className="card">
              <div className="metric small">{childRanking?.position ? `#${childRanking.position}` : "-"}</div>
              <p className="muted">{childRanking?.level ?? childRanking?.constancy_status ?? "Sin actividad reciente"}</p>
              <p>{childRanking?.motivational_message ?? ""}</p>
            </div>
          </article>
          <article>
            <h2 className="section-title">Avisos</h2>
            <div className="stack-list">
              {childNotices.length ? childNotices.map((notice) => (
                <div className="notice-row" key={`${notice.notice_date}-${notice.title}`} style={{ borderLeftColor: notice.color ?? "#d9e2ec" }}>
                  <strong>{notice.title}</strong>
                  <p>{notice.body ?? "-"}</p>
                  <span className="muted">{notice.notice_date ?? "-"}</span>
                </div>
              )) : <p className="muted">Sin avisos activos.</p>}
            </div>
          </article>
        </section>
      ) : null}

      <section className="split-section">
        <article>
          <h2 className="section-title">Ultimas asistencias</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Clase</th><th>Grado</th></tr></thead>
              <tbody>
                {(attendance ?? []).map((item) => (
                  <tr key={`${item.attended_on}-${item.classes?.name}`}>
                    <td data-label="Fecha">{item.attended_on}</td>
                    <td data-label="Clase">{item.classes?.name ?? "-"}</td>
                    <td data-label="Grado">{item.trained_grade ?? item.official_grade ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
        <article>
          <h2 className="section-title">Examenes</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Grado</th><th>Documento</th></tr></thead>
              <tbody>
                {(exams ?? []).map((item) => (
                  <tr key={`${item.exam_date}-${item.grade}`}>
                    <td data-label="Fecha">{item.exam_date}</td>
                    <td data-label="Grado">{item.grade}</td>
                    <td data-label="Documento">{item.diploma_url ? <a className="text-link" href={item.diploma_url} target="_blank">Abrir</a> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <h2 className="section-title">Cursos</h2>
      <section className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Curso</th><th>Lugar</th><th>Sensei</th></tr></thead>
          <tbody>
            {(courses ?? []).map((item) => (
              <tr key={`${item.course_date}-${item.kind}-${item.title}`}>
                <td data-label="Fecha">{item.course_date}</td>
                <td data-label="Tipo">{item.kind === "national" ? "Nacional" : "Internacional"}</td>
                <td data-label="Curso">{item.title ?? "-"}</td>
                <td data-label="Lugar">{item.location ?? "-"}</td>
                <td data-label="Sensei">{item.sensei ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
