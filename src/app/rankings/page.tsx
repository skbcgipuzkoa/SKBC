import { Award, Dumbbell, LogOut, Medal, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { addAdultRankingBonusAction, deactivateAdultRankingBonusAction, logoutAction } from "@/app/actions";
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

type Course = {
  member_id: string;
  course_date: string;
  kind: "national" | "international";
};

type AdultBonus = {
  id: string;
  member_id: string;
  bonus_date: string;
  points: number;
  reason: string;
  active: boolean;
  permanent: boolean;
  ended_at: string | null;
  members: { display_name: string; legacy_id: string | null } | null;
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
  daysWithoutAttendance: number;
  nationalCoursePoints: number;
  internationalCoursePoints: number;
  manualBonus: number;
  blackBeltPoints: number;
  shakujoPoints: number;
  score: number;
};

const today = new Date();
const date30 = daysAgo(30);
const date90 = daysAgo(90);
const date180 = daysAgo(180);

export default async function RankingsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, { data: attendance, error: attendanceError }, { data: technical, error: technicalError }, { data: courses, error: coursesError }, { data: childRankings, error: childError }, blackBeltResult, shakujoResult] =
    await Promise.all([
      supabase
        .from("members")
        .select("id,legacy_id,ika_id,display_name,class,grade,status")
        .eq("status", "active")
        .returns<Member[]>(),
      supabase
        .from("attendance_logs")
        .select("member_id,attended_on")
        .returns<Attendance[]>(),
      supabase
        .from("member_technical_history")
        .select("member_id,class_date")
        .gte("class_date", date90)
        .eq("completed", true)
        .returns<TechnicalHistory[]>(),
      supabase
        .from("courses")
        .select("member_id,course_date,kind")
        .gte("course_date", date180)
        .returns<Course[]>(),
      supabase
        .from("child_rankings")
        .select("member_id,attendance_30d,attendance_90d,last_attendance_on,days_without_attendance,score,position,level,members(legacy_id,ika_id,display_name,grade,status)")
        .order("position", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false })
        .limit(10)
        .returns<ChildRanking[]>()
      ,
      supabase
        .from("black_belt_special_attendance")
        .select("member_id,status,black_belt_special_classes(class_date)")
        .returns<any[]>()
      ,
      supabase
        .from("shakujo_attendance")
        .select("member_id,shakujo_classes(class_date)")
        .returns<any[]>()
    ]);

  if (membersError) throw membersError;
  if (attendanceError) throw attendanceError;
  if (technicalError) throw technicalError;
  if (coursesError) throw coursesError;
  if (childError) throw childError;

  const [bonusResult, recentBonusResult] = await Promise.all([
    supabase
      .from("adult_ranking_bonuses")
      .select("id,member_id,bonus_date,points,reason,active,permanent,ended_at,members(display_name,legacy_id)")
      .or(`active.eq.true,bonus_date.gte.${date180}`)
      .returns<AdultBonus[]>(),
    supabase
      .from("adult_ranking_bonuses")
      .select("id,member_id,bonus_date,points,reason,active,permanent,ended_at,members(display_name,legacy_id)")
      .eq("active", true)
      .order("bonus_date", { ascending: false })
      .limit(20)
      .returns<AdultBonus[]>()
  ]);
  const bonusTableReady = !bonusResult.error && !recentBonusResult.error;
  const bonuses = bonusTableReady ? bonusResult.data ?? [] : [];
  const recentBonuses = bonusTableReady ? recentBonusResult.data ?? [] : [];

  const blackBeltRows = blackBeltResult.error ? [] : blackBeltResult.data ?? [];
  const shakujoRows = shakujoResult.error ? [] : shakujoResult.data ?? [];
  const adults = buildAdultRanking(members ?? [], attendance ?? [], technical ?? [], courses ?? [], bonuses ?? [], blackBeltRows, shakujoRows).slice(0, 10);
  const adultMembers = (members ?? []).filter((member) => member.class === "adults" && member.legacy_id !== "13");
  const kids = (childRankings ?? []).filter((row) => row.members?.status === "active").slice(0, 10);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>SKBC Gipuzkoa</strong>
          <span>Admin privado</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <a href="/">Inicio</a>
          <a href="/kenshis">Kenshis</a>
          <a href="/clases">Clases</a>
          <a href="/tecnicas">Tecnicas</a>
          <a href="/examenes">Examenes</a>
          <a href="/cursos">Cursos</a>
          <a href="/pedidos-cinturones">Cinturones</a>
          <a href="/proximos-examenes">Proximos examenes</a>
          <a href="/rankings" aria-current="page">Rankings</a>
          <a href="/sistema">Sistema</a>
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

        {params.saved === "bonus" ? <p className="save-ok">Bonus manual guardado.</p> : null}
        {params.error === "bonus" ? <p className="form-error">No se pudo guardar el bonus manual.</p> : null}
        {!bonusTableReady ? <p className="form-error">Bonus manual pendiente de activar: falta aplicar la migracion de Supabase.</p> : null}

        {bonusTableReady ? <section className="split-section">
          <article className="card">
            <h2>Bonus adulto permanente</h2>
            <form action={addAdultRankingBonusAction} className="quick-form">
              <label>
                Kenshi
                <select name="memberId" required>
                  <option value="">Seleccionar adulto</option>
                  {adultMembers.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.display_name} · ID {member.legacy_id}
                    </option>
                  ))}
                </select>
              </label>
              <label>Desde<input name="bonusDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
              <label>Puntos<input name="points" type="number" defaultValue="1" step="1" required /></label>
              <label className="wide">Motivo<input name="reason" placeholder="Ayuda en clase, tatami, apoyo a ninos..." required /></label>
              <button type="submit">Activar bonus</button>
            </form>
          </article>
          <article className="card">
            <h2>Bonus activos</h2>
            <div className="stack-list compact-stack">
              {(recentBonuses ?? []).length ? (recentBonuses ?? []).map((bonus) => (
                <div className="bonus-row" key={bonus.id}>
                  <strong>{bonus.points > 0 ? `+${bonus.points}` : bonus.points}</strong>
                  <span>{bonus.members?.display_name ?? "-"} · {bonus.bonus_date}</span>
                  <p>{bonus.reason}</p>
                  <form action={deactivateAdultRankingBonusAction}>
                    <input type="hidden" name="bonusId" value={bonus.id} />
                    <button className="mini-action danger" type="submit">Quitar</button>
                  </form>
                </div>
              )) : <p className="muted">Sin bonus activos todavia.</p>}
            </div>
          </article>
        </section> : null}

        <section className="ranking-columns">
          <article>
            <div className="section-heading-row">
              <h2 className="section-title">Adultos</h2>
              <span className="tag">Legacy: 30d*3 + 90d - dias sin venir + cursos + bonus</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>Kenshi</th><th>Grado</th><th>Asist. 30/90</th><th>Dias sin venir</th><th>Cursos</th><th>Busen</th><th>Shakujo</th><th>Bonus</th><th>Score</th></tr>
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
                      <td data-label="Dias sin venir">{row.daysWithoutAttendance}</td>
                      <td data-label="Cursos">{row.nationalCoursePoints + row.internationalCoursePoints}</td>
                      <td data-label="Busen">{row.blackBeltPoints}</td>
                      <td data-label="Shakujo">{row.shakujoPoints}</td>
                      <td data-label="Bonus">{row.manualBonus}</td>
                      <td data-label="Score"><strong>{row.score}</strong></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={10} className="muted">Sin datos suficientes para ranking adulto.</td></tr>
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

