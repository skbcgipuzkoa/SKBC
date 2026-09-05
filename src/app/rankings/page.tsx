import { Award, LogOut, Medal } from "lucide-react";
import { SidebarNav } from "@/app/components/SidebarNav";
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
  joined_on: string | null;
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
  kind: "national" | "international" | "taikai";
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
  attendance180: number;
  possible30: number;
  possible90: number;
  possible180: number;
  constancy30: number;
  constancy90: number;
  constancy180: number;
  constancyScore: number;
  attendanceVolume: number;
  bonusScore: number;
  inactivityPenalty: number;
  technical90: number;
  daysWithoutAttendance: number;
  nationalCoursePoints: number;
  internationalCoursePoints: number;
  taikaiCoursePoints: number;
  manualBonus: number;
  blackBeltPoints: number;
  shakujoPoints: number;
  score: number;
};

type CalendarClosure = {
  starts_on: string;
  ends_on: string;
  applies_to: "all" | "kids" | "adults";
};

const today = new Date();
const date30 = daysAgo(30);
const date60 = daysAgo(60);
const date90 = daysAgo(90);
const date180 = daysAgo(180);

export default async function RankingsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; error?: string; view?: string; compareA?: string; compareB?: string }>;
}) {
  if (!(await hasInternalAccess())) {
    redirect("/skbc-interno");
  }

  const params = await searchParams;
  const supabase = createAdminClient();
  const [{ data: members, error: membersError }, { data: attendance, error: attendanceError }, { data: technical, error: technicalError }, { data: courses, error: coursesError }, { data: childRankings, error: childError }, blackBeltResult, shakujoResult, closuresResult] =
    await Promise.all([
      supabase
        .from("members")
        .select("id,legacy_id,ika_id,display_name,class,grade,status,joined_on")
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
        .gte("course_date", date60)
        .returns<Course[]>(),
      supabase
        .from("child_rankings")
        .select("member_id,attendance_30d,attendance_90d,last_attendance_on,days_without_attendance,score,position,level,members(legacy_id,ika_id,display_name,grade,status)")
        .order("position", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false })
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
      ,
      supabase
        .from("skbc_calendar_closures")
        .select("starts_on,ends_on,applies_to")
        .eq("active", true)
        .lte("starts_on", new Date().toISOString().slice(0, 10))
        .gte("ends_on", "2000-01-01")
        .in("applies_to", ["all", "adults"])
        .returns<CalendarClosure[]>()
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
  const closures = closuresResult.error ? [] : closuresResult.data ?? [];
  const allAdults = buildAdultRanking(members ?? [], attendance ?? [], technical ?? [], courses ?? [], bonuses ?? [], blackBeltRows, shakujoRows, closures);
  const adults = allAdults.slice(0, 10);
  const adultMembers = (members ?? []).filter((member) => member.class === "adults" && member.legacy_id !== "13");
  const allKids = (childRankings ?? []).filter((row) => row.members?.status === "active");
  const kids = allKids.slice(0, 10);
  const selectedView = params.view === "kids" ? "kids" : "adults";
  const compareA = params.compareA ?? "";
  const compareB = params.compareB ?? "";
  const selectedAdultA = selectedView === "adults" ? allAdults.find((row) => row.id === compareA) : null;
  const selectedAdultB = selectedView === "adults" ? allAdults.find((row) => row.id === compareB) : null;
  const selectedKidA = selectedView === "kids" ? allKids.find((row) => row.member_id === compareA) : null;
  const selectedKidB = selectedView === "kids" ? allKids.find((row) => row.member_id === compareB) : null;
  const adultPosition = new Map(allAdults.map((row, index) => [row.id, index + 1]));
  const kidPosition = new Map(allKids.map((row, index) => [row.member_id, row.position ?? index + 1]));

  return (
    <div className="shell">
      <SidebarNav current="/rankings" />
      <main className="main">
        <div className="topbar">
          <div>
            <p className="eyebrow">Top 10 por categoria</p>
            <h1>Rankings SKBC</h1>
          </div>
          <form action={logoutAction}>
            <button className="icon-button" type="submit" title="Salir" aria-label="Salir">
              <LogOut aria-hidden="true" size={18} />
            </button>
          </form>
        </div>

        <section className="ranking-switch" aria-label="Seleccionar ranking">
          <a className={selectedView === "adults" ? "selected" : ""} href="/rankings?view=adults">
            <Medal aria-hidden="true" size={17} />
            Adultos
          </a>
          <a className={selectedView === "kids" ? "selected" : ""} href="/rankings?view=kids">
            <Award aria-hidden="true" size={17} />
            Ninos
          </a>
        </section>

        <section className="ranking-compare-card">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Comparar kenshis</h2>
              <p className="muted">Elige dos kenshis de la categoria activa para ver por que uno queda por encima del otro.</p>
            </div>
            <span className="tag">{selectedView === "adults" ? "Adultos" : "Ninos"}</span>
          </div>
          <form action="/rankings" className="ranking-compare-form">
            <input type="hidden" name="view" value={selectedView} />
            <label>
              Kenshi A
              <select name="compareA" defaultValue={compareA} required>
                <option value="">Seleccionar</option>
                {selectedView === "adults" ? allAdults.map((row, index) => (
                  <option value={row.id} key={row.id}>#{index + 1} {row.display_name}</option>
                )) : allKids.map((row, index) => (
                  <option value={row.member_id} key={row.member_id}>#{row.position ?? index + 1} {row.members?.display_name ?? "-"}</option>
                ))}
              </select>
            </label>
            <label>
              Kenshi B
              <select name="compareB" defaultValue={compareB} required>
                <option value="">Seleccionar</option>
                {selectedView === "adults" ? allAdults.map((row, index) => (
                  <option value={row.id} key={row.id}>#{index + 1} {row.display_name}</option>
                )) : allKids.map((row, index) => (
                  <option value={row.member_id} key={row.member_id}>#{row.position ?? index + 1} {row.members?.display_name ?? "-"}</option>
                ))}
              </select>
            </label>
            <button type="submit">Comparar</button>
            <a className="mini-action" href={`/rankings?view=${selectedView}`}>Limpiar</a>
          </form>
          {selectedView === "adults" && selectedAdultA && selectedAdultB ? (
            <AdultComparison left={selectedAdultA} right={selectedAdultB} leftPosition={adultPosition.get(selectedAdultA.id) ?? 0} rightPosition={adultPosition.get(selectedAdultB.id) ?? 0} />
          ) : null}
          {selectedView === "kids" && selectedKidA && selectedKidB ? (
            <KidComparison left={selectedKidA} right={selectedKidB} leftPosition={kidPosition.get(selectedKidA.member_id) ?? 0} rightPosition={kidPosition.get(selectedKidB.member_id) ?? 0} />
          ) : null}
        </section>

        <section className="ranking-board">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">{selectedView === "adults" ? "Top 10 adultos" : "Top 10 ninos"}</h2>
              <p className="muted">
                {selectedView === "adults"
                  ? "Pulsa un kenshi para ver su detalle. Se premian constancia, asistencia reciente, cursos, Busen, Shakujo y bonus manual."
                  : "Pulsa un kenshi para ver su ficha y detalle infantil."}
              </p>
            </div>
            <span className="tag">{selectedView === "adults" ? `${adults.length}/10` : `${kids.length}/10`}</span>
          </div>

          <div className="ranking-focus-list">
            {selectedView === "adults" ? (
              adults.length ? adults.map((row, index) => (
                <details className={`ranking-card ranking-audit-card top-${index + 1}`} key={row.id}>
                  <summary>
                    <span className="ranking-position">{index + 1}</span>
                    <span className="ranking-main">
                      <span className="ranking-name">
                        <strong>{row.display_name}</strong>
                        <span className="ranking-score">{row.score} pts</span>
                      </span>
                      <span className="ranking-id">ID {row.legacy_id ?? "-"} - IKA {row.ika_id ?? "pendiente"} - {row.grade ?? "-"}</span>
                      <span className="ranking-chip-grid">
                        <span className="ranking-chip">30/90: {row.attendance30}/{row.attendance90}</span>
                        <span className="ranking-chip">Const. 90: {row.constancy90}%</span>
                        <span className="ranking-chip">{formatDaysWithout(row.daysWithoutAttendance)}</span>
                        <span className="ranking-chip">Cursos {row.nationalCoursePoints + row.internationalCoursePoints + row.taikaiCoursePoints}</span>
                        <span className="ranking-chip">Busen {row.blackBeltPoints}</span>
                        <span className="ranking-chip">Shakujo {row.shakujoPoints}</span>
                        {row.manualBonus ? <span className="ranking-chip">Bonus {row.manualBonus}</span> : null}
                      </span>
                    </span>
                  </summary>
                  <div className="ranking-audit-grid">
                    <AuditMetric label="Constancia 30 dias" value={`${row.attendance30}/${row.possible30}`} detail={`${row.constancy30}%`} />
                    <AuditMetric label="Constancia 90 dias" value={`${row.attendance90}/${row.possible90}`} detail={`${row.constancy90}%`} />
                    <AuditMetric label="Historico 180 dias" value={`${row.attendance180}/${row.possible180}`} detail={`${row.constancy180}%`} />
                    <AuditMetric label="Base constancia" value={`+${row.constancyScore}`} detail="30/90/180 ponderado" />
                    <AuditMetric label="Volumen asistencia" value={`+${row.attendanceVolume}`} detail="maximo 12" />
                    <AuditMetric label="Cursos 60 dias" value={`+${row.nationalCoursePoints + row.internationalCoursePoints + row.taikaiCoursePoints}`} detail={`N ${row.nationalCoursePoints} · I ${row.internationalCoursePoints} · T ${row.taikaiCoursePoints}`} />
                    <AuditMetric label="Bonus manual" value={`+${row.bonusScore}`} detail={`${row.manualBonus} x 8`} />
                    <AuditMetric label="Busen / Shakujo" value={`${signed(row.blackBeltPoints)} / ${signed(row.shakujoPoints)}`} detail="ultimos 180 dias" />
                    <AuditMetric label="Inactividad" value={`-${row.inactivityPenalty}`} detail={formatDaysWithout(row.daysWithoutAttendance)} />
                    <AuditMetric label="Tecnicas" value={`${row.technical90}`} detail="solo informativo" />
                  </div>
                  {row.legacy_id ? <a className="mini-action" href={`/kenshis/${row.legacy_id}`}>Abrir kenshi</a> : null}
                </details>
              )) : <p className="ranking-empty">Sin datos suficientes para ranking adulto.</p>
            ) : (
              kids.length ? kids.map((row, index) => (
                <details className={`ranking-card ranking-audit-card top-${index + 1}`} key={row.member_id}>
                  <summary>
                    <span className="ranking-position">{row.position ?? index + 1}</span>
                    <span className="ranking-main">
                      <span className="ranking-name">
                        <strong>{row.members?.display_name ?? "-"}</strong>
                        <span className="ranking-score">{row.score} pts</span>
                      </span>
                      <span className="ranking-id">ID {row.members?.legacy_id ?? "-"} - IKA {row.members?.ika_id ?? "pendiente"} - {row.members?.grade ?? "-"}</span>
                      <span className="ranking-chip-grid">
                        <span className="ranking-chip">30/90: {row.attendance_30d}/{row.attendance_90d}</span>
                        <span className="ranking-chip">Ultima {row.last_attendance_on ?? "-"}</span>
                        <span className="ranking-chip">{formatDaysWithout(row.days_without_attendance)}</span>
                        <span className="ranking-chip">Nivel {row.level ?? "-"}</span>
                      </span>
                    </span>
                  </summary>
                  <div className="ranking-audit-grid">
                    <AuditMetric label="Asistencias 30 dias" value={`${row.attendance_30d}`} detail={`${row.attendance_30d} x 3 puntos`} />
                    <AuditMetric label="Asistencias 90 dias" value={`${row.attendance_90d}`} detail={`${row.attendance_90d} x 1 punto`} />
                    <AuditMetric label="Score infantil" value={`${row.score}`} detail={`${row.attendance_30d * 3} + ${row.attendance_90d}`} />
                    <AuditMetric label="Ultima asistencia" value={row.last_attendance_on ?? "-"} detail={formatDaysWithout(row.days_without_attendance)} />
                  </div>
                  {row.members?.legacy_id ? <a className="mini-action" href={`/kenshis/${row.members.legacy_id}`}>Abrir kenshi</a> : null}
                </details>
              )) : <p className="ranking-empty">Sin ranking infantil calculado.</p>
            )}
          </div>
        </section>

        {params.saved === "bonus" ? <p className="save-ok">Bonus manual guardado.</p> : null}
        {params.error === "bonus" ? <p className="form-error">No se pudo guardar el bonus manual.</p> : null}
        {!bonusTableReady ? <p className="form-error">Bonus manual pendiente de activar: falta aplicar la migracion de Supabase.</p> : null}

        {selectedView === "adults" && bonusTableReady ? <section className="split-section">
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
              <span className="tag">Constancia real 30/90/180 + cursos + bonus - inactividad</span>
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
                      <td data-label="Asist. 30/90">{row.attendance30}/{row.attendance90} ({row.constancy90}%)</td>
                      <td data-label="Dias sin venir">{row.daysWithoutAttendance}</td>
                      <td data-label="Cursos">{row.nationalCoursePoints + row.internationalCoursePoints + row.taikaiCoursePoints}</td>
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

function buildAdultRanking(members: Member[], attendance: Attendance[], technical: TechnicalHistory[], courses: Course[], bonuses: AdultBonus[], blackBeltRows: any[], shakujoRows: any[], closures: CalendarClosure[]): AdultRankingRow[] {
  const adults = members.filter((member) => member.class === "adults" && member.legacy_id !== "13");
  const attendance30 = countByMember(attendance.filter((row) => row.attended_on >= date30));
  const attendance90 = countByMember(attendance.filter((row) => row.attended_on >= date90));
  const attendance180 = countByMember(attendance.filter((row) => row.attended_on >= date180));
  const clubTrainingDates = uniqueSorted(attendance.map((row) => row.attended_on));
  const technical90 = countByMember(technical);
  const nationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "national").map((row) => ({ member_id: row.member_id, points: 1 })));
  const internationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "international").map((row) => ({ member_id: row.member_id, points: 3 })));
  const taikaiCoursePoints = sumByMember(courses.filter((row) => row.kind === "taikai").map((row) => ({ member_id: row.member_id, points: 2 })));
  const manualBonus = sumByMember(
    bonuses
      .filter((row) => row.active && (row.permanent || row.bonus_date >= date180))
      .map((row) => ({ member_id: row.member_id, points: row.points }))
  );
  const blackBeltPoints = sumByMember(
    blackBeltRows
      .filter((row) => row.black_belt_special_classes?.class_date >= date180)
      .map((row) => ({ member_id: row.member_id, points: row.status === "present" ? 2 : row.status === "absent" ? -4 : 0 }))
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
      const a180 = attendance180.get(member.id) ?? 0;
      const t90 = technical90.get(member.id) ?? 0;
      const last = lastAttendance.get(member.id);
      const daysWithoutAttendance = last ? trainingDaysBetween(last, new Date().toISOString().slice(0, 10), closures) : 999;
      const possible30 = possibleClubDays(clubTrainingDates, date30, member.joined_on);
      const possible90 = possibleClubDays(clubTrainingDates, date90, member.joined_on);
      const possible180 = possibleClubDays(clubTrainingDates, date180, member.joined_on);
      const c30 = attendanceRate(a30, possible30);
      const c90 = attendanceRate(a90, possible90);
      const c180 = attendanceRate(a180, possible180);
      const nac = nationalCoursePoints.get(member.id) ?? 0;
      const intl = internationalCoursePoints.get(member.id) ?? 0;
      const taikai = taikaiCoursePoints.get(member.id) ?? 0;
      const bonus = manualBonus.get(member.id) ?? 0;
      const bonusScore = bonus * 8;
      const black = blackBeltPoints.get(member.id) ?? 0;
      const shakujo = shakujoPoints.get(member.id) ?? 0;
      const constancyScore = Math.round(c30 * 45 + c90 * 35 + c180 * 25);
      const attendanceVolume = Math.min(a90, 12);
      const activityScore = constancyScore + attendanceVolume + nac + intl + taikai + bonusScore + black + shakujo;
      const inactivityPenalty = adultInactivityPenalty(daysWithoutAttendance);
      return {
        ...member,
        attendance30: a30,
        attendance90: a90,
        attendance180: a180,
        possible30,
        possible90,
        possible180,
        constancy30: Math.round(c30 * 100),
        constancy90: Math.round(c90 * 100),
        constancy180: Math.round(c180 * 100),
        constancyScore,
        attendanceVolume,
        bonusScore,
        inactivityPenalty,
        technical90: t90,
        daysWithoutAttendance,
        nationalCoursePoints: nac,
        internationalCoursePoints: intl,
        taikaiCoursePoints: taikai,
        manualBonus: bonus,
        blackBeltPoints: black,
        shakujoPoints: shakujo,
        score: Math.max(0, activityScore - inactivityPenalty)
      };
    })
    .sort((a, b) => b.score - a.score || b.constancy90 - a.constancy90 || b.attendance30 - a.attendance30 || a.display_name.localeCompare(b.display_name));
}

function AuditMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <span className="ranking-audit-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{detail}</em>
    </span>
  );
}

function AdultComparison({ left, right, leftPosition, rightPosition }: { left: AdultRankingRow; right: AdultRankingRow; leftPosition: number; rightPosition: number }) {
  const insights = adultCompareInsights(left, right);
  return (
    <div className="ranking-compare-panel">
      <div className="compare-columns">
        <ComparePerson name={left.display_name} position={leftPosition} score={left.score} detail={`${left.grade ?? "-"} · ID ${left.legacy_id ?? "-"}`} />
        <ComparePerson name={right.display_name} position={rightPosition} score={right.score} detail={`${right.grade ?? "-"} · ID ${right.legacy_id ?? "-"}`} />
      </div>
      <div className="compare-metric-table">
        <CompareMetric label="Score total" left={left.score} right={right.score} higherIsBetter />
        <CompareMetric label="Constancia 30 dias" left={left.constancy30} right={right.constancy30} suffix="%" higherIsBetter />
        <CompareMetric label="Constancia 90 dias" left={left.constancy90} right={right.constancy90} suffix="%" higherIsBetter />
        <CompareMetric label="Historico 180 dias" left={left.constancy180} right={right.constancy180} suffix="%" higherIsBetter />
        <CompareMetric label="Asistencias 30 dias" left={left.attendance30} right={right.attendance30} higherIsBetter />
        <CompareMetric label="Asistencias 90 dias" left={left.attendance90} right={right.attendance90} higherIsBetter />
        <CompareMetric label="Dias sin entrenar" left={left.daysWithoutAttendance} right={right.daysWithoutAttendance} lowerIsBetter />
        <CompareMetric label="Cursos 60 dias" left={left.nationalCoursePoints + left.internationalCoursePoints + left.taikaiCoursePoints} right={right.nationalCoursePoints + right.internationalCoursePoints + right.taikaiCoursePoints} higherIsBetter />
        <CompareMetric label="Bonus manual" left={left.manualBonus} right={right.manualBonus} higherIsBetter />
        <CompareMetric label="Busen" left={left.blackBeltPoints} right={right.blackBeltPoints} higherIsBetter />
        <CompareMetric label="Shakujo" left={left.shakujoPoints} right={right.shakujoPoints} higherIsBetter />
        <CompareMetric label="Tecnicas 90 dias" left={left.technical90} right={right.technical90} higherIsBetter note="informativo" />
      </div>
      <CompareInsights items={insights} />
    </div>
  );
}

