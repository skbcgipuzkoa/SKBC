import {
  findDeferredExamCall,
  type DeferredExamInvitationRow,
} from "@/lib/exam-call-deferral";
import {
  loadExamCycleAttributions,
  withExamCycleAttribution,
} from "@/lib/exam-cycle-attribution";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllPages } from "@/lib/load-all-pages";
import { examCallMonthEnd } from "@/lib/exam-call";
import {
  evaluateExamOutlook,
  madridToday,
  type ExamOutlook,
  type OutlookMember,
  type OutlookHistory,
  type OutlookTechnique,
  type OutlookRequirement,
  type OutlookClosure,
} from "@/lib/exam-outlook";

type Course = { member_id: string; kind: string; course_date: string };
/** Read-only: one stable paginated scan per source, never a member-by-member query loop. */
export async function loadExamOutlooks(
  options: {
    memberIds?: string[];
    now?: Date;
    horizonDays?: number;
    examDateOverride?: string;
  } = {},
): Promise<Map<string, ExamOutlook>> {
  const db = createAdminClient(),
    today = madridToday(options.now);
  if (options.memberIds?.length === 0) return new Map();
  const members = await loadAllPages<OutlookMember>((from, to) => {
    let q = db
      .from("members")
      .select(
        "id,display_name,legacy_id,class,status,grade,joined_on,last_exam_on",
      )
      .eq("status", "active");
    if (options.memberIds) q = q.in("id", options.memberIds);
    return q.order("id").range(from, to).returns<OutlookMember[]>();
  });
  if (!members.length) return new Map();
  const cycleAttributions = await loadExamCycleAttributions(
    members.map((member) => member.id),
  );
  // All bounded sources exclude future records. These scans are intentionally independent of roster size.
  const memberIds = members.map((m) => m.id);
  async function loadScoped<T>(
    page: (
      ids: string[],
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ) {
    const rows: T[] = [];
    for (let i = 0; i < memberIds.length; i += 100) {
      const ids = memberIds.slice(i, i + 100);
      rows.push(...(await loadAllPages<T>((f, t) => page(ids, f, t))));
    }
    return rows;
  }
  const [
    attendance,
    history,
    curriculum,
    requirements,
    calls,
    closures,
    courses,
    deferrals,
  ] = await Promise.all([
    loadScoped<{ member_id: string; attended_on: string }>((ids, f, t) =>
      db
        .from("attendance_logs")
        .select("id,member_id,attended_on")
        .in("member_id", ids)
        .lte("attended_on", today)
        .order("id")
        .range(f, t)
        .returns<Array<{ member_id: string; attended_on: string }>>(),
    ),
    loadScoped<OutlookHistory>((ids, f, t) =>
      db
        .from("member_technical_history")
        .select(
          "id,member_id,class_date,class_id,technique_id,technique_name,technique_grade,completed,counts_as_progression",
        )
        .in("member_id", ids)
        .eq("completed", true)
        .lte("class_date", today)
        .order("id")
        .range(f, t)
        .returns<OutlookHistory[]>(),
    ),
    loadAllPages<OutlookTechnique>((f, t) =>
      db
        .from("techniques")
        .select("id,name,category,content_type,grade")
        .order("id")
        .range(f, t)
        .returns<OutlookTechnique[]>(),
    ),
    loadAllPages<OutlookRequirement>((f, t) =>
      db
        .from("skbc_exam_requirements")
        .select(
          "id,member_class,grade_pattern,min_months,attendance_ratio,adult_required_repetitions,technical_blocks_exam",
        )
        .eq("active", true)
        .order("id")
        .range(f, t)
        .returns<OutlookRequirement[]>(),
    ),
    loadAllPages<{ call_date: string }>((f, t) =>
      db
        .from("skbc_exam_calls")
        .select("id,call_date")
        .eq("active", true)
        .gte("call_date", today.slice(0, 7) + "-01")
        .order("id")
        .range(f, t)
        .returns<Array<{ call_date: string }>>(),
    ),
    loadAllPages<OutlookClosure>((f, t) =>
      db
        .from("skbc_calendar_closures")
        .select("id,starts_on,ends_on,applies_to")
        .eq("active", true)
        .order("id")
        .range(f, t)
        .returns<OutlookClosure[]>(),
    ),
    loadScoped<Course>((ids, f, t) =>
      db
        .from("courses")
        .select("id,member_id,kind,course_date")
        .in("member_id", ids)
        .lte("course_date", today)
        .order("id")
        .range(f, t)
        .returns<Course[]>(),
    ),
    loadScoped<DeferredExamInvitationRow>((ids, f, t) =>
      db
        .from("exam_invitations")
        .select(
          "id,member_id,call_key,response,revoked_at,responded_at,snapshot",
        )
        .in("member_id", ids)
        .eq("response", "deferred")
        .is("revoked_at", null)
        .order("id")
        .range(f, t)
        .returns<DeferredExamInvitationRow[]>(),
    ),
  ]);
  const horizonEnd = new Date(
    new Date(today + "T00:00:00Z").getTime() +
      (options.horizonDays ?? 365) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const scheduleEnd = [
    horizonEnd,
    options.examDateOverride ?? "",
    ...calls.map((c) => examCallMonthEnd(c.call_date) ?? c.call_date),
  ]
    .sort()
    .at(-1)!;
  type ScheduledClass = {
    class_date: string;
    class_group: "kids" | "adults";
    closed: boolean;
    status: string;
  };
  const scheduledClasses = await loadAllPages<ScheduledClass>((from, to) =>
    db
      .from("classes")
      .select("id,class_date,class_group,closed,status")
      .gte("class_date", today)
      .lte("class_date", scheduleEnd)
      .order("id")
      .range(from, to)
      .returns<ScheduledClass[]>(),
  );
  const byMember = <T extends { member_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const bucket = map.get(r.member_id) ?? [];
      bucket.push(r);
      map.set(r.member_id, bucket);
    }
    return map;
  };
  const attendanceByMember = byMember(attendance),
    historyByMember = byMember(history),
    coursesByMember = byMember(courses);
  return new Map(
    members.map((member) => {
      const groupClasses = scheduledClasses.filter(
        (c) => c.class_group === member.class,
      );
      const cancelledTrainingDates = [
        ...new Set(groupClasses.map((c) => c.class_date)),
      ].filter((d) =>
        groupClasses
          .filter((c) => c.class_date === d)
          .every((c) => c.status === "cancelled"),
      );
      const activeToday = groupClasses.filter(
        (c) => c.class_date === today && c.status !== "cancelled",
      );
      const advanceMonths =
        member.class === "adults" &&
        member.last_exam_on &&
        /KYU$/i.test(member.grade ?? "")
          ? Math.min(
              3,
              (coursesByMember.get(member.id) ?? []).filter(
                (c) =>
                  c.kind === "international" &&
                  c.course_date > member.last_exam_on!,
              ).length * 2,
            )
          : 0;
      const evaluation = {
        member: withExamCycleAttribution(member, cycleAttributions),
        today,
        horizonDays: options.horizonDays,
        attendance: (attendanceByMember.get(member.id) ?? []).map(
          (r) => r.attended_on,
        ),
        history: historyByMember.get(member.id) ?? [],
        curriculum,
        requirements,
        calls: options.examDateOverride
          ? [options.examDateOverride]
          : calls.map((c) => examCallMonthEnd(c.call_date) ?? c.call_date),
        closures,
        advanceMonths,
        scheduledTrainingDates: groupClasses
          .filter((c) => c.status !== "cancelled")
          .map((c) => c.class_date),
        cancelledTrainingDates,
        todayClassClosed: activeToday.length
          ? activeToday.every((c) => c.closed)
          : undefined,
      };
      let outlook = evaluateExamOutlook(evaluation);
      const deferredFromCall = findDeferredExamCall(
        member,
        outlook.targetGrade,
        deferrals,
      );
      if (deferredFromCall) {
        const laterCalls = evaluation.calls.filter(
          (date) => date.slice(0, 7) > deferredFromCall.slice(0, 7),
        );
        outlook = evaluateExamOutlook({ ...evaluation, calls: laterCalls });
        // Only an explicit deferral can extend planning to its selected configured follow-up.
        // Eligibility chooses the call first; unrelated later calls never widen this bound.
        if (outlook.callDate) {
          const daysToFollowUp = Math.ceil(
            (Date.parse(outlook.callDate + "T00:00:00Z") -
              Date.parse(today + "T00:00:00Z")) /
              86400000,
          );
          if (daysToFollowUp > (options.horizonDays ?? 365)) {
            outlook = evaluateExamOutlook({
              ...evaluation,
              calls: laterCalls,
              horizonDays: daysToFollowUp,
            });
          }
        }
        outlook.deferredFromCall = deferredFromCall;
        outlook.planningReasons.push(
          `Aplazado desde ${deferredFromCall.slice(0, 7)}`,
        );
        if (!outlook.callDate)
          outlook.uncertainty.push(
            "Sin convocatoria configurada posterior al aplazamiento",
          );
        if (outlook.callDate && outlook.feasibility === "possible") {
          outlook.preparationCandidate = true;
          outlook.candidate = true;
        }
      }
      // Keep the stable configured call key for filters; end-of-month is only a forecast boundary.
      if (!options.examDateOverride && outlook.callDate) {
        outlook.callDate =
          calls.find((c) => examCallMonthEnd(c.call_date) === outlook.callDate)
            ?.call_date ?? outlook.callDate;
      }
      return [member.id, outlook];
    }),
  );
}
