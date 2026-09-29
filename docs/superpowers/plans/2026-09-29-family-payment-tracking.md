# Family Payment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the latest communicated material campaign into one payment record per family and provide persistent cash/bank follow-up for every campaign.

**Architecture:** The website Supabase owns a new RLS-protected tracking table keyed by campaign and normalized family identity. Management code derives family snapshots from frozen communications, creates missing tracking rows without overwriting manual states, and exposes internal-only server actions and a campaign-aware payment dashboard.

**Tech Stack:** PostgreSQL/Supabase, Next.js 15 server actions, React 19, TypeScript, Vercel.

---

### Task 1: Add Web Database Payment Tracking

**Files:**
- Create: `supabase/20260929100000_family_payment_tracking.sql` in the website repository.

- [ ] Create `skbc_order_family_payments` with campaign, family key, frozen family summary, amount, intended method, status, status date, notes, and timestamps.
- [ ] Add unique campaign/family constraint, status checks, indexes, foreign key, RLS, and no public write policy.
- [ ] Apply the SQL to website Supabase project `wucxazuhrgokvtajqmsr`.
- [ ] Verify the table and constraints in production.

### Task 2: Recover Families from Existing Communications

**Files:**
- Modify: `src/lib/web-orders/types.ts`
- Modify: `src/lib/web-orders/repository.ts`
- Modify: `src/app/pedidos-cinturones/page.tsx`

- [ ] Parse each frozen communication snapshot into one family payment seed.
- [ ] Fall back to grouping campaign orders by normalized email when a communication is unavailable.
- [ ] Upsert only missing family rows so manual payment states are never overwritten.
- [ ] Load tracking for the selected campaign, including the latest already emailed campaign.

### Task 3: Add Internal Payment Mutations

**Files:**
- Modify: `src/app/material-order-actions.ts`

- [ ] Validate campaign, payment row, status, and notes with Zod.
- [ ] Allow transitions to `pending`, `cash_paid`, and `bank_submitted` after campaign closure.
- [ ] Set or clear status date consistently.
- [ ] Revalidate and return to the selected campaign payment tab.

### Task 4: Build the Family Payment Dashboard

**Files:**
- Modify: `src/components/material-orders-dashboard.tsx`
- Modify: `src/app/globals.css`

- [ ] Add totals for campaign amount, cash pending, cash received, and bank submitted.
- [ ] Render one row per family with recipients/items and real total.
- [ ] Add status filtering, direct state controls, date, and notes.
- [ ] Keep payment controls editable for closed campaigns without changing communications.
- [ ] Preserve existing pre-close payment-method assignment separately.

### Task 5: Verify and Deploy

**Files:**
- Modify: this plan as tasks complete.

- [ ] Run typecheck and production build.
- [ ] Commit and push the website SQL record and management implementation.
- [ ] Wait for Vercel production deployment.
- [ ] Verify the latest campaign displays all recovered families and totals without changing any payment state.
