# Operational Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver provisional students, internal member notes, operational alerts, and an idempotent Monday summary in the admin panel and Telegram.

**Architecture:** Add normalized Supabase tables and focused domain modules, then expose them through existing server actions and admin pages. Extend the current alert and Telegram infrastructure, preserving existing attendance and progression calculations by keeping provisional attendance outside `attendance_logs` until conversion.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase/PostgreSQL, Vercel Cron, existing Telegram Bot integration.

---

### Task 1: Persistence and access rules

**Files:**
- Create: `supabase/migrations/20260925120000_operational_follow_up.sql`

- [ ] Create `provisional_members`, `provisional_attendance`, `member_notes`, `weekly_summaries`, and `notification_deliveries` with UUID primary keys, timestamps, foreign keys, check constraints, admin RLS policies, and unique keys `(class_id, provisional_member_id)` and `(delivery_key, channel)`.
- [ ] Add indexes for unresolved important notes, pending provisional members, attendance dates, weekly periods, and failed deliveries.
- [ ] Apply the migration to the linked production project with `npx supabase db push` and verify each table through a read-only query.
- [ ] Commit only the migration with `git commit -m "Add operational follow-up data model"`.

### Task 2: Pure domain rules and tests

**Files:**
- Create: `src/lib/operational-follow-up.ts`
- Create: `src/lib/operational-follow-up.test.ts`

- [ ] Add failing Node tests for 21-day kids and 30-day adult absence thresholds, recent joins, stable alert keys, previous Monday-Sunday period in `Europe/Madrid`, and duplicate attendance conversion.
- [ ] Run `node --test --experimental-strip-types src/lib/operational-follow-up.test.ts` and confirm failures.
- [ ] Implement exported pure functions `previousWeekPeriod`, `absenceThresholdDays`, `isRelevantAbsence`, `operationalAlertKey`, and `dedupeConvertedAttendance`.
- [ ] Re-run the focused tests and commit with `git commit -m "Add operational follow-up rules"`.

### Task 3: Provisional student service and attendance actions

**Files:**
- Create: `src/lib/provisional-members.ts`
- Modify: `src/app/actions.ts`
- Modify: `src/app/dojo/[legacyId]/page.tsx`
- Modify: `src/app/clases/[legacyId]/page.tsx`

- [ ] Implement service functions to list, create, attend, remove attendance, and convert provisional students using the admin Supabase client.
- [ ] During conversion, query existing member attendance, insert only missing class rows into `attendance_logs`, preserve dates and class IDs, then mark the provisional as converted with `converted_member_id` and `converted_at`.
- [ ] Add server actions with normalized name/group validation, internal-access checks, revalidation, and redirects that preserve the current class step.
- [ ] Add compact `Anadir invitado` controls and provisional attendance rows to both Dojo and complete-class attendance views; wire them into the existing unsaved-change guard.
- [ ] Confirm provisional rows never enter adult close, child syllabus history, exam status, rankings, or billing calculations before conversion.
- [ ] Run focused tests, `npm run typecheck`, and commit with `git commit -m "Add provisional class attendees"`.

### Task 4: Provisional management and conversion UI

**Files:**
- Create: `src/app/provisionales/page.tsx`
- Modify: `src/app/components/SidebarNav.tsx`
- Modify: `src/app/kenshis/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/app/globals.css`

- [ ] Build an admin list grouped into pending and converted provisional students, showing group, first/last attendance, and number of classes.
- [ ] Add a conversion form that can select an existing kenshi or continue to the existing new-kenshi flow with the provisional identity carried safely in query parameters.
- [ ] Show a pending-provisional count and navigation entry from Kenshis without changing its existing filters.
- [ ] Add responsive styles using the current cards, tags, controls, and table patterns.
- [ ] Verify conversion with zero, one, and duplicate existing attendances; run typecheck and commit with `git commit -m "Add provisional student management"`.

### Task 5: Internal member notes

