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
  args: ["p_campaign_id"],
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
assert.match(repositorySource, /\.upsert\(input,\s*\{\s*onConflict:\s*input\.id\s*\?\s*"id"\s*:\s*"slug"\s*\}\)/);
const assignPaymentFunction = repositoryFile.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "assignPaymentMethod"
);
assert.ok(assignPaymentFunction, "assignPaymentMethod must exist");
assert.doesNotMatch(assignPaymentFunction.getText(repositoryFile), /\.from\(|\.update\(/);

console.log("Order campaign checks passed.");
