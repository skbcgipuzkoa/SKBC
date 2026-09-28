import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const notificationsPage = await readFile(new URL("../src/app/notificaciones/page.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/actions.ts", import.meta.url), "utf8");

for (const source of [notificationsPage, actions]) {
  assert.doesNotMatch(source, /sendMaterialOrderEmailCampaignAction/, "legacy material sends must not be reachable");
}
assert.doesNotMatch(notificationsPage, /<MaterialOrderEmailCampaign\b/, "Notificaciones must not render the legacy material sender");
assert.doesNotMatch(notificationsPage, /function materialOrderGroups\b/, "hard-coded legacy campaign data must be removed");
assert.match(notificationsPage, /sendStudentEmailNotificationAction/, "unrelated student email notifications remain available");

console.log("Legacy material send path is absent.");
