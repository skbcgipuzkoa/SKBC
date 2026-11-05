import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import {
  madridCallToday,
  examCallMonthEnd,
  formatExamCallMonth,
} from "../src/lib/exam-call.ts";
const require = createRequire(import.meta.url);
let admin = true,
  sends = 0,
  claimed = false,
  auditFail = false,
  smtpError = null,
  updates = [],
  rows = [],
  rpcCalls = [],
  outlooks = [],
  actualOverride = null,
  eventCreates = 0,
  batchWrites = 0,
  eventDate = "2099-12-20",
  eventConfirmed = true,
  overrideCalls = [];
const candidate = {
  feasibility: "possible",
  impossibilityReasons: [],
  memberId: "member",
  name: "Synthetic Child",
  memberClass: "kids",
  currentGrade: "BLANCO",
  targetGrade: "AMARILLO",
  callDate: "2099-12-01",
  classification: "notyet",
  candidate: true,
  preparationCandidate: true,
  currentReady: false,
  deficits: ["Faltan prácticas"],
  email: "family@example.test",
};
const batch = { id: "batch", call_key: "2099-12-01", exam_date: "2099-12-20" };
function query(table) {
  let op = "read",
    patch = {},
    filters = {};
  const q = {
    select() {
      return q;
    },
    order() {
      return q;
    },
    in() {
      return q;
    },
    is() {
      return q;
    },
    delete() {
      op = "delete";
      return q;
    },
    insert(v) {
      if (table === "exam_invitation_batches") batchWrites++;
      op = "insert";
      patch = v;
      return q;
    },
    update(v) {
      op = "update";
      patch = v;
      updates.push(v);
      return q;
    },
    eq(k, v) {
      filters[k] = v;
      return q;
    },
    async single() {
      return {
        data:
          table === "exam_events"
            ? {
                id: "event",
                notes: "",
                exam_date: eventDate,
                call_month: "2099-12",
                date_confirmed: eventConfirmed,
                status: "active",
              }
            : { id: "batch" },
        error: null,
      };
    },
    async maybeSingle() {
      if (table === "members") return { data: { id: "member" }, error: null };
      if (op === "update") {
        if (claimed) return { data: null, error: null };
        claimed = true;
        return { data: { id: "invite" }, error: null };
      }
      return {
        data: table === "exam_invitation_batches" ? batch : (rows[0] ?? null),
        error: null,
      };
    },
    then(resolve, reject) {
      let result;
      if (table === "members")
        result = {
          data: [{ id: "member", family_email: candidate.email }],
          error: null,
        };
      else if (table === "exam_events" && op === "read")
        result = {
          data: [
            {
              id: "event",
              exam_date: eventDate,
              status: "active",
              date_confirmed: eventConfirmed,
              call_month: "2099-12",
            },
          ],
          error: null,
        };
      else if (op === "update" && patch.delivery_status === "sent" && auditFail)
        result = { data: null, error: new Error("audit unavailable") };
      else
        result = {
          data: table === "exam_invitations" ? rows : [],
          error: null,
        };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return q;
}
const db = {
  from: query,
  async rpc(name, args) {
    rpcCalls.push({ name, args });
    return { data: "invite", error: null };
  },
};
const deps = {
  "@/lib/exam-call": { madridCallToday, examCallMonthEnd, formatExamCallMonth },
  "@/lib/auth": { hasInternalAccess: async () => admin },
  "@/lib/supabase/admin": { createAdminClient: () => db },
  "@/lib/exam-outlook-data": {
    loadExamOutlooks: async (options = {}) => {
      if (options.examDateOverride)
        overrideCalls.push(options.examDateOverride);
      return new Map(
        outlooks.map((x) => [
          x.memberId,
          options.examDateOverride
            ? (actualOverride ?? { ...x, callDate: options.examDateOverride })
            : x,
        ]),
      );
    },
  },
  "@/lib/integrated-exams": {
    createIntegratedExamEvent: async (x) => {
      eventCreates++;
      assert.equal(x.enrollStudents, false);
      return { eventId: "event" };
    },
  },
  "@/lib/integrated-exam-assignments": {
    decodeExamAssignments: () => ({ text: "Existing human notes", scopes: {} }),
    encodeExamAssignments: (text) => text,
  },
  "@/lib/email-notifications": {
    createTransporter: () => ({
      sendMail: async (msg) => {
        sends++;
        if (smtpError) throw smtpError;
        assert.equal(msg.to.address, candidate.email);
        assert.equal(msg.to.name, candidate.name);
        assert.equal(msg.cc, undefined);
        return { accepted: [candidate.email] };
      },
    }),
  },
};
const module = { exports: {} };
const code = ts.transpileModule(
  fs.readFileSync(
    new URL("../src/lib/exam-invitations.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
vm.runInNewContext(code, {
  module,
  exports: module.exports,
  require: (n) => deps[n] ?? require(n),
  process,
  console,
  Date,
  Map,
  Set,
  Error,
});
const api = module.exports;
admin = false;
for (const name of [
  "listExamInvitationBatches",
  "getExamInvitationBatch",
  "listExamInvitationResponses",
  "loadExamInvitationCandidates",
  "createExamInvitationDraft",
  "approveExamCallFromPlanning",
  "sendExamInvitationBatch",
  "updateExamInvitationEvent",
  "approveExamInvitationBatch",
  "revokeExamInvitationApproval",
])
  await assert.rejects(() => api[name]({}), /Acceso interno/);
admin = true;
const tokens = new Set(
  Array.from({ length: 100 }, () => api.createInvitationToken()),
);
assert.equal(tokens.size, 100);
for (const token of tokens) {
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.match(api.hashInvitationToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(token, api.hashInvitationToken(token));
}
assert.equal(api.isBareInvitationEmail("a@example.com:<b@evil.test>"), false);
assert.equal(api.isBareInvitationEmail("family@example.test"), true);
assert.equal(await api.getPublicExamInvitation("invalid"), null);
assert.equal(rpcCalls.length, 0);
for (const args of [
  ["bad", "accepted", ""],
  [api.createInvitationToken(), "invalid", ""],
  [api.createInvitationToken(), "accepted", "x".repeat(2001)],
])
  await assert.rejects(() => api.respondExamInvitation(...args), /inválida/);
const input = {
  memberIds: ["member"],
  callKey: candidate.callDate,
  examDate: "2099-12-20",
  instructions: "Synthetic instructions",
};
outlooks = [candidate];
await assert.rejects(
  () => api.createExamInvitationDraft({ ...input, examDate: "2099-99-99" }),
  /fecha/,
);
await assert.rejects(
  () => api.createExamInvitationDraft({ ...input, callKey: "2099-12-02" }),
  /selección/,
);
const originalEmail = candidate.email;
candidate.email = null;
await assert.rejects(() => api.createExamInvitationDraft(input), /email/);
await api.createExamInvitationDraft(input, { fichaOnly: true });
assert.equal(rpcCalls.at(-1).args.p_rows[0].snapshot.email, "");
assert.equal(sends, 0, "Ficha authorisation must not send mail");
candidate.email = originalEmail;
await api.createExamInvitationDraft(input);
let drafted = rpcCalls.at(-1).args.p_rows[0];
assert.match(drafted.snapshot.reason, /refuerzo/);
assert.equal(drafted.exam_fee, 10);
assert.match(drafted.body, /15 EUR/);
assert.equal(drafted.token_hash, undefined);
assert.equal(sends, 0);
assert.equal(rpcCalls.at(-1).name, "replace_exam_invitation_drafts");

assert.equal(overrideCalls.at(-1), input.examDate);
outlooks = [{ ...candidate, classification: "projected" }];
actualOverride = {
  ...candidate,
  callDate: input.examDate,
  classification: "notyet",
  deficits: ["Faltan prácticas antes de la fecha real"],
};
await api.createExamInvitationDraft(input);
assert.match(rpcCalls.at(-1).args.p_rows[0].snapshot.reason, /refuerzo/);
assert.deepEqual(Array.from(rpcCalls.at(-1).args.p_rows[0].snapshot.deficits), [
  "Faltan prácticas antes de la fecha real",
]);
actualOverride = { ...candidate, callDate: null };
const callsBeforeIneligible = rpcCalls.length;
await assert.rejects(
  () => api.createExamInvitationDraft(input),
  /tiempo mínimo/,
);
assert.equal(rpcCalls.length, callsBeforeIneligible);

actualOverride = {
  ...candidate,
  callDate: input.examDate,
  feasibility: "impossible",
  candidate: true,
  preparationCandidate: true,
};
const beforeImpossible = {
  events: eventCreates,
  batches: batchWrites,
  rpcs: rpcCalls.length,
};
await assert.rejects(() => api.createExamInvitationDraft(input), /no cabe/);
assert.equal(eventCreates, beforeImpossible.events);
assert.equal(batchWrites, beforeImpossible.batches);
assert.equal(rpcCalls.length, beforeImpossible.rpcs);
actualOverride = null;
outlooks = [
  {
    ...candidate,
    feasibility: "impossible",
    candidate: true,
    preparationCandidate: true,
  },
];
assert.equal(
  (await api.loadExamInvitationCandidates()).length,
  0,
  "Stale candidate flags cannot bypass hard infeasibility",
);
await assert.rejects(() => api.createExamInvitationDraft(input), /selección/);
actualOverride = null;
outlooks = [{ ...candidate, memberClass: "adults" }];
await api.createExamInvitationDraft(input);
drafted = rpcCalls.at(-1).args.p_rows[0];
assert.equal(drafted.exam_fee, 15);
assert.match(drafted.body, /20 EUR/);
outlooks = [candidate];
rows = [
  {
    ...drafted,
    id: "invite",
    member_id: "member",
    delivery_status: "draft",
    teacher_approved_at: "2099-11-01T00:00:00Z",
    teacher_approved_by: "Synthetic teacher",
    teacher_approved_exam_date: "2099-12-20",
    revoked_at: null,
    exam_events: {
      exam_date: "2099-12-20",
      status: "active",
      title: "Synthetic event",
    },
    members: { grade: candidate.currentGrade, class: "kids", status: "active" },
    snapshot: {
      ...drafted.snapshot,
      ...{ memberClass: "kids", email: candidate.email },
    },
    expires_at: "2099-12-20T00:00:00Z",
  },
];
outlooks = [];
await assert.rejects(
  () => api.sendExamInvitationBatch("batch"),
  /selección|preparación/,
);
assert.equal(sends, 0);
outlooks = [candidate];

actualOverride = {
  ...candidate,
  callDate: input.examDate,
  feasibility: "impossible",
  candidate: true,
  preparationCandidate: true,
};
const updatesBeforeImpossible = updates.length;
await assert.rejects(() => api.sendExamInvitationBatch("batch"), /ya no cabe/);
rows[0].delivery_status = "failed";
await assert.rejects(
  () => api.sendExamInvitationBatch("batch", { retryFailed: true }),
  /ya no cabe/,
);
rows[0].delivery_status = "draft";
assert.equal(sends, 0);
assert.equal(
  updates.length,
  updatesBeforeImpossible,
  "Impossible draft never claims SMTP delivery",
);
actualOverride = null;
eventDate = "2099-12-21";
await assert.rejects(
  () => api.sendExamInvitationBatch("batch"),
  /fecha del examen ha cambiado|autorización expresa/,
);
assert.equal(sends, 0);
eventDate = "2099-12-20";
auditFail = true;
claimed = false;
const results = await Promise.all([
  api.sendExamInvitationBatch("batch"),
  api.sendExamInvitationBatch("batch"),
]);
assert.equal(sends, 1);
assert.equal(
  results.reduce((n, x) => n + x.unconfirmed, 0),
  1,
);
assert.equal(
  results.reduce((n, x) => n + x.failed, 0),
  0,
);

auditFail = false;
rows[0].delivery_status = "failed";
claimed = false;
const beforeRetry = sends;
await api.sendExamInvitationBatch("batch");
assert.equal(sends, beforeRetry);
const retried = await api.sendExamInvitationBatch("batch", {
  retryFailed: true,
});
assert.equal(retried.sent, 1);
assert.equal(sends, beforeRetry + 1);
rows[0].delivery_status = "sending";
claimed = false;
await api.sendExamInvitationBatch("batch", { retryFailed: true });
assert.equal(sends, beforeRetry + 1);

for (const error of [
  Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
  new Error("unknown"),
  Object.assign(new Error("auth"), { code: "EAUTH" }),
  Object.assign(new Error("rejected"), {
    responseCode: 550,
    command: "RCPT TO",
  }),
]) {
  rows[0].delivery_status = "draft";
  claimed = false;
  smtpError = error;
  const result = await api.sendExamInvitationBatch("batch");
  const definite = error.code === "EAUTH" || error.responseCode === 550;
  assert.equal(result.failed, definite ? 1 : 0);
  assert.equal(result.unconfirmed, definite ? 0 : 1);
  assert.equal(result.sent, 0);
  assert.equal(updates.at(-1).delivery_status, definite ? "failed" : "sending");
}
smtpError = null;
await api.updateExamInvitationEvent({
  eventId: "event",
  title: "Updated",
  examDate: "2099-12-21",
});
assert.equal(rpcCalls.at(-1).args.p_notes, "Existing human notes");
assert.equal(rpcCalls.at(-1).name, "update_exam_invitation_event");
const before = rpcCalls.length;
await api.getPublicExamInvitation(api.createInvitationToken());
assert.equal(rpcCalls.length, before);
await api.respondExamInvitation(
  api.createInvitationToken(),
  "accepted",
  "Synthetic message",
);
assert.equal(rpcCalls.at(-1).name, "respond_exam_invitation");
assert.equal(rpcCalls.at(-1).args.p_response, "accepted");
assert.match(rpcCalls.at(-1).args.p_hash, /^[a-f0-9]{64}$/);
console.log(
  "Exam invitation actual-module checks passed: admin auth, token security, recipient safety, draft validation, immutable fees/reason, no GET/send-on-preview, preflight, concurrent CAS, accepted SMTP/audit failure, explicit response payload. No SMTP connection was made.",
);

// Approval is explicit and remains scoped to the exact member, grade, future date and open event.
rows[0].teacher_approved_at = null;
assert.equal(await api.getStudentExamInvitation("member"), null);
const noApprovalSends = sends;
rows[0].delivery_status = "draft";
await assert.rejects(
  () => api.sendExamInvitationBatch("batch"),
  /autorización expresa/,
);
assert.equal(sends, noApprovalSends);
actualOverride = {
  ...candidate,
  callDate: input.examDate,
  feasibility: "impossible",
};
const beforeBadApproval = rpcCalls.length;
await assert.rejects(
  () => api.approveExamInvitationBatch("batch"),
  /no permiten autorizar/,
);
assert.equal(rpcCalls.length, beforeBadApproval);
actualOverride = null;
await api.approveExamInvitationBatch("batch");
assert.equal(rpcCalls.at(-1).name, "approve_exam_invitation_batch");
assert.match(rpcCalls.at(-1).args.p_hashes.invite, /^[a-f0-9]{64}$/);
rows[0].teacher_approved_at = "2099-11-01T00:00:00Z";
assert.equal(api.isExamInvitationApprovalValid(rows[0]), true);
for (const invalid of [
  { ...rows[0], teacher_approved_at: null },
  { ...rows[0], teacher_approved_by: null },
  { ...rows[0], revoked_at: "2099-11-01" },
  { ...rows[0], teacher_approved_exam_date: "2099-12-19" },
  { ...rows[0], exam_events: { ...rows[0].exam_events, status: "completed" } },
  { ...rows[0], members: { ...rows[0].members, grade: "VERDE" } },
  { ...rows[0], members: { ...rows[0].members, status: "inactive" } },
])
  assert.equal(api.isExamInvitationApprovalValid(invalid), false);
const dtoReadBefore = rpcCalls.length;
const dto = await api.getStudentExamInvitation("member");
assert.equal(dto.invitationId, "invite");
for (const secret of ["token_hash", "snapshot", "email", "body", "subject"])
  assert.equal(secret in dto, false);
assert.equal(rpcCalls.length, dtoReadBefore, "Approval GET never mutates");
rows[0].member_id = "another-member";
const bindingBefore = rpcCalls.length;
await assert.rejects(
  () =>
    api.respondExamInvitationFromFicha({
      fichaToken: "a".repeat(32),
      invitationId: "invite",
      response: "accepted",
      message: "Synthetic",
    }),
  /no disponible/,
);
assert.equal(rpcCalls.length, bindingBefore);
rows[0].member_id = "member";
await api.respondExamInvitationFromFicha({
  fichaToken: "a".repeat(32),
  invitationId: "invite",
  response: "accepted",
  message: "Synthetic",
});
assert.equal(rpcCalls.at(-1).name, "respond_exam_invitation_from_ficha");
assert.equal(rpcCalls.at(-1).args.p_ficha_token, "a".repeat(32));
await api.revokeExamInvitationApproval("invite");
assert.equal(updates.at(-1).teacher_approved_at, null);
assert.equal(updates.at(-1).teacher_approved_exam_date, null);
console.log(
  "Teacher approval scope, auth, actual-date feasibility, safe DTO and ficha binding checks passed.",
);

const examMorning = new Date("2099-12-20T10:00:00Z");
assert.equal(
  api.isExamInvitationApprovalValid(
    { ...rows[0], response: "accepted" },
    examMorning,
  ),
  true,
);
assert.equal(
  api.isExamInvitationRegistrationOpen(
    { ...rows[0], response: "accepted" },
    examMorning,
  ),
  false,
);
assert.equal(
  api.isExamInvitationApprovalValid(rows[0], new Date("2099-12-21T10:00:00Z")),
  false,
);
const expiredBeforeExam = { ...rows[0], expires_at: "2099-12-18T00:00:00Z" };
assert.equal(
  api.isExamInvitationApprovalValid(
    expiredBeforeExam,
    new Date("2099-12-19T10:00:00Z"),
  ),
  true,
);
assert.equal(
  api.isExamInvitationRegistrationOpen(
    expiredBeforeExam,
    new Date("2099-12-19T10:00:00Z"),
  ),
  false,
);

// Planning uses the chosen actual date and explicit scoped approval without email.
outlooks = [
  {
    ...candidate,
    currentGrade: rows[0].snapshot.currentGrade,
    targetGrade: rows[0].snapshot.targetGrade,
    memberClass: rows[0].snapshot.memberClass,
  },
];
actualOverride = null;
const planningSends = sends;
const planningStart = rpcCalls.length;
assert.equal(await api.approveExamCallFromPlanning(input), "batch");
assert.deepEqual(
  rpcCalls.slice(planningStart).map((x) => x.name),
  ["replace_and_approve_exam_invitation_drafts"],
);
assert.equal(
  rpcCalls[planningStart].args.p_rows[0].snapshot.examDate,
  input.examDate,
);
assert.equal(
  rpcCalls[planningStart].args.p_rows[0].snapshot.callKey,
  input.callKey,
);
assert.equal(rpcCalls[planningStart].args.p_event_dates.event, input.examDate);
assert.equal(sends, planningSends);
actualOverride = { ...outlooks[0], callDate: null };
const beforeRejectedPlanning = rpcCalls.length;
await assert.rejects(
  () => api.approveExamCallFromPlanning(input),
  /tiempo mínimo/,
);
assert.equal(
  rpcCalls.length,
  beforeRejectedPlanning,
  "Invalid actual date cannot create or approve",
);
console.log(
  "Direct planning approval reuses actual-date validation and scoped authorisation; no SMTP.",
);

// A month-only planning approval must never claim its computational cutoff is an actual day.
actualOverride = null;
const monthOnlyStart = rpcCalls.length;
await api.approveExamCallFromPlanning({ ...input, examDate: "" });
const monthSaved = rpcCalls[monthOnlyStart].args;
assert.equal(monthSaved.p_rows[0].snapshot.dateConfirmed, false);
assert.equal(monthSaved.p_rows[0].snapshot.callMonth, "2099-12");
assert.equal(monthSaved.p_rows[0].snapshot.examDate, "2099-12-31");
assert.equal(monthSaved.p_event_dates.event, "2099-12-31");
assert.equal(
  updates.some((x) => x.date_confirmed === false),
  true,
);
const dateGuardWrites = rpcCalls.length;
await assert.rejects(
  () =>
    api.confirmPlanningExamDate({ eventId: "event", examDate: "2099-11-20" }),
  /mes/,
);
assert.equal(rpcCalls.length, dateGuardWrites);
assert.equal(
  monthSaved.p_rows[0].body.includes("2099-12-31"),
  false,
  "Provisional cutoff never appears as an actual day in mail text",
);
assert.match(monthSaved.p_rows[0].body, /día pendiente de confirmar/);
rows[0].response = "accepted";
rows[0].message = "Keep accepted message";
const confirmationStart = rpcCalls.length;
await api.confirmPlanningExamDate({ eventId: "event", examDate: "2099-12-15" });
assert.equal(rpcCalls[confirmationStart].name, "confirm_planning_exam_date");
assert.equal(rpcCalls[confirmationStart].args.p_exam_date, "2099-12-15");
assert.equal(rpcCalls[confirmationStart].args.p_expected_date, eventDate);
assert.match(
  rpcCalls[confirmationStart].args.p_updates.invite.body,
  /2099-12-15/,
);
assert.equal(rows[0].response, "accepted");
assert.equal(rows[0].message, "Keep accepted message");
actualOverride = {
  ...outlooks[0],
  callDate: "2099-12-15",
  feasibility: "impossible",
};
const badDayBefore = rpcCalls.length;
await assert.rejects(
  () =>
    api.confirmPlanningExamDate({ eventId: "event", examDate: "2099-12-15" }),
  /no cabe/,
);
assert.equal(rpcCalls.length, badDayBefore);
actualOverride = null;
eventConfirmed = false;
rows[0].delivery_status = "draft";
const monthSendBefore = sends;
await assert.rejects(
  () => api.sendExamInvitationBatch("batch"),
  /Confirma el día real/,
);
assert.equal(sends, monthSendBefore);
rows[0].exam_events = {
  ...rows[0].exam_events,
  date_confirmed: false,
  call_month: "2099-12",
};
const monthlyDto = await api.getStudentExamInvitation("member");
assert.equal(monthlyDto.dateConfirmed, false);
assert.equal(monthlyDto.callMonth, "2099-12");
const plannedList = await api.listPlanningExamApprovals();
assert.equal(plannedList[0].dateConfirmed, false);
assert.equal(plannedList[0].examDate, null);
assert.equal(plannedList[0].acceptedCount, 1);
eventConfirmed = true;
console.log(
  "Month-only planning, hidden cutoff, exact-day feasibility/confirmation and preserved responses checks passed.",
);
admin = false;
await assert.rejects(
  () =>
    api.confirmPlanningExamDate({ eventId: "event", examDate: "2099-12-15" }),
  /Acceso interno/,
);
await assert.rejects(() => api.listPlanningExamApprovals(), /Acceso interno/);
admin = true;
