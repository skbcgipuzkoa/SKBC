# Class Correction Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent guided correction mode for closed single and combined classes without duplicating attendance, histories, rankings, or technique metrics.

**Architecture:** Store correction mode in the existing `classes.status` field while preserving `closed=true`. Server actions transition the whole original day into and out of correction mode; the class page renders a correction menu and reuses the existing attendance and technical editors. Existing idempotent rebuild functions remain the source of truth for derived data.

**Tech Stack:** Next.js 15 App Router, React 19 server components/actions, TypeScript, Supabase, Vercel.

---

### Task 1: Correction lifecycle actions

**Files:**
- Modify: `src/app/actions.ts`

- [ ] Add `reopenClassForCorrectionAction` that finds all related kids/adult class rows for the day and changes only `status` to `correction`.
- [ ] Add `finishClassCorrectionAction` that rebuilds each affected class from its current source data and restores `status=completed` with `closed=true`.
- [ ] Keep adult classes internally closed so `closeAdultClass` clears and regenerates class-derived history without incrementing technique metrics.
- [ ] Recalculate child syllabus history, rankings, and exam status from source rows.

### Task 2: Guided correction interface

**Files:**
- Modify: `src/app/clases/[legacyId]/page.tsx`
- Modify: `src/app/globals.css`

- [ ] Detect `status=correction` for either class in the same day.
- [ ] Show `Reabrir para corregir` on an ordinary closed class.
- [ ] Show a persistent correction banner and links for applicable kids/adults attendance and technical sections.
- [ ] Reveal the existing editors while correction mode is active.
- [ ] Add `Guardar cambios y cerrar todo` using the final correction action.

### Task 3: Verification and production

**Files:**
- Verify: `src/app/actions.ts`
- Verify: `src/app/clases/[legacyId]/page.tsx`
- Verify: `src/app/globals.css`

- [ ] Run `npm.cmd run typecheck` and expect exit code 0.
- [ ] Run `npm.cmd run build` and expect exit code 0.
- [ ] Inspect the staged diff to ensure unrelated dirty-worktree changes are not included.
- [ ] Commit only the correction-mode hunks and push `main` to trigger production deployment.
- [ ] Wait for Vercel status `Ready` and verify `https://skbc.vercel.app` serves the new correction selectors.
