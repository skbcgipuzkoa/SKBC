import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const campaignsSource = await readFile(
  new URL("../src/lib/web-orders/campaigns.ts", import.meta.url),
  "utf8"
);
const campaignsJavaScript = ts.transpileModule(campaignsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { advanceCampaignStatus, getCampaignPeriod } = await import(
  `data:text/javascript,${encodeURIComponent(campaignsJavaScript)}`
);

assert.deepEqual(getCampaignPeriod(new Date("2026-10-15T12:00:00Z")), {
  startsOn: "2026-09-16",
  endsOn: "2026-10-15",
  label: "16 Sep - 15 Oct"
});
assert.deepEqual(getCampaignPeriod(new Date("2026-10-16T12:00:00Z")), {
  startsOn: "2026-10-16",
  endsOn: "2026-11-15",
  label: "16 Oct - 15 Nov"
});

const openCampaign = {
  id: "campaign-1",
  period_start: "2026-09-16",
  period_end: "2026-10-15",
  status: "open",
  created_at: "2026-09-16T00:00:00Z",
  updated_at: "2026-09-16T00:00:00Z"
};

assert.equal(
  advanceCampaignStatus(openCampaign, new Date("2026-10-15T21:59:59Z")).status,
  "open",
  "the campaign remains open through 15 October in Europe/Madrid"
);
assert.equal(
  advanceCampaignStatus(openCampaign, new Date("2026-10-15T22:00:00Z")).status,
  "pending_close",
  "the campaign becomes pending_close after its Madrid end date"
);
assert.equal(
  advanceCampaignStatus(
    { ...openCampaign, status: "closed" },
    new Date("2026-10-16T12:00:00Z")
  ).status,
  "closed",
  "an administrator-closed campaign stays closed"
);

const repositorySource = await readFile(
  new URL("../src/lib/web-orders/repository.ts", import.meta.url),
  "utf8"
);
for (const operation of [
  "getCurrentCampaign",
  "listCampaignOrders",
  "getSupplierSummary",
  "listCatalog",
  "upsertCatalogProduct",
  "updateVariantPricing",
  "assignPaymentMethod",
  "closeCampaign"
]) {
  assert.match(repositorySource, new RegExp(`export\\s+async\\s+function\\s+${operation}\\b`));
}
assert.match(repositorySource, /\.rpc\("close_skbc_order_campaign",\s*\{\s*p_campaign_id:/s);
assert.match(repositorySource, /prepared_communication_count/);
assert.match(repositorySource, /\.eq\("period_start",\s*period\.startsOn\)/);
assert.match(repositorySource, /\.upsert\(input,\s*\{\s*onConflict:\s*input\.id\s*\?\s*"id"\s*:\s*"slug"\s*\}\)/);
assert.doesNotMatch(repositorySource, /starts_on|ends_on|supplier_reference|cost_cents|(?<!unit_)price_cents/);

console.log("Order campaign checks passed.");