function KidComparison({ left, right, leftPosition, rightPosition }: { left: ChildRanking; right: ChildRanking; leftPosition: number; rightPosition: number }) {
  const leftName = left.members?.display_name ?? "-";
  const rightName = right.members?.display_name ?? "-";
  const insights = kidCompareInsights(left, right);
  return (
    <div className="ranking-compare-panel">
      <div className="compare-columns">
        <ComparePerson name={leftName} position={leftPosition} score={left.score} detail={`${left.members?.grade ?? "-"} · ID ${left.members?.legacy_id ?? "-"}`} />
        <ComparePerson name={rightName} position={rightPosition} score={right.score} detail={`${right.members?.grade ?? "-"} · ID ${right.members?.legacy_id ?? "-"}`} />
      </div>
      <div className="compare-metric-table">
        <CompareMetric label="Score total" left={left.score} right={right.score} higherIsBetter />
        <CompareMetric label="Asistencias 30 dias" left={left.attendance_30d} right={right.attendance_30d} higherIsBetter />
        <CompareMetric label="Asistencias 90 dias" left={left.attendance_90d} right={right.attendance_90d} higherIsBetter />
        <CompareMetric label="Dias sin entrenar" left={left.days_without_attendance ?? 999} right={right.days_without_attendance ?? 999} lowerIsBetter />
        <CompareMetric label="Ultima asistencia" left={left.last_attendance_on ?? "-"} right={right.last_attendance_on ?? "-"} />
        <CompareMetric label="Nivel" left={left.level ?? "-"} right={right.level ?? "-"} />
      </div>
      <CompareInsights items={insights} />
    </div>
  );
}

