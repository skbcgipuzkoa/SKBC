# Public Material Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public SKBC material catalog and monthly ordering workflow whose data lives only in the website Supabase and is operated from the existing management application.

**Architecture:** The static website reads active catalog rows and submits complete orders through one atomic Supabase RPC protected by RLS and anti-spam controls. The Next.js management app uses a separate server-only Supabase client for that website database, presents campaign/catalog/order views, closes campaigns, and sends one reviewed email per payer.

**Tech Stack:** PostgreSQL/Supabase, vanilla JavaScript/CSS website on GitHub Pages, Next.js 15/React 19/TypeScript on Vercel, Nodemailer, Node test runner, Playwright browser verification.

---

## Repository Map

- Management app: `C:/Users/alvar/Desktop/CLAUDE/superpowers-main/skbc-new-platform`
- Public website: `C:/Users/alvar/Documents/PAGINA WEB SKBC GIPUZKOA CANVA/github-web-skbc-gipuzkoa`
- Website schema owner: `SUPABASE-PEDIDOS.sql`
- Website ordering UI: `app.js`, `styles.css`, `content.js`, `index.html`
- Management ordering route: extend `src/app/pedidos-cinturones/page.tsx` rather than create a second competing Pedidos menu.
- Cross-project data boundary: new `src/lib/web-orders/` modules; do not use the management Supabase client for website data.

### Task 1: Create the website order schema and atomic public RPC

**Files:**
- Modify: `[website]/SUPABASE-PEDIDOS.sql`
- Create: `[website]/tests/order-schema.test.mjs`

- [ ] **Step 1: Write a failing schema contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../SUPABASE-PEDIDOS.sql", import.meta.url), "utf8");

