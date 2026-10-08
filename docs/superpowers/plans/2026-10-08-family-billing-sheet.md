# Family Billing Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unlimited family units, automatic family fee calculation, one payment-sheet task per family, and an internal printable PDF that never stores bank or identity data.

**Architecture:** Supabase owns normalized family-unit, membership, and billing-task tables. A focused billing library derives active members, discounts, trial dates, and the latest joining member; server actions manage membership and task delivery, while an authenticated route renders the current PDF. Existing free-trial notices are replaced by family-level billing tasks without changing public ficha data.

**Tech Stack:** Next.js 15 App Router, React 19 server components/actions, TypeScript, Supabase/PostgreSQL RLS, pdf-lib, Vercel.

---

### Task 1: Persist family units and billing tasks

**Files:**
- Create: `supabase/migrations/20261008150000_family_units_and_billing_sheets.sql`

- [ ] Create `family_units`, `family_unit_members`, and `family_billing_sheet_tasks` with UUID keys, timestamps, unique membership per member, task status checks, JSONB snapshots, indexes, foreign keys, and enabled RLS without public policies.
- [ ] Add triggers that update `family_units.updated_at` when membership changes.
- [ ] Add a uniqueness rule preventing duplicate tasks for the same subject member and family composition signature.
- [ ] Validate the SQL locally by reviewing constraints and applying it to the management Supabase project.
- [ ] Commit the migration.

### Task 2: Implement deterministic family billing calculations

**Files:**
- Create: `src/lib/family-billing.ts`
- Create: `scripts/check-family-billing.mjs`
- Modify: `package.json`

- [ ] Define typed inputs and outputs for active family members, fee lines, discounts, newest member, free-trial dates, unified billing date, and composition signature.
- [ ] Implement base fees of 2500 cents for children and 3000 cents for adults.
- [ ] Implement discount `0` for one member, `500` for two, and `500 + (count - 2) * 1500` from three onward.
- [ ] Select the newest active member by free-trial start, then joined date, then stable member id.
- [ ] Reuse `freeTrialEndDate` and `resolveFreeTrialBillingDate` for the newest member.
- [ ] Add executable assertions for one member, mixed families, five members, inactive exclusion, date selection, and stable signatures.
- [ ] Run `npm run check:family-billing` and commit.

### Task 3: Add a family repository and server actions

**Files:**
- Create: `src/lib/family-units.ts`
- Modify: `src/app/actions.ts`

- [ ] Add repository functions to load a member's unit, list eligible active members, create a unit, add several members, remove one member, and load the current family billing context.
- [ ] Add validated internal server actions for create/join/add/remove operations.
- [ ] Prevent duplicate membership and cross-family assignment with friendly redirects.
- [ ] On composition changes, create or refresh the current billing task while retaining delivered historical tasks.
- [ ] Add a delivery action that records `delivered_at`, status, and snapshot idempotently for the entire family.
- [ ] Revalidate kenshi, avisos, sistema, and sidebar-dependent paths.
- [ ] Run typecheck and commit.

### Task 4: Manage the family from the internal kenshi profile

**Files:**
- Create: `src/components/family-unit-manager.tsx`
- Modify: `src/app/kenshis/[legacyId]/page.tsx`
- Modify: `src/app/globals.css`

- [ ] Load the current family context and all eligible active members on the internal profile.
- [ ] Render a compact `Unidad familiar` section with active members, class, status, base fee, family discount, total, and next unified charge.
- [ ] Provide a searchable multi-select for adding members and a clear create-unit path for ungrouped kenshis.
- [ ] Provide remove actions with confirmation and explain that membership changes create a new pending sheet.
- [ ] Make the layout responsive for desktop, iPad, and mobile without nested cards or horizontal overflow.
- [ ] Run typecheck and commit.

### Task 5: Generate the authenticated family billing PDF

**Files:**
- Create: `src/app/kenshis/[legacyId]/hoja-cobro/route.ts`
- Create: `src/lib/family-billing-pdf.ts`

- [ ] Require internal access and load a fresh family billing context from the requested kenshi.
- [ ] Render an A4 PDF with club identity, issue date, newest member, every active family member, trial dates, fee breakdown, discount, total, and unified first charge.
- [ ] Add blank fields for account holder identity, DNI, full IBAN, each student's DNI, and both signatures.
- [ ] Add the approved privacy text covering fees and student expenses.
- [ ] Ensure no bank, DNI, or signature values are accepted by the route or stored in snapshots.
- [ ] Mark the billing task as generated after successful PDF creation.
- [ ] Support inline display and explicit download headers.
- [ ] Render representative PDFs to PNG and visually verify spacing, line wrapping, page boundaries, and legibility.
- [ ] Commit.

### Task 6: Replace individual free-trial notices with family sheet tasks

**Files:**
- Modify: `src/app/avisos/page.tsx`
- Modify: `src/app/components/SidebarNav.tsx`
- Modify: `src/lib/telegram-notifications.ts`
- Modify: `src/app/actions.ts`

- [ ] Derive one current task per family or standalone member when the newest member's free month has ended.
- [ ] Show family members, newest incorporation, fee total, discount, and unified billing date once per family.
- [ ] Add `Generar hoja de cobro`, `Abrir familia`, and `Confirmar hoja entregada` actions.
- [ ] Keep the task active until delivery confirmation, then remove it from avisos, sidebar count, and Telegram.
- [ ] Backfill prior individual confirmations so completed notices do not reappear.
- [ ] Update Telegram wording to identify one family task and its included members.
- [ ] Run typecheck and commit.

### Task 7: Verify, migrate, and deploy production

**Files:**
- Modify only files needed to fix verification findings.

- [ ] Run `npm run check:family-billing`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and confirm a clean worktree after commits.
- [ ] Apply the migration to the real management Supabase project and verify the tables and constraints exist.
- [ ] Push the branch head to `main`.
- [ ] Wait for Vercel production status `Ready` and verify the `https://skbc.vercel.app` alias.
- [ ] Open the production kenshi profile and avisos page to confirm the family controls and payment-sheet flow are visible.
