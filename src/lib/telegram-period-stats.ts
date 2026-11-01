type Group = "adults" | "kids";
type Person = {
  id?: string;
  display_name: string;
  class?: Group;
  legacy_id?: string | null;
};
type Session = {
  id: string;
  class_date: string;
  class_group: Group;
  name?: string;
};
type Visit = {
  member_id: string;
  class_id?: string | null;
  attended_on: string;
  members: Person | null;
};
type Technique = {
  member_id: string;
  class_id?: string | null;
  class_date: string;
  technique_id?: string | null;
  technique_name: string;
  counts_for_stats?: boolean | null;
  members: Person | null;
  classes?: { class_group: Group } | null;
};
const key = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
const sensei = (person: Person | null) => person?.legacy_id?.trim() === "13";
export function dedupeAttendance<T extends Visit>(
  rows: T[],
  classes: Session[] = [],
): T[] {
  const sessionByDate = new Map<string, string[]>();
  for (const c of classes) {
    const k = `${c.class_group}|${c.class_date}`;
    sessionByDate.set(k, [...(sessionByDate.get(k) ?? []), c.id]);
  }
  const unique = new Map<string, T>();
  // Legacy date-only rows resolve to a session only when that day's group has exactly one class.
  for (const row of rows) {
    const candidates =
      sessionByDate.get(`${row.members?.class}|${row.attended_on}`) ?? [];
    const session =
      row.class_id ||
      (candidates.length === 1
        ? candidates[0]
        : `date:${row.members?.class ?? "unknown"}:${row.attended_on}`);
    unique.set(`${row.member_id}|${session}`, row);
  }
  return [...unique.values()];
}
export function attendanceLeaders(rows: Visit[], limit = 10) {
  const people = new Map<string, { name: string; count: number }>();
  for (const r of dedupeAttendance(rows)) {
    if (sensei(r.members)) continue;
    const p = people.get(r.member_id) ?? {
      name: r.members?.display_name ?? "Kenshi sin ficha",
      count: 0,
    };
    p.count++;
    people.set(r.member_id, p);
  }
  const sorted = [...people.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
  const cutoff = sorted[Math.min(limit, sorted.length) - 1]?.count ?? 0;
  const groups = new Map<number, string[]>();
  for (const p of sorted.filter((p) => p.count >= cutoff))
    groups.set(p.count, [...(groups.get(p.count) ?? []), p.name]);
  return [...groups].map(([count, names]) => ({ count, names }));
}
export function summarizePeriod(
  classes: Session[],
  visits: Visit[],
  history: Technique[],
  activeMembers: Person[],
) {
  const registeredSessions = new Map(classes.map((c) => [c.id, c]));
  const classifiedVisits = visits.map((row) => {
    const session = row.class_id ? registeredSessions.get(row.class_id) : null;
    const group = session?.class_group ?? row.members?.class;
    const candidates = classes.filter(
      (c) => c.class_group === group && c.class_date === row.attended_on,
    );
    return {
      ...row,
      class_id:
        row.class_id || (candidates.length === 1 ? candidates[0].id : null),
      members: row.members
        ? { ...row.members, class: group }
        : group
          ? { display_name: "Kenshi sin ficha", class: group }
          : null,
    };
  });
  const attendance = dedupeAttendance(classifiedVisits, classes);
  const sessions = new Map(classes.map((c) => [c.id, c]));
  for (const row of attendance) {
    const group = row.members?.class;
    if (!group) continue;
    if (row.class_id && sessions.has(row.class_id)) continue;
    if (
      !row.class_id &&
      classes.some(
        (c) => c.class_group === group && c.class_date === row.attended_on,
      )
    )
      continue;
    const id = row.class_id || `date:${group}:${row.attended_on}`;
    sessions.set(id, {
      id,
      class_date: row.attended_on,
      class_group: group,
      name: "Clase inferida por asistencia",
    });
  }
  const allSessions = [...sessions.values()];
  const adultClasses = allSessions.filter(
    (c) => c.class_group === "adults",
  ).length;
  const kidsClasses = allSessions.filter(
    (c) => c.class_group === "kids",
  ).length;
  const dates = new Set([
    ...classes.map((c) => c.class_date),
    ...attendance.map((r) => r.attended_on),
  ]);
  const adults = attendance.filter((r) => r.members?.class === "adults");
  const kids = attendance.filter((r) => r.members?.class === "kids");
  const currentIds = new Set(activeMembers.map((m) => m.id));
  const technical = history.filter(
    (r) =>
      r.counts_for_stats !== false &&
      (r.classes?.class_group ??
        (r.class_id
          ? registeredSessions.get(r.class_id)?.class_group
          : undefined) ??
        r.members?.class) === "adults",
  );
  const techSessions = new Map<string, Technique>();
  const memberSessions = new Map<string, Technique>();
  for (const r of technical) {
    const matching = classes.filter(
      (c) => c.class_group === "adults" && c.class_date === r.class_date,
    );
    const session =
      r.class_id ||
      (matching.length === 1 ? matching[0].id : `date:adults:${r.class_date}`);
    techSessions.set(
      `${session}|${r.technique_id || key(r.technique_name)}`,
      r,
    );
    memberSessions.set(`${r.member_id}|${session}`, r);
  }
  const counts = (values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return [...m]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const sessionCounts = new Map<string, number>();
  const dateCounts = new Map<string, number>();
  for (const r of attendance) {
    const cs = allSessions.filter(
      (c) =>
        c.class_group === r.members?.class && c.class_date === r.attended_on,
    );
    const id =
      r.class_id ||
      (cs.length === 1
        ? cs[0].id
        : `date:${r.members?.class}:${r.attended_on}`);
    sessionCounts.set(id, (sessionCounts.get(id) ?? 0) + 1);
    dateCounts.set(r.attended_on, (dateCounts.get(r.attended_on) ?? 0) + 1);
  }
  const peak = (m: Map<string, number>) =>
    [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const peakSession = peak(sessionCounts);
  const peakDate = peak(dateCounts);
  const full = (rows: Visit[], group: Group) => {
    const required = allSessions
      .filter((c) => c.class_group === group)
      .map((c) => c.id);
    if (!required.length) return 0;
    const byMember = new Map<string, Set<string>>();
    for (const row of rows) {
      if (sensei(row.members)) continue;
      const attended = byMember.get(row.member_id) ?? new Set<string>();
      attended.add(row.class_id || "date:" + group + ":" + row.attended_on);
      byMember.set(row.member_id, attended);
    }
    return [...byMember.values()].filter((attended) =>
      required.every((id) => attended.has(id)),
    ).length;
  };
  const technicalMemberCounts = new Map<
    string,
    { label: string; count: number }
  >();
  for (const row of memberSessions.values()) {
    if (sensei(row.members)) continue;
    const person = technicalMemberCounts.get(row.member_id) ?? {
      label: row.members?.display_name ?? "Kenshi",
      count: 0,
    };
    person.count++;
    technicalMemberCounts.set(row.member_id, person);
  }
  const mean = (n: number, d: number) =>
    d ? Math.round((n / d) * 10) / 10 : 0;
  return {
    attendance,
    classes: dates.size,
    adultClasses,
    kidsClasses,
    inferredClasses: allSessions.length - classes.length,
    adultAttendance: adults.length,
    kidsAttendance: kids.length,
    unclassifiedAttendance: attendance.length - adults.length - kids.length,
    totalAttendance: attendance.length,
    uniqueAttendees: new Set(attendance.map((r) => r.member_id)).size,
    uniqueAdultAttendees: new Set(adults.map((r) => r.member_id)).size,
    uniqueKidsAttendees: new Set(kids.map((r) => r.member_id)).size,
    historicalNonCurrentAttendees: new Set(
      attendance
        .filter((r) => !currentIds.has(r.member_id))
        .map((r) => r.member_id),
    ).size,
    averageAttendancePerClass: mean(attendance.length, dates.size),
    averageAdultAttendancePerClass: mean(adults.length, adultClasses),
    averageKidsAttendancePerClass: mean(kids.length, kidsClasses),
    techniques: techSessions.size,
    uniqueTechniques: new Set(
      technical.map((r) => r.technique_id || key(r.technique_name)),
    ).size,
    topTechniques: counts(
      [...techSessions.values()].map((r) => r.technique_name),
    ).slice(0, 5),
    topTechnicalMembers: [...technicalMemberCounts.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 5),
    technicalLegacyRows: technical.filter((r) => !r.class_id).length,
    fullAttendanceAdults: full(adults, "adults"),
    fullAttendanceKids: full(kids, "kids"),
    busiestSession: peakSession
      ? {
          session: allSessions.find((c) => c.id === peakSession[0]),
          count: peakSession[1],
        }
      : null,
    busiestDate: peakDate ? { date: peakDate[0], count: peakDate[1] } : null,
    topAdultAttendance: attendanceLeaders(adults),
    topKidsAttendance: attendanceLeaders(kids),
  };
}