test("material ordering schema exposes only the atomic public submission RPC", () => {
  for (const name of ["skbc_merch_products", "skbc_merch_variants", "skbc_order_campaigns", "skbc_merch_order_items", "skbc_order_communications"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${name}`, "i"));
  }
  assert.match(sql, /create or replace function public\.submit_skbc_merch_order/i);
  assert.match(sql, /revoke all on table public\.skbc_merch_orders from anon/i);
  assert.match(sql, /grant execute on function public\.submit_skbc_merch_order/i);
});
```

- [ ] **Step 2: Run the contract and confirm it fails**

Run: `node --test tests/order-schema.test.mjs`

Expected: FAIL because the new tables and RPC do not exist.

- [ ] **Step 3: Add normalized tables, constraints, RLS and the transaction RPC**

Add catalog, variant, campaign, item and communication tables while retaining existing `skbc_merch_orders`. The RPC signature must be:

```sql
submit_skbc_merch_order(
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_member_reference text,
  p_comments text,
  p_page_lang text,
  p_items jsonb
) returns table(order_id uuid, order_number text, total_cents integer)
```

Inside the function, resolve the open campaign, lock active variants, calculate all prices from database rows, insert the header and individual items, and return the generated public order number. Reject empty orders, inactive variants, quantities outside `1..10`, more than 30 lines, and duplicate idempotency keys. Grant anonymous users only catalog reads and RPC execution; deny direct order reads and writes.

- [ ] **Step 4: Run the schema contract**

Run: `node --test tests/order-schema.test.mjs`

Expected: PASS.

- [ ] **Step 5: Apply SQL to the website Supabase and smoke test rollback behavior**

Run the SQL in the website Supabase project, call the RPC once with an invalid variant, and verify that neither the order header nor any item is inserted.

- [ ] **Step 6: Commit the website schema**

```bash
git add SUPABASE-PEDIDOS.sql tests/order-schema.test.mjs
git commit -m "Add monthly material order schema"
```

### Task 2: Seed the approved Fujimae catalog and optimized images

**Files:**
- Create: `[website]/assets/products/fujimae/*.webp`
- Create: `[website]/scripts/seed-material-catalog.mjs`
- Create: `[website]/tests/catalog-seed.test.mjs`

- [ ] **Step 1: Write the failing catalog fixture test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { products, variants } from "../scripts/seed-material-catalog.mjs";

test("approved catalog has stable public prices", () => {
  assert.equal(products.filter((item) => item.brand === "Fujimae").length, 9);
  assert.equal(variants.find((item) => item.sku === "10000-2").price_cents, 3000);
  assert.equal(variants.find((item) => item.sku === "10000-3").price_cents, 3500);
  assert.equal(variants.find((item) => item.sku === "10010-3").price_cents, 4500);
  assert.equal(variants.find((item) => item.sku === "10070-7").price_cents, 8000);
});
```

- [ ] **Step 2: Run it and confirm the missing module failure**

Run: `node --test tests/catalog-seed.test.mjs`

Expected: FAIL with module not found.

- [ ] **Step 3: Download only approved white complete-gi images and convert to WebP**

Store one primary product image per approved Fujimae reference: `10000`, `10010`, `10021`, `10041`, `10050`, `10060`, `10070`, `10080`, `10081`. Do not include separate jackets, trousers, red gis, or the discontinued Training Lite.

- [ ] **Step 4: Implement the seed arrays and idempotent upsert**

Export `products` and `variants`; when run with website Supabase admin environment variables, upsert by supplier reference and SKU. Store cost, margin and final price separately. Mark the temporary ProWear discount inactive by default so stable price remains 95 EUR.

- [ ] **Step 5: Run seed tests and import the catalog**

Run: `node --test tests/catalog-seed.test.mjs`

Expected: PASS.

Run: `node scripts/seed-material-catalog.mjs`

Expected: nine active Fujimae products plus the 5 EUR white belt and all approved size variants.

- [ ] **Step 6: Commit website catalog assets**

```bash
git add assets/products/fujimae scripts/seed-material-catalog.mjs tests/catalog-seed.test.mjs
git commit -m "Seed Fujimae material catalog"
```

### Task 3: Extract testable website order domain logic

**Files:**
- Create: `[website]/merch-orders.js`
- Create: `[website]/tests/merch-orders.test.mjs`
- Modify: `[website]/index.html`

- [ ] **Step 1: Write failing tests for cart lines, totals and request payloads**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { addCartLine, cartTotalCents, buildOrderPayload } from "../merch-orders.js";

test("equal articles remain separate family lines", () => {
  let cart = [];
  cart = addCartLine(cart, { variantId: "v1", recipient: "Robert", quantity: 1, unitPriceCents: 4500 });
  cart = addCartLine(cart, { variantId: "v1", recipient: "Robert", quantity: 1, unitPriceCents: 4500 });
  assert.equal(cart.length, 2);
  assert.equal(cartTotalCents(cart), 9000);
});

test("payload never sends a trusted total", () => {
  const payload = buildOrderPayload({ name: "Aixa", email: "a@example.com", phone: "600000000" }, [{ variantId: "v1", recipient: "Iraia", quantity: 1 }], "key");
  assert.equal("total" in payload, false);
  assert.equal(payload.p_items.length, 1);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/merch-orders.test.mjs`

Expected: FAIL with module not found.

- [ ] **Step 3: Implement pure immutable helpers**

Implement `addCartLine`, `removeCartLine`, `cartTotalCents`, `validateOrderContact`, `buildOrderPayload`, and `campaignLabel`. The payload includes only variant ID, recipient and quantity; displayed prices are informational and Supabase recalculates them.

- [ ] **Step 4: Run tests and include the module before `app.js`**

Run: `node --test tests/merch-orders.test.mjs`

Expected: PASS.

Add `<script type="module" src="merch-orders.js?v=1"></script>` and update the `app.js` cache version.

- [ ] **Step 5: Commit domain logic**

```bash
git add merch-orders.js tests/merch-orders.test.mjs index.html
git commit -m "Add material order cart domain"
```

### Task 4: Replace the public ordering experience

**Files:**
- Modify: `[website]/app.js`
- Modify: `[website]/styles.css`
- Modify: `[website]/content.js`
- Modify: `[website]/index.html`

- [ ] **Step 1: Add a catalog loader with a visible error state**

Fetch active products and variants from Supabase. Render a retry action on failure and preserve the existing configured club clothing as a fallback only when Supabase is unavailable.

- [ ] **Step 2: Replace `merchSection` with category tabs and real product cards**

Use `Dogis`, `Cinturones`, `Ropa del club`, and `Otros`; split dogis into main and advanced choices. Cards show image, Fujimae attribution, reference, level, weight, description and size-guide action, but no price.

- [ ] **Step 3: Build the order drawer/form**

On `Añadir al pedido`, require recipient and size, show price inside the drawer, and append a distinct line. Require responsible name, email, phone and privacy consent; keep member ID and comments optional. Remove the customer-facing payment selector.

- [ ] **Step 4: Submit through `submit_skbc_merch_order`**

Generate and retain an idempotency UUID until success. On success clear the cart and show order number and campaign. On failure retain every field and line, show a non-destructive retry, and do not open WhatsApp automatically.

- [ ] **Step 5: Implement responsive visual states**

Add stable image aspect ratios, compact category tabs, accessible dialog focus, mobile sticky cart summary, empty/loading/error/success states, and the supplied size guide. Verify there are no nested cards or text overflows at 390 px and 1440 px.

- [ ] **Step 6: Run tests and browser smoke checks**

Run: `node --test tests/*.test.mjs`

Expected: all PASS.

Open the local site and verify product navigation, two recipients in one cart, totals, failed-submit preservation and successful order number.

- [ ] **Step 7: Commit public UI**

```bash
git add app.js styles.css content.js index.html
git commit -m "Build public material ordering flow"
```

### Task 5: Add a server-only website Supabase client to management

**Files:**
- Create: `src/lib/web-orders/client.ts`
- Create: `src/lib/web-orders/types.ts`
- Create: `src/lib/web-orders/pricing.ts`
- Create: `scripts/check-web-orders.mjs`
- Modify: `.env.example`

- [ ] **Step 1: Add environment contract and pure pricing checks**

Define `WEB_ORDERS_SUPABASE_URL` and `WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY`; never prefix either with `NEXT_PUBLIC_`. Implement `roundClubPrice(costCents) = Math.round((costCents + 500) / 500) * 500` and validate it against Basic, Training and Kata examples in `scripts/check-web-orders.mjs`.

- [ ] **Step 2: Run the check before implementation**

Run: `node scripts/check-web-orders.mjs`

Expected: FAIL because pricing module is missing.

- [ ] **Step 3: Implement the isolated client and shared types**

`createWebOrdersClient()` must use the two dedicated server environment variables with `persistSession: false` and `autoRefreshToken: false`. Add typed records for products, variants, campaigns, orders, items and communications.

- [ ] **Step 4: Run checks and typecheck**

Run: `node scripts/check-web-orders.mjs && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Configure the two private variables in Vercel and commit**

```bash
git add .env.example src/lib/web-orders scripts/check-web-orders.mjs
git commit -m "Add website order data client"
```

### Task 6: Build the management campaign and catalog service

**Files:**
- Create: `src/lib/web-orders/repository.ts`
- Create: `src/lib/web-orders/campaigns.ts`
- Create: `scripts/check-order-campaigns.mjs`

- [ ] **Step 1: Write failing campaign boundary checks**

Assert that 15 October belongs to `16 Sep - 15 Oct`, 16 October belongs to `16 Oct - 15 Nov`, and a campaign is only `pending_close` after its end date until an administrator closes it.

- [ ] **Step 2: Run and confirm failure**

Run: `node scripts/check-order-campaigns.mjs`

Expected: FAIL with missing campaign module.

- [ ] **Step 3: Implement repository queries and campaign calculations**

Provide focused functions: `getCurrentCampaign`, `listCampaignOrders`, `getSupplierSummary`, `listCatalog`, `upsertCatalogProduct`, `updateVariantPricing`, `assignPaymentMethod`, `closeCampaign`, and `advanceCampaignStatus`. Closing must use an RPC that locks the campaign and creates prepared communication rows in one transaction.

- [ ] **Step 4: Run checks and typecheck**

Run: `node scripts/check-order-campaigns.mjs && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit services**

```bash
git add src/lib/web-orders/repository.ts src/lib/web-orders/campaigns.ts scripts/check-order-campaigns.mjs
git commit -m "Add monthly order campaign service"
```

### Task 7: Extend the existing Pedidos page and actions

**Files:**
- Modify: `src/app/pedidos-cinturones/page.tsx`
- Create: `src/components/material-orders-dashboard.tsx`
- Create: `src/app/material-order-actions.ts`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add tabs without removing existing belt-order functionality**

Use tabs `Material mensual`, `Resumen proveedor`, `Cobros y comunicaciones`, `Catálogo`, `Histórico`, and retain existing belt workflow under `Cinturones internos` until migration is explicitly approved later.

- [ ] **Step 2: Render campaign summary and order detail**

Show period, days/status, order count, article count, public-price total and administrative alerts. The detail table is one row per article with payer, recipient, product, reference, size, quantity and price.

- [ ] **Step 3: Add supplier aggregation and CSV export**

Group only by supplier reference and size; keep family lines untouched. Export UTF-8 CSV columns `Referencia,Producto,Talla,Cantidad,Coste unitario,Coste total`.

- [ ] **Step 4: Add catalog and payment actions**

Server actions validate Zod payloads and call repository functions. Catalog edits expose cost, margin, final price, availability and promotion dates. Payment assignment supports `cash`, `bank`, and `paid`.

- [ ] **Step 5: Add guarded campaign close**

Show unresolved-data counts before enabling close. Require a browser confirmation that states order and communication counts. Closing prepares but never sends emails.

- [ ] **Step 6: Typecheck, build and visually verify**

Run: `npm run typecheck && npm run build`

Expected: both PASS. Verify desktop and mobile layouts, filters, totals and disabled states.

- [ ] **Step 7: Commit management UI**

```bash
git add src/app/pedidos-cinturones/page.tsx src/app/material-order-actions.ts src/components/material-orders-dashboard.tsx src/app/globals.css
git commit -m "Add monthly material order dashboard"
```

### Task 8: Generate and send reviewed family communications

**Files:**
- Modify: `src/lib/email-notifications.ts`
- Modify: `src/app/material-order-actions.ts`
- Create: `scripts/check-material-order-emails.mjs`

- [ ] **Step 1: Add privacy and line-separation checks**

Build two prepared orders with different emails and assert each generated message includes only its own payer/items. Assert two identical items remain two visible rows and that no `cc` or `bcc` field is produced.

- [ ] **Step 2: Run and confirm failure**

Run: `node scripts/check-material-order-emails.mjs`

Expected: FAIL until campaign communication builders are exported.

- [ ] **Step 3: Reuse the professional template for prepared campaign rows**

Build from frozen website order items, not hardcoded page data. Include logo, social links, separate item rows, total, assigned payment message and campaign reference. Test mode sends the combined preview only to the club; final mode loops over one payer at a time.

- [ ] **Step 4: Persist delivery outcome in the website Supabase**

Update each communication independently to `sent` or `failed`, with timestamp and concise error. A partial run must allow retrying only failed/unsent rows and must never resend rows already marked sent without an explicit forced resend confirmation.

- [ ] **Step 5: Run email checks, typecheck and build**

Run: `node scripts/check-material-order-emails.mjs && npm run typecheck && npm run build`

Expected: all PASS.

- [ ] **Step 6: Commit email integration**

```bash
git add src/lib/email-notifications.ts src/app/material-order-actions.ts scripts/check-material-order-emails.mjs
git commit -m "Send reviewed monthly order emails"
```

### Task 9: End-to-end migration, production deployment and verification

**Files:**
- Modify: `[website]/admin.js`
- Modify: `[website]/admin.css`
- Modify: `[website]/index.html`
- Modify: `docs/superpowers/specs/2026-09-28-public-material-orders-design.md` only if production discoveries require an agreed correction.

- [ ] **Step 1: Preserve existing orders and expose legacy status in the website admin**

Keep prior `skbc_merch_orders` rows readable. Label legacy JSON orders and new normalized orders distinctly; do not silently transform or delete historical rows.

- [ ] **Step 2: Run complete local verification**

Website: `node --test tests/*.test.mjs` and `node --check app.js && node --check admin.js`.

Management: `npm run typecheck && npm run build` plus all three `scripts/check-*orders*.mjs` checks.

- [ ] **Step 3: Exercise the full workflow with a controlled order**

Create one order containing Basic dogi, Training dogi and belt for two recipients. Verify separate family lines, correct total, monthly assignment, provider grouping, payment assignment, close preparation and private preview. Do not send a real family email during verification.

- [ ] **Step 4: Deploy the website and verify production**

Push the website repository, wait for GitHub Pages, then verify catalog images, no prices on cards, prices in form, size guide, mobile layout and successful controlled order submission.

- [ ] **Step 5: Deploy management and verify production**

Push management `main`, wait for Vercel Ready, and verify the controlled order appears in `https://skbc.vercel.app/pedidos-cinturones`, totals match, supplier summary is correct, and the prepared email contains no other payer data.

- [ ] **Step 6: Commit any cache-version-only production adjustment separately**

```bash
git add index.html
git commit -m "Refresh material ordering assets"
```

Do not report completion until both production URLs have been checked directly.
