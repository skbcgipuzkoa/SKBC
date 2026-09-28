import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/email-notifications.ts", import.meta.url), "utf8");
const actionsSource = await readFile(new URL("../src/app/material-order-actions.ts", import.meta.url), "utf8");
const repositorySource = await readFile(new URL("../src/lib/web-orders/repository.ts", import.meta.url), "utf8");
const dashboardSource = await readFile(new URL("../src/components/material-orders-dashboard.tsx", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("email-notifications.ts", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const required = [
  "buildPreparedMaterialOrderEmail",
  "buildPreparedMaterialOrderPreview",
  "processPreparedMaterialOrderCommunications"
];

for (const name of required) {
  assert.match(source, new RegExp(`export\\s+(?:async\\s+)?function\\s+${name}\\b`), `${name} must be exported`);
}

const dependencyNames = new Set([
  ...required,
  "escapeHtml",
  "formatEuros",
  "materialCommunicationTotal",
  "preparedPaymentMessage",
  "conciseEmailError",
  "errorMessage"
]);
const declarations = sourceFile.statements
  .filter((statement) => ts.isFunctionDeclaration(statement) && statement.name && dependencyNames.has(statement.name.text))
  .map((statement) => statement.getText(sourceFile))
  .join("\n");
const javascript = ts.transpileModule(declarations, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const api = await import(`data:text/javascript,${encodeURIComponent(javascript)}`);

const robert = prepared({
  id: "comm-robert",
  recipientEmail: "robert@example.com",
  payerName: "Robert Etxeberria",
  orderNumber: "SKBC-2026-001",
  items: [
    item("line-1", "Iraia", "Dogi Basic", "2", 3000),
    item("line-2", "Iraia", "Dogi Basic", "2", 3000)
  ]
});
const aixa = prepared({
  id: "comm-aixa",
  recipientEmail: "aixa@example.com",
  payerName: "Aixa Lasa",
  orderNumber: "SKBC-2026-002",
  items: [item("line-3", "Unai", "Cinturón blanco", "3", 500)]
});

const robertMail = api.buildPreparedMaterialOrderEmail(robert);
assert.deepEqual(Object.keys(robertMail).sort(), ["html", "subject", "text", "to"]);
assert.equal(robertMail.to, "robert@example.com");
assert.doesNotMatch(JSON.stringify(robertMail), /aixa@example\.com|Aixa Lasa|Unai/i);
assert.match(robertMail.text, /Robert Etxeberria/);
assert.match(robertMail.text, /SKBC-2026-001/);
assert.match(robertMail.text, /16 sep - 15 oct 2026/i);
assert.match(robertMail.text, /60,00\s*€/);
assert.equal((robertMail.html.match(/data-material-item=/g) ?? []).length, 2, "identical items remain separate visible rows");
assert.match(robertMail.html, /instagram\.com\/skbc_gipuzkoa/);
assert.match(robertMail.html, /logo-skbc\.png/);
assert.equal("cc" in robertMail, false);
assert.equal("bcc" in robertMail, false);

const aixaMail = api.buildPreparedMaterialOrderEmail(aixa);
assert.doesNotMatch(JSON.stringify(aixaMail), /robert@example\.com|Robert Etxeberria|Iraia/i);

const preview = api.buildPreparedMaterialOrderPreview([robert, aixa], "club@skbc.test");
assert.deepEqual(Object.keys(preview).sort(), ["html", "subject", "text", "to"]);
assert.equal(preview.to, "club@skbc.test");
assert.match(preview.html, /Robert Etxeberria/);
assert.match(preview.html, /Aixa Lasa/);
assert.equal("cc" in preview, false);
assert.equal("bcc" in preview, false);

const sends = [];
const completions = [];
const ambiguous = [];
const result = await api.processPreparedMaterialOrderCommunications(
  [
    aixa,
    prepared({ ...robert, id: "comm-persist", recipientEmail: "persist@example.com" }),
    prepared({ ...robert, id: "comm-smtp", recipientEmail: "smtp-fail@example.com" })
  ],
  {
    send: async (mail) => {
      sends.push(mail);
      if (mail.to === "smtp-fail@example.com") throw new Error("SMTP rejected recipient and a very long diagnostic".repeat(20));
    },
    complete: async (communication, outcome) => {
      completions.push({ id: communication.id, ...outcome });
      if (communication.id === "comm-persist" && outcome.outcome === "delivered") {
        throw new Error("database unavailable after SMTP acceptance");
      }
    },
    markDeliveredUnconfirmed: async (communication, error) => ambiguous.push({ id: communication.id, error }),
    now: () => "2026-09-28T12:00:00.000Z"
  }
);
assert.equal(result.sentCount, 1);
assert.equal(result.failedCount, 1);
assert.equal(result.ambiguousCount, 1);
assert.deepEqual(sends.map((mail) => mail.to), ["aixa@example.com", "persist@example.com", "smtp-fail@example.com"]);
assert.deepEqual(completions.map(({ id, outcome }) => ({ id, outcome })), [
  { id: "comm-aixa", outcome: "delivered" },
  { id: "comm-persist", outcome: "delivered" },
  { id: "comm-smtp", outcome: "smtp_failed" }
]);
assert.deepEqual(ambiguous.map(({ id }) => id), ["comm-persist"], "SMTP-success persistence failures require manual reconciliation");
assert.ok(completions[2].error.length <= 240, "stored SMTP errors are concise");

const testSends = [];
const testUpdates = [];
const testResult = await api.processPreparedMaterialOrderCommunications([robert, aixa], {
  testRecipient: "club@skbc.test",
  send: async (mail) => testSends.push(mail),
    complete: async (...args) => testUpdates.push(args),
    markDeliveredUnconfirmed: async (...args) => testUpdates.push(args)
});
assert.equal(testResult.previewOnly, true);
assert.equal(testSends.length, 1);
assert.equal(testSends[0].to, "club@skbc.test");
assert.equal(testUpdates.length, 0, "test mode never changes real communication outcomes");

assert.match(actionsSource, /campaignId:\s*formData\.get\("campaignId"\)/, "final send must include the campaign ID");
assert.match(actionsSource, /sendConfirmed:\s*formData\.get\("sendConfirmed"\) === "yes"/, "server action must validate explicit send confirmation");
assert.match(actionsSource, /new Set\(input\.communicationIds\)\.size !== input\.communicationIds\.length/, "duplicate communication IDs must be rejected");
assert.match(actionsSource, /preview\.campaignId !== input\.campaignId/, "mixed or foreign campaign snapshots must be rejected before claims");
assert.doesNotMatch(actionsSource, /from\("skbc_order_communications"\)\.update/, "delivery state changes must use RPCs only");
for (const rpc of ["claim_skbc_order_communication", "complete_skbc_order_communication_attempt", "reconcile_skbc_order_communication"]) {
  assert.match(repositorySource, new RegExp(rpc), `missing ${rpc} repository contract`);
}
assert.match(repositorySource, /p_attempt_token:\s*input\.attemptToken/, "claims and completions must bind an attempt token");
assert.match(dashboardSource, /name="sendConfirmed"[^>]+required/, "final send confirmation control is required");
assert.match(dashboardSource, /name="reconcileConfirmed" value="yes"/, "ambiguous attempts need an explicit reconciliation control");

console.log("Material order email privacy and retry checks passed.");

function prepared(overrides = {}) {
  return {
    id: "comm-default",
    status: "sending",
    campaignId: "campaign-closed",
    attemptToken: "attempt-default",
    recipientEmail: "robert@example.com",
    payerName: "Robert Etxeberria",
    paymentMethod: "cash",
    campaignReference: "16 Sep - 15 Oct 2026",
    orderNumber: "SKBC-2026-001",
    items: [item("line-default", "Iraia", "Dogi Basic", "2", 3000)],
    ...overrides
  };
}

function item(id, recipient, productName, variantName, lineTotalCents) {
  return { id, recipient, productName, variantName, sku: "10000-2", quantity: 1, unitPriceCents: lineTotalCents, lineTotalCents };
}
