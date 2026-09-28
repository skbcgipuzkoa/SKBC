# Internal Exam Belt Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic internal order screen with an exam-belt workflow and automatically create one editable belt order for every approved exam.

**Architecture:** A focused belt-order service owns grade-to-color mapping and idempotent order creation. Every exam path already converges on `registerExam`, so that function will invoke the service after the exam exists. Server actions expose validated edit, delete, and status transitions, while the existing material dashboard keeps public web orders in separate tabs.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase PostgreSQL, server actions, Vercel.

---

### Task 1: Preserve Compatibility and Idempotence

**Files:**
- Create: `src/lib/exam-belt-orders.ts`

- [ ] Reuse the existing `exam_id` relation without adding required production columns.
- [ ] Check for an existing line before insertion so normal retries cannot duplicate an exam belt.
- [ ] Infer automatic origin from the existing exam relationship.
- [ ] Keep legacy non-belt records untouched.

### Task 2: Centralize Automatic Belt Creation

**Files:**
- Create: `src/lib/exam-belt-orders.ts`
- Modify: `src/lib/exams.ts`

- [ ] Implement normalized grade-to-color mapping for child and adult grades.
- [ ] Implement an idempotent upsert that stores `Cinturon`, the target grade, color, quantity one, and `Pendiente de indicar` as size.
- [ ] Invoke automatic belt creation after every successful `registerExam` call.
- [ ] Preserve the exam result if belt creation fails, while surfacing the failure to logs and the internal workflow.
- [ ] Run TypeScript checking.

### Task 3: Add Focused Belt Management Actions

**Files:**
- Modify: `src/app/actions.ts`

- [ ] Narrow manual creation to belts and derive color from the selected target grade when needed.
- [ ] Add an edit action for grade, color, size, quantity, notes, and status.
- [ ] Reject the transition to ready/order states while size remains pending.
- [ ] Add deletion with a snapshot in the existing trash system.
- [ ] Revalidate the belt page after every mutation.

### Task 4: Replace the Generic Internal Orders UI

**Files:**
- Modify: `src/app/pedidos-cinturones/page.tsx`
- Modify: `src/components/material-orders-dashboard.tsx`
- Modify: `src/app/globals.css`

- [ ] Rename the tab to `Cinturones de examen`.
- [ ] Query and display only belt lines while retaining old non-belt records in storage.
- [ ] Replace money and catalog metrics with pending-size, ready, ordered, received, and delivered counts.
- [ ] Add a compact manual exception form.
- [ ] Add search and status filters plus editable rows with exam context.
- [ ] Add clear pending-size emphasis and confirmation for deletion.
- [ ] Check responsive desktop and mobile layout.

### Task 5: Verify and Deploy Production

**Files:**
- Modify: `docs/superpowers/plans/2026-09-28-internal-exam-belt-orders.md`

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Inspect the final diff and repository status.
- [ ] Commit the implementation and push `HEAD:main`.
- [ ] Wait for the Vercel production deployment.
- [ ] Verify `https://skbc.vercel.app/pedidos-cinturones` and production assets without creating a real exam or belt order.