function ComparePerson({ name, position, score, detail }: { name: string; position: number; score: number; detail: string }) {
  return (
    <article className="compare-person-card">
      <span className="ranking-position">{position || "-"}</span>
      <div>
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
      <b>{score} pts</b>
    </article>
  );
}

function CompareMetric({
  label,
  left,
  right,
  suffix = "",
  higherIsBetter = false,
  lowerIsBetter = false,
  note
}: {
  label: string;
  left: string | number;
  right: string | number;
  suffix?: string;
  higherIsBetter?: boolean;
  lowerIsBetter?: boolean;
  note?: string;
}) {
  const numeric = typeof left === "number" && typeof right === "number";
  const leftWins = numeric && left !== right && ((higherIsBetter && left > right) || (lowerIsBetter && left < right));
  const rightWins = numeric && left !== right && ((higherIsBetter && right > left) || (lowerIsBetter && right < left));
  const diff = numeric ? left - right : null;
  return (
    <div className="compare-metric-row">
      <span>{label}{note ? <em>{note}</em> : null}</span>
      <strong className={leftWins ? "compare-winner" : ""}>{formatCompareValue(left, suffix)}</strong>
      <strong className={rightWins ? "compare-winner" : ""}>{formatCompareValue(right, suffix)}</strong>
      <small>{diff === null || diff === 0 ? "=" : `${diff > 0 ? "+" : ""}${diff}${suffix}`}</small>
    </div>
  );
}