**Files:**
- Create: `src/components/member-notes.tsx`
- Create: `src/lib/member-notes.ts`
- Modify: `src/app/kenshis/[legacyId]/page.tsx`
- Modify: `src/app/actions.ts`
- Modify: `src/app/globals.css`

- [ ] Implement note queries and actions for create, toggle importance, and resolve, always retaining the row and author/timestamps.
- [ ] Render the chronological admin-only note history on the editable kenshi page, with compact important and resolved states.
- [ ] Ensure no notes query or component is imported by public ficha or family-report routes.
- [ ] Test validation and state transitions, run typecheck, and commit with `git commit -m "Add internal kenshi notes"`.

### Task 6: Operational alert engine and panel

**Files:**
- Create: `src/lib/operational-alerts.ts`
- Modify: `src/app/alertas/page.tsx`
- Modify: `src/app/globals.css`

- [ ] Move current alert construction into a reusable engine and add correction classes, pending provisionals, relevant absences excluding recent joins/calendar closures, expiring trials, open important notes, and incomplete active records.
- [ ] Keep stable keys compatible with `admin_alert_dismissals`; include alert type and priority metadata.
- [ ] Add type and priority filters to `/alertas` while retaining bulk and individual dismissal actions.
- [ ] Add tests for alert deduplication and absence exclusions, then run tests/typecheck and commit with `git commit -m "Expand operational alerts"`.

### Task 7: Weekly summary and Telegram delivery

**Files:**
- Create: `src/lib/weekly-summary.ts`
- Modify: `src/lib/telegram-notifications.ts`
- Create: `src/app/api/cron/telegram/weekly-summary/route.ts`
- Modify: `vercel.json`

- [ ] Aggregate the previous natural week: classes by state, attendance by group, unique attendees, new members, provisionals, relevant absences, important notes, and pending alert totals.
- [ ] Upsert one `weekly_summaries` row per period and render a concise panel payload plus escaped Telegram HTML.
- [ ] Protect the cron route with the existing `CRON_SECRET` convention; insert a pending delivery, send once, and update it to sent or failed without deleting the summary.
- [ ] Add Vercel schedule `0 6 * * 1`, equivalent to 08:00 Madrid during summer time; make runtime logic gate delivery to local Monday 08:00 so timezone changes do not duplicate sends.
- [ ] Test period boundaries, idempotent retries, and Telegram escaping; run focused tests/typecheck and commit with `git commit -m "Add weekly operational summary"`.

### Task 8: Summary panel and final integration

**Files:**
- Create: `src/app/resumen-semanal/page.tsx`
- Modify: `src/app/components/SidebarNav.tsx`
- Modify: `src/app/alertas/page.tsx`
- Modify: `src/app/globals.css`

- [ ] Show the latest weekly summary, delivery status, period totals, pending work, and historical summaries.
- [ ] Link the summary from the sidebar and alert dashboard and expose a protected manual retry action for failed Telegram deliveries.
- [ ] Verify desktop and mobile layouts, empty states, loading-independent server rendering, and no overlap.
- [ ] Run all focused tests, `npm run typecheck`, and `npm run build`; commit with `git commit -m "Add weekly summary dashboard"`.

### Task 9: Production release and verification

**Files:**
- Modify only if required by release findings.

- [ ] Review `git diff` and stage only feature-owned hunks, preserving unrelated user changes.
- [ ] Push `main`, deploy with the repository's Vercel production workflow, and wait for `Ready`.
- [ ] Verify `https://skbc.vercel.app` returns 200 and that authenticated pages load with the new production schema.
- [ ] Create a disposable provisional attendee in production, record attendance, convert it to a test kenshi or remove the disposable data safely, and confirm no duplicate `attendance_logs` rows.
- [ ] Create and resolve a disposable important note, run the weekly-summary endpoint in idempotent test/retry mode, and verify one panel summary and at most one Telegram delivery record.
- [ ] Report the production URL, migration status, tests, build, deployment identifier, and any residual limitation.
