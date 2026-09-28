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
assert.match(clientSource, /WEB_ORDERS_SUPABASE_URL/);
assert.match(clientSource, /WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(clientSource, /NEXT_PUBLIC_/);
assert.match(clientSource, /persistSession:\s*false/);
assert.match(clientSource, /autoRefreshToken:\s*false/);
assert.match(clientSource, /detectSessionInUrl:\s*false/);

const envExample = await readFile(new URL("../.env.example", import.meta.url), "utf8");
assert.match(envExample, /^WEB_ORDERS_SUPABASE_URL=$/m);
assert.match(envExample, /^WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY=$/m);

console.log("Web order pricing checks passed.");