function CompareInsights({ items }: { items: string[] }) {
  if (!items.length) return <p className="compare-insights">Los dos kenshis estan practicamente empatados en los factores principales.</p>;
  return (
    <div className="compare-insights">
      <strong>Lectura rapida</strong>
      {items.map((item) => <p key={item}>{item}</p>)}
    </div>
  );
}

function adultCompareInsights(left: AdultRankingRow, right: AdultRankingRow) {
  const leftName = firstName(left.display_name);
  const rightName = firstName(right.display_name);
  const items = [
    insight(leftName, rightName, "constancia 90 dias", left.constancy90 - right.constancy90, "%"),
    insight(leftName, rightName, "asistencias recientes", left.attendance30 - right.attendance30),
    insight(leftName, rightName, "historico de 180 dias", left.constancy180 - right.constancy180, "%"),
    insight(leftName, rightName, "bonus manual", left.bonusScore - right.bonusScore),
    insight(leftName, rightName, "cursos recientes", left.nationalCoursePoints + left.internationalCoursePoints + left.taikaiCoursePoints - right.nationalCoursePoints - right.internationalCoursePoints - right.taikaiCoursePoints),
    insight(leftName, rightName, "Busen y Shakujo", left.blackBeltPoints + left.shakujoPoints - right.blackBeltPoints - right.shakujoPoints),
    insight(leftName, rightName, "menos penalizacion por inactividad", right.inactivityPenalty - left.inactivityPenalty)
  ].filter(Boolean) as string[];
  return items.slice(0, 4);
}

