import { isIsoDate, madridCallToday } from "./exam-call.ts";
export type DeferredExamInvitationRow = {
  member_id: string;
  call_key: string;
  response: string | null;
  revoked_at: string | null;
  responded_at: string | null;
  snapshot: {
    currentGrade?: string | null;
    targetGrade?: string;
    memberClass?: string;
    callKey?: string;
  };
};
/** A voluntary deferral moves only this unchanged grade/cycle beyond the deferred call's month. */
export function findDeferredExamCall(
  member: {
    id: string;
    grade: string | null;
    class: string;
    last_exam_on: string | null;
    joined_on: string | null;
  },
  targetGrade: string,
  rows: DeferredExamInvitationRow[],
) {
  const cycle = member.last_exam_on ?? member.joined_on;
  return (
    rows
      .filter(
        (row) =>
          row.member_id === member.id &&
          row.response === "deferred" &&
          !row.revoked_at &&
          row.snapshot.currentGrade === member.grade &&
          row.snapshot.targetGrade === targetGrade &&
          row.snapshot.memberClass === member.class &&
          isIsoDate(row.call_key) &&
          row.responded_at &&
          Number.isFinite(Date.parse(row.responded_at)) &&
          (!cycle || madridCallToday(new Date(row.responded_at)) >= cycle),
      )
      .map((row) => row.call_key)
      .sort()
      .at(-1) ?? null
  );
}
