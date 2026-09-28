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
const { advanceCampaignStatus, getCampaignPeriod, selectManagementCampaign } = await import(
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

const campaignChoices = [
  { ...openCampaign, id: "current", period_start: "2026-10-16", period_end: "2026-11-15" },
  { ...openCampaign, id: "oldest-actionable", period_start: "2026-08-16", period_end: "2026-09-15" },
  { ...openCampaign, id: "newer-actionable", period_start: "2026-09-16", period_end: "2026-10-15" },
  { ...openCampaign, id: "closed", period_start: "2026-07-16", period_end: "2026-08-15", status: "closed" }
];
assert.equal(
  selectManagementCampaign(campaignChoices, undefined, new Date("2026-10-20T12:00:00Z"))?.id,
  "oldest-actionable",
  "the oldest expired open campaign is actionable by default"
);
assert.equal(
  selectManagementCampaign(campaignChoices, "closed", new Date("2026-10-20T12:00:00Z"))?.id,
  "closed",
  "an explicit campaign selection can open historical closed workflow data"
);
assert.equal(
  selectManagementCampaign(campaignChoices, "missing", new Date("2026-10-20T12:00:00Z"))?.id,
  "oldest-actionable",
  "an invalid selection falls back to the actionable default"
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
const repositoryFile = ts.createSourceFile(
  "repository.ts",
  repositorySource,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TS
);
for (const operation of [
  "getCurrentCampaign",
  "listCampaignOrders",
  "getSupplierSummary",
  "listCatalog",
  "upsertCatalogProduct",
  "createCatalogVariant",
  "updateVariantPricing",
  "assignPaymentMethod",
  "closeCampaign"
]) {
  assert.match(repositorySource, new RegExp(`export\\s+async\\s+function\\s+${operation}\\b`));
}

const contractSource = repositoryFile.statements
  .filter((statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        ["WEB_ORDER_RPC_CONTRACTS", "SUPPLIER_SUMMARY_SCHEMA_FIELDS"].includes(declaration.name.text)
    )
  )
  .map((statement) => statement.getText(repositoryFile))
  .join("\n");
const contractJavaScript = ts.transpileModule(contractSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { SUPPLIER_SUMMARY_SCHEMA_FIELDS, WEB_ORDER_RPC_CONTRACTS } = await import(
  `data:text/javascript,${encodeURIComponent(contractJavaScript)}`
);

assert.deepEqual(WEB_ORDER_RPC_CONTRACTS.assignPaymentMethod, {
  name: "assign_skbc_order_payment_method",
  args: ["p_order_id", "p_payment_method"],
  requiresOpenCampaign: true
});
assert.deepEqual(WEB_ORDER_RPC_CONTRACTS.closeCampaign, {
  name: "close_skbc_order_campaign",
  args: ["p_campaign_id", "p_expected_order_count", "p_expected_communication_count"],
  locksCampaign: true,
  preparesCommunications: true
});
assert.deepEqual(SUPPLIER_SUMMARY_SCHEMA_FIELDS, ["supplier_reference", "size", "cost_cents"]);

const summaryFunction = repositoryFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "summarizeSupplierItems"
);
assert.ok(summaryFunction, "repository must export summarizeSupplierItems for executable aggregation checks");
const summaryJavaScript = ts.transpileModule(summaryFunction.getText(repositoryFile), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { summarizeSupplierItems } = await import(
  `data:text/javascript,${encodeURIComponent(summaryJavaScript)}`
);
assert.deepEqual(
  summarizeSupplierItems([
    {
      supplier_reference: "10000",
      size: "2",
      product_name: "Basic",
      quantity: 1,
      cost_cents: 2500,
      unit_price_cents: 3000
    },
    {
      supplier_reference: "10000",
      size: "2",
      product_name: "Renamed Basic",
      quantity: 2,
      cost_cents: 2500,
      unit_price_cents: 3500
    }
  ]),
  [{
    supplierReference: "10000",
    size: "2",
    productName: "Basic",
    quantity: 3,
    unitCostCents: 2500,
    totalCostCents: 7500
  }],
  "supplier rows group only by reference and size and total supplier cost"
);

assert.match(repositorySource, /\.eq\("period_start",\s*period\.startsOn\)/);
assert.doesNotMatch(repositorySource, /\.upsert\(/, "catalog products must not use ambiguous upsert semantics");
assert.match(repositorySource, /if\s*\(input\.id\)[\s\S]+\.update\([\s\S]+\.eq\("id",\s*id\)/, "existing products must use update-by-ID only");
assert.match(repositorySource, /supplier_reference:\s*string/, "new products must require supplier_reference");
assert.match(repositorySource, /\.insert\(input as CatalogProductFields\)/, "complete create payloads must use insert");
assert.match(repositorySource, /export type CatalogVariantInput/, "variant creation must have a complete input contract");
assert.match(repositorySource, /from\("skbc_merch_variants"\)\.insert\(input as CatalogVariantFields\)/, "new variants must use an explicit insert");
const assignPaymentFunction = repositoryFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "assignPaymentMethod"
);
assert.ok(assignPaymentFunction, "assignPaymentMethod must exist");
assert.doesNotMatch(assignPaymentFunction.getText(repositoryFile), /\.from\(|\.update\(/);

const closeCampaignFunction = repositoryFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "closeCampaign"
);
assert.ok(closeCampaignFunction, "closeCampaign must exist");
const closeCampaignText = closeCampaignFunction.getText(repositoryFile);
assert.match(closeCampaignText, /expectedOrderCount:\s*number/);
assert.match(closeCampaignText, /expectedCommunicationCount:\s*number/);
assert.match(closeCampaignText, /p_expected_order_count:\s*expectedOrderCount/);
assert.match(closeCampaignText, /p_expected_communication_count:\s*expectedCommunicationCount/);
assert.match(closeCampaignText, /parseCloseCampaignResult\(data\)/);

const closeResultParser = repositoryFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "parseCloseCampaignResult"
);
assert.ok(closeResultParser, "close RPC result must be runtime validated");
const closeResultJavaScript = ts.transpileModule(closeResultParser.getText(repositoryFile).replace(/^function /, "export function "), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { parseCloseCampaignResult } = await import(`data:text/javascript,${encodeURIComponent(closeResultJavaScript)}`);
assert.deepEqual(parseCloseCampaignResult([{
  campaign_id: "10000000-0000-4000-8000-000000000001",
  order_count: 2,
  prepared_communication_count: 1
}]), {
  campaign_id: "10000000-0000-4000-8000-000000000001",
  order_count: 2,
  prepared_communication_count: 1
});
assert.throws(() => parseCloseCampaignResult([{ campaign_id: "bad", order_count: 2 }]), /invalid result/i);

const actionsSource = await readFile(
  new URL("../src/app/material-order-actions.ts", import.meta.url),
  "utf8"
);
assert.doesNotMatch(actionsSource, /attributes\s*=\s*\{[\s\S]*cost_cents/);
for (const field of ["cost_cents", "margin_cents", "price_cents", "cost_basis", "promotion_price_cents", "promotion_starts_at", "promotion_ends_at", "promotion_is_active"]) {
  assert.match(actionsSource, new RegExp(`${field}:`), `variant updates must write ${field}`);
}
assert.match(actionsSource, /getCampaignById\(input\.campaignId\)/);
assert.match(actionsSource, /advanceCampaignStatus\(campaign/);
assert.match(actionsSource, /status\s*!==\s*"pending_close"/);
assert.match(
  actionsSource,
  /closeCampaign\(\s*input\.campaignId,\s*input\.expectedOrderCount,\s*input\.expectedCommunicationCount\s*\)/s
);
assert.match(actionsSource, /supplierReference:\s*z\.string\(\)\.trim\(\)\.min\(1\)/, "product validation must require supplier reference");
assert.match(actionsSource, /supplier_reference:\s*input\.supplierReference/, "product action must pass supplier reference");
assert.match(actionsSource, /category:\s*z\.string\(\)\.trim\(\)\.min\(1\)/, "product validation must require category");
assert.match(actionsSource, /export async function createMaterialVariantAction/, "variant creation needs a server action");
for (const field of ["productId", "sku", "size", "supplierReference", "costCents", "marginCents", "priceCents", "promotionPriceCents", "active"]) {
  assert.match(actionsSource, new RegExp(`${field}:\\s*formData\\.get\\("${field}"\\)|${field}:\\s*formData\\.get\\("${field}"\\) === "on"`), `variant creation must parse ${field}`);
}

const dashboardSource = await readFile(
  new URL("../src/components/material-orders-dashboard.tsx", import.meta.url),
  "utf8"
);
const dashboardFile = ts.createSourceFile(
  "material-orders-dashboard.tsx",
  dashboardSource,
  ts.ScriptTarget.ES2022,
  true,
  ts.ScriptKind.TSX
);
const csvCellFunction = dashboardFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "csvCell"
);
assert.ok(csvCellFunction, "csvCell must exist for executable CSV safety checks");
const csvCellJavaScript = ts.transpileModule(csvCellFunction.getText(dashboardFile), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { csvCell } = await import(
  `data:text/javascript,${encodeURIComponent(csvCellJavaScript)}`
);
for (const prefix of ["=", "+", "-", "@"]) {
  assert.equal(csvCell(`${prefix}SUM(A1:A2)`), `'${prefix}SUM(A1:A2)`);
}
assert.equal(csvCell('safe, "quoted"'), '"safe, ""quoted"""');

assert.match(dashboardSource, /role="tablist"/);
assert.match(dashboardSource, /aria-controls=/);
assert.match(dashboardSource, /aria-labelledby=/);
assert.match(dashboardSource, /role="tabpanel"/);
assert.match(dashboardSource, /tabIndex=\{activeTab === id \? 0 : -1\}/);
for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
  assert.match(dashboardSource, new RegExp(`case ["']${key}["']`));
}
assert.match(dashboardSource, /campaign\.status !== "pending_close"/);
assert.match(dashboardSource, /order\.status !== "cancelled"[^\n]+customer_email/, "cancelled orders must not block close validation");
assert.match(dashboardSource, /name="supplierReference"/, "catalog form must submit supplier reference");
assert.match(dashboardSource, /action=\{updateMaterialProductAction\}[\s\S]*name="productId" value=""/, "catalog must expose product creation");
assert.match(dashboardSource, /action=\{createMaterialVariantAction\}/, "each product must expose variant creation");
for (const field of ["category", "imageUrl", "sourceUrl", "imageAttribution", "sku", "size", "costCents", "marginCents", "priceCents", "promotionPriceCents", "active"]) {
  assert.match(dashboardSource, new RegExp(`name=["']${field}["']`), `catalog UI must expose ${field}`);
}

const pageSource = await readFile(new URL("../src/app/pedidos-cinturones/page.tsx", import.meta.url), "utf8");
assert.match(pageSource, /campaign\?: string/, "the route must accept an explicit campaign query parameter");
assert.match(pageSource, /selectManagementCampaign\(rawCampaigns, selectedCampaignId\)/, "dashboard loading must resolve the selected campaign");
assert.match(pageSource, /listCampaignOrders\(selectedCampaign\.id\)/, "orders must load for the selected campaign");
assert.match(pageSource, /getSupplierSummary\(selectedCampaign\.id\)/, "supplier summary must load for the selected campaign");

const groupingFunction = repositoryFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "countEligibleCommunicationGroups"
);
assert.ok(groupingFunction, "repository must export the close-preview grouping helper");
const groupingJavaScript = ts.transpileModule(groupingFunction.getText(repositoryFile), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { countEligibleCommunicationGroups } = await import(
  `data:text/javascript,${encodeURIComponent(groupingJavaScript)}`
);
assert.equal(countEligibleCommunicationGroups([
  { status: "pending", customer_email: " Family@Example.com " },
  { status: "paid", customer_email: "family@example.COM" },
  { status: "cancelled", customer_email: "other@example.com" },
  { status: "pending", customer_email: null }
]), 1, "preview count must normalize shared emails and exclude cancelled orders");

console.log("Order campaign checks passed.");
