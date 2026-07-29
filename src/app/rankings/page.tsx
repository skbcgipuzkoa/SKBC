import { Award, Dumbbell, LogOut, Medal, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { hasInternalAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Member = {
  id: string;
  legacy_id: string | null;
  ika_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: "active" | "inactive";
};

type Attendance = {
  member_id: string;
  attended_on: string;
};

type TechnicalHistory = {
  member_id: string;
  class_date: string;
};

type Exam = {
  member_id: string;
  exam_date: string;
};

type ChildRanking = {
  member_id: string;
  attendance_30d: number;
  attendance_90d: number;
  last_attendance_on: string | null;
  days_without_attendance: number | null;
  score: number;
  position: number | null;
  level: string | null;
  members: {
    legacy_id: string | null;
    ika_id: string | null;
    display_name: string;
    grade: string | null;
    status: "active" | "inactive";
  } | null;
};

type AdultRankingRow = Member & {
  attendance30: number;
  attendance90: number;
  technical90: number;
  exams365: number;
  score: number;
};

const today = new Date();
const date30 = daysAgo(30);
const date90 = daysAgo(90);
const date365 = daysAgo(365);

export default async function RankingsPage() {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, { data: attendance, error: attendanceError }, { data: technical, error: technicalError }, { data: exams, error: examsError }, { data: childRankings, error: childError }] =
    await Promise.all([
      supabase
        .from("members")
        .select("id,legacy_id,ika_id,display_name,class,grade,status")
        .eq("status", "active")
        .returns<Member[]>(),
      supabase
        .from("attendance_logs")
        .select("member_id,attended_on")
        .gte("attended_on", date90)
        .returns<Attendance[]>(),
      supabase
        .from("member_technical_history")
        .select("member_id,class_date")
        .gte("class_date", date90)
        .eq("completed", true)
        .returns<TechnicalHistory[]>(),
      supabase
        .from("exams")
        .select("member_id,exam_date")
        .gte("exam_date", date365)
        .returns<Exam[]>(),
      supabase
        .from("child_rankings")
        .select("member_id,attendance_30d,attendance_90d,last_attendance_on,days_without_attendance,score,position,level,members(legacy_id,ika_id,display_name,grade,status)")
        .order("position", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false })
        .limit(10)
        .returns<ChildRanking[]>()
    ]);

  if (membersError) throw membersError;
  if (attendanceError) throw attendanceError;
  if (technicalError) throw technicalError;
  if (examsError) throw examsError;
  if (childError) throw childError;

  const adults = buildAdultRanking(members ?? [], attendance ?? [], technical ?? [], exams ?? []).slice(0, 10);
  const kids = (childRankings ?? []).filter((row) => row.members?.status === "active").slice(0, 10);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings" aria-current="page">Rankings</a>
          <a href="/auditoria">Auditoria</a>
          <a href="/importacion">Importacion</a>
          <a href="/novedades">Novedades</a>
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Top 10 adultos y top 10 ninos</p>
            <h1>Rankings SKBC</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="grid stats compact" aria-label="Resumen rankings">
          <article className="card">
            <Medal aria-hidden="true" size={19} />
            <h2>Lider adulto</h2>
            <div className="metric small">{adults[0]?.display_name ?? "-"}</div>
            <p className="muted">{adults[0] ? `${adults[0].score} puntos` : "Sin datos"}</p>
          </article>
          <article className="card">
            <Award aria-hidden="true" size={19} />
            <h2>Lider ninos</h2>
            <div className="metric small">{kids[0]?.members?.display_name ?? "-"}</div>
            <p className="muted">{kids[0] ? `${kids[0].score} puntos` : "Sin datos"}</p>
          </article>
          <article className="card">
            <Dumbbell aria-hidden="true" size={19} />
            <h2>Tecnicas 90 dias</h2>
            <div className="metric">{adults.reduce((sum, row) => sum + row.technical90, 0)}</div>
          </article>
          <article className="card">
            <Users aria-hidden="true" size={19} />
            <h2>En ranking</h2>
            <div className="metric">{adults.length + kids.length}</div>
          </article>
        </section>

        <section className="ranking-columns">
          <article>
            <div className="section-heading-row">
              <h2 className="section-title">Adultos</h2>
              <span className="tag">Score = 30d*3 + 90d + tecnicas*2 + examenes*10</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Kenshi</th><th>Grado</th><th>Asist. 30/90</th><th>Tecnicas 90</th><th>Examenes</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {adults.length ? adults.map((row, index) => (
                    <tr key={row.id}>
                      <td data-label="#">{index + 1}</td>
                      <td data-label="Kenshi">
                        {row.legacy_id ? <a className="text-link" href={`/kenshis/${row.legacy_id}`}>{row.display_name}</a> : <strong>{row.display_name}</strong>}
                        <span className="ranking-id">ID {row.legacy_id ?? "-"} · IKA {row.ika_id ?? "pendiente"}</span>
                      </td>
                      <td data-label="Grado">{row.grade ?? "-"}</td>
                      <td data-label="Asist. 30/90">{row.attendance30}/{row.attendance90}</td>
                      <td data-label="Tecnicas 90">{row.technical90}</td>
                      <td data-label="Examenes">{row.exams365}</td>
                      <td data-label="Score"><strong>{row.score}</strong></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="muted">Sin datos suficientes para ranking adulto.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article>
            <div className="section-heading-row">
              <h2 className="section-title">Ninos</h2>
              <span className="tag">Ranking infantil importado/calculado</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Kenshi</th><th>Grado</th><th>Asist. 30/90</th><th>Ultima</th><th>Nivel</th><th>Score</th></tr>
                </thead>
                <tbody>
                  {kids.length ? kids.map((row, index) => (
                    <tr key={row.member_id}>
                      <td data-label="#">{row.position ?? index + 1}</td>
                      <td data-label="Kenshi">
                        {row.members?.legacy_id ? <a className="text-link" href={`/kenshis/${row.members.legacy_id}`}>{row.members.display_name}</a> : <strong>{row.members?.display_name ?? "-"}</strong>}
                        <span className="ranking-id">ID {row.members?.legacy_id ?? "-"} · IKA {row.members?.ika_id ?? "pendiente"}</span>
                      </td>
                      <td data-label="Grado">{row.members?.grade ?? "-"}</td>
                      <td data-label="Asist. 30/90">{row.attendance_30d}/{row.attendance_90d}</td>
                      <td data-label="Ultima">{row.last_attendance_on ?? "-"}{row.days_without_attendance !== null ? ` · ${row.days_without_attendance} dias` : ""}</td>
                      <td data-label="Nivel">{row.level ?? "-"}</td>
                      <td data-label="Score"><strong>{row.score}</strong></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="muted">Sin ranking infantil calculado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}

function buildAdultRanking(members: Member[], attendance: Attendance[], technical: TechnicalHistory[], exams: Exam[]): AdultRankingRow[] {
  const adults = members.filter((member) => member.class === "adults");
  const attendance30 = countByMember(attendance.filter((row) => row.attended_on >= date30));
  const attendance90 = countByMember(attendance);
  const technical90 = countByMember(technical);
  const exams365 = countByMember(exams);

  return adults
    .map((member) => {
      const a30 = attendance30.get(member.id) ?? 0;
      const a90 = attendance90.get(member.id) ?? 0;
      const t90 = technical90.get(member.id) ?? 0;
      const e365 = exams365.get(member.id) ?? 0;
      return {
        ...member,
        attendance30: a30,
        attendance90: a90,
        technical90: t90,
        exams365: e365,
        score: a30 * 3 + a90 + t90 * 2 + e365 * 10
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.attendance30 - a.attendance30 || a.display_name.localeCompare(b.display_name));
}

function countByMember(rows: Array<{ member_id: string }>) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.member_id, (counts.get(row.member_id) ?? 0) + 1));
  return counts;
}

function daysAgo(days: number) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