function kidCompareInsights(left: ChildRanking, right: ChildRanking) {
  const leftName = firstName(left.members?.display_name ?? "Kenshi A");
  const rightName = firstName(right.members?.display_name ?? "Kenshi B");
  const items = [
    insight(leftName, rightName, "asistencias de 30 dias", left.attendance_30d - right.attendance_30d),
    insight(leftName, rightName, "asistencias de 90 dias", left.attendance_90d - right.attendance_90d),
    insight(leftName, rightName, "menos dias sin entrenar", (right.days_without_attendance ?? 999) - (left.days_without_attendance ?? 999)),
    insight(leftName, rightName, "score total", left.score - right.score)
  ].filter(Boolean) as string[];
  return items.slice(0, 4);
}

function insight(leftName: string, rightName: string, label: string, diff: number, suffix = "") {
  if (Math.abs(diff) < 1) return "";
  const winner = diff > 0 ? leftName : rightName;
  const loser = diff > 0 ? rightName : leftName;
  return `${winner} supera a ${loser} en ${label} por ${Math.abs(diff)}${suffix}.`;
}

function firstName(name: string) {
  return name.split(" ")[0] || name;
}

function formatCompareValue(value: string | number, suffix: string) {
  return typeof value === "number" ? `${value}${suffix}` : value;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function possibleClubDays(clubDates: string[], since: string, _joinedOn: string | null | undefined) {
  return clubDates.filter((date) => date >= since).length;
}

function attendanceRate(attendanceCount: number, possibleDays: number) {
  if (possibleDays <= 0) return 0;
  return Math.min(1, attendanceCount / possibleDays);
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

function trainingDaysBetween(from: string, to: string, closures: CalendarClosure[]) {
  const totalDays = daysBetween(from, to);
  if (totalDays <= 0) return 0;
  let count = 0;
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    if (!isSummerBreak(cursor) && !isExplicitlyClosed(cursor, closures)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function isExplicitlyClosed(date: Date, closures: CalendarClosure[]) {
  return closures.some((closure) => {
    const starts = new Date(`${closure.starts_on}T00:00:00`);
    const ends = new Date(`${closure.ends_on}T00:00:00`);
    return starts <= date && date <= ends;
  });
}

function isSummerBreak(date: Date) {
  const month = date.getMonth() + 1;
  return month === 7 || month === 8;
}

function formatDaysWithout(days: number | null | undefined) {
  if (days === null || days === undefined || days >= 999) return "Sin asistencia";
  return days === 1 ? "1 dia sin venir" : `${days} dias sin venir`;
}

function adultInactivityPenalty(daysWithoutAttendance: number) {
  if (daysWithoutAttendance >= 999) return 40;
  if (daysWithoutAttendance <= 7) return 0;
  if (daysWithoutAttendance <= 14) return 3;
  if (daysWithoutAttendance <= 30) return 8;
  if (daysWithoutAttendance <= 60) return 15;
  if (daysWithoutAttendance <= 90) return 25;
  return 35;
}

function daysAgo(days: number) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}