function buildAdultRanking(members: Member[], attendance: Attendance[], technical: TechnicalHistory[], courses: Course[], bonuses: AdultBonus[], blackBeltRows: any[], shakujoRows: any[]): AdultRankingRow[] {
  const adults = members.filter((member) => member.class === "adults" && member.legacy_id !== "13");
  const attendance30 = countByMember(attendance.filter((row) => row.attended_on >= date30));
  const attendance90 = countByMember(attendance.filter((row) => row.attended_on >= date90));
  const technical90 = countByMember(technical);
  const nationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "national").map((row) => ({ member_id: row.member_id, points: 1 })));
  const internationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "international").map((row) => ({ member_id: row.member_id, points: 3 })));
  const manualBonus = sumByMember(
    bonuses
      .filter((row) => (row.permanent && row.active) || (!row.permanent && row.bonus_date >= date180))
      .map((row) => ({ member_id: row.member_id, points: row.points }))
  );
  const blackBeltPoints = sumByMember(
    blackBeltRows
      .filter((row) => row.black_belt_special_classes?.class_date >= date180)
      .map((row) => ({ member_id: row.member_id, points: row.status === "present" ? 3 : row.status === "absent" ? -2 : 0 }))
  );
  const shakujoPoints = sumByMember(
    shakujoRows
      .filter((row) => row.shakujo_classes?.class_date >= date180)
      .map((row) => ({ member_id: row.member_id, points: 2 }))
  );
  const lastAttendance = latestAttendanceByMember(attendance);

  return adults
    .map((member) => {
      const a30 = attendance30.get(member.id) ?? 0;
      const a90 = attendance90.get(member.id) ?? 0;
      const t90 = technical90.get(member.id) ?? 0;
      const daysWithoutAttendance = lastAttendance.get(member.id) ? daysBetween(lastAttendance.get(member.id) as string, new Date().toISOString().slice(0, 10)) : 0;
      const nac = nationalCoursePoints.get(member.id) ?? 0;
      const intl = internationalCoursePoints.get(member.id) ?? 0;
      const bonus = manualBonus.get(member.id) ?? 0;
      const black = blackBeltPoints.get(member.id) ?? 0;
      const shakujo = shakujoPoints.get(member.id) ?? 0;
      return {
        ...member,
        attendance30: a30,
        attendance90: a90,
        technical90: t90,
        daysWithoutAttendance,
        nationalCoursePoints: nac,
        internationalCoursePoints: intl,
        manualBonus: bonus,
        blackBeltPoints: black,
        shakujoPoints: shakujo,
        score: a30 * 3 + a90 - daysWithoutAttendance + nac + intl + bonus + black + shakujo
      };
    })
    .sort((a, b) => b.score - a.score || b.attendance30 - a.attendance30 || a.display_name.localeCompare(b.display_name));
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

function latestAttendanceByMember(rows: Attendance[]) {
  const latest = new Map<string, string>();
  rows.forEach((row) => {
    const current = latest.get(row.member_id);
    if (!current || row.attended_on > current) latest.set(row.member_id, row.attended_on);
  });
  return latest;
}

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.floor((end - start) / 86400000)) : 0;
}

function daysAgo(days: number) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
