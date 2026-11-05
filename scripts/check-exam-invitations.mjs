import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
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
  eventDate = "2099-12-20",
  overrideCalls = [];
const candidate = {
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
        data: table === "exam_events" ? { notes: "" } : { id: "batch" },
        error: null,
      };
    },
    async maybeSingle() {
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
        result = { data: [{ id: "event", exam_date: eventDate }], error: null };
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
  "sendExamInvitationBatch",
  "updateExamInvitationEvent",
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
    snapshot: {
      ...drafted.snapshot,
      ...{ memberClass: "kids", email: candidate.email },
    },
    expires_at: "2099-12-20T00:00:00Z",
  },
];
outlooks = [];
await assert.rejects(() => api.sendExamInvitationBatch("batch"), /selección/);
assert.equal(sends, 0);
outlooks = [candidate];
eventDate = "2099-12-21";
await assert.rejects(
  () => api.sendExamInvitationBatch("batch"),
  /fecha del examen ha cambiado/,
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
