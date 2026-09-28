import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const pricingSource = await readFile(new URL("../src/lib/web-orders/pricing.ts", import.meta.url), "utf8");
const pricingJavaScript = ts.transpileModule(pricingSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { roundClubPrice } = await import(`data:text/javascript,${encodeURIComponent(pricingJavaScript)}`);

const examples = [
  { product: "Basic", costCents: 2500, expectedPriceCents: 3000 },
  { product: "Training", costCents: 4000, expectedPriceCents: 4500 },
  { product: "Kata", costCents: 7500, expectedPriceCents: 8000 }
];

for (const { product, costCents, expectedPriceCents } of examples) {
  assert.equal(
    roundClubPrice(costCents),
    expectedPriceCents,
    `${product} price should include the club margin and round to 5 EUR`
  );
}

const clientSource = await readFile(new URL("../src/lib/web-orders/client.ts", import.meta.url), "utf8");
assert.match(clientSource, /^import "server-only";/m);
assert.match(clientSource, /WEB_ORDERS_SUPABASE_URL/);
assert.match(clientSource, /WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(clientSource, /NEXT_PUBLIC_/);
assert.match(clientSource, /persistSession:\s*false/);
assert.match(clientSource, /autoRefreshToken:\s*false/);
assert.match(clientSource, /detectSessionInUrl:\s*false/);

const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
assert.match(envExample, /^WEB_ORDERS_SUPABASE_URL=$/m);
assert.match(envExample, /^WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY=$/m);

const typesSource = await readFile(new URL("../src/lib/web-orders/types.ts", import.meta.url), "utf8");
const typesFile = ts.createSourceFile("types.ts", typesSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const aliases = new Map(
  typesFile.statements
    .filter(ts.isTypeAliasDeclaration)
    .map((declaration) => [declaration.name.text, declaration.type])
);
assert.deepEqual([...aliases.keys()].sort(), [
  "WebOrder",
  "WebOrderCampaign",
  "WebOrderCampaignStatus",
  "WebOrderCommunication",
  "WebOrderCommunicationChannel",
  "WebOrderCommunicationDirection",
  "WebOrderItem",
  "WebOrderJson",
  "WebOrderPaymentMethod",
  "WebOrderProduct",
  "WebOrderStatus",
  "WebOrderVariant"
]);
assert.equal(aliases.get("WebOrderPaymentMethod")?.kind, ts.SyntaxKind.StringKeyword);

assert.deepEqual(literalUnion("WebOrderStatus"), [
  "pending", "seen", "contacted", "payment_pending", "paid", "delivered", "cancelled"
]);
assert.deepEqual(literalUnion("WebOrderCampaignStatus"), ["open", "closed"]);
assert.deepEqual(literalUnion("WebOrderCommunicationChannel"), ["email", "phone", "whatsapp", "in_person", "internal"]);
assert.deepEqual(literalUnion("WebOrderCommunicationDirection"), ["inbound", "outbound", "internal"]);

assertRecord("WebOrderProduct", {
  id: "string",
  slug: "string",
  name: "string",
  description: "string | null",
  image_url: "string | null",
  sort_order: "number",
  is_active: "boolean",
  created_at: "string",
  updated_at: "string"
});
assertRecord("WebOrderVariant", {
  id: "string",
  product_id: "string",
  sku: "string",
  name: "string",
  attributes: "WebOrderJson",
  unit_price_cents: "number",
  sort_order: "number",
  is_active: "boolean",
  created_at: "string",
  updated_at: "string"
});
assertRecord("WebOrderCampaign", {
  id: "string",
  period_start: "string",
  period_end: "string",
  status: "WebOrderCampaignStatus",
  created_at: "string",
  updated_at: "string"
});
assertRecord("WebOrder", {
  id: "string",
  created_at: "string",
  updated_at: "string | null",
  status: "WebOrderStatus",
  customer_name: "string",
  customer_phone: "string",
  customer_email: "string | null",
  payment_method: "string | null",
  custom_reference: "string | null",
  custom_details: "string | null",
  comments: "string | null",
  items: "WebOrderJson",
  total_estimated: "number | null",
  page_lang: "string | null",
  source: "string | null",
  order_number: "string | null",
  idempotency_key: "string | null",
  campaign_id: "string | null",
  member_reference: "string | null",
  total_cents: "number | null",
  request_hash: "string | null"
});
assertRecord("WebOrderItem", {
  id: "string",
  order_id: "string",
  variant_id: "string",
  product_name: "string",
  variant_name: "string",
  sku: "string",
  quantity: "number",
  unit_price_cents: "number",
  line_total_cents: "number",
  created_at: "string"
});
assertRecord("WebOrderCommunication", {
  id: "string",
  order_id: "string",
  channel: "WebOrderCommunicationChannel",
  direction: "WebOrderCommunicationDirection",
  subject: "string | null",
  body: "string",
  created_by: "string | null",
  created_at: "string"
});

function literalUnion(name) {
  const node = aliases.get(name);
  assert.ok(node && ts.isUnionTypeNode(node), `${name} must be a literal union`);
  return node.types.map((member) => {
    assert.ok(ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal), `${name} members must be string literals`);
    return member.literal.text;
  });
}

function assertRecord(name, expected) {
  const node = aliases.get(name);
  assert.ok(node && ts.isTypeLiteralNode(node), `${name} must be a record type`);
  const actual = Object.fromEntries(node.members.map((member) => {
    assert.ok(ts.isPropertySignature(member) && member.type && ts.isIdentifier(member.name), `${name} must contain typed properties only`);
    return [member.name.text, member.type.getText(typesFile)];
  }));
  assert.deepEqual(actual, expected, `${name} must match SUPABASE-PEDIDOS.sql at 2abc163`);
}

console.log("Web order pricing and schema checks passed.");
