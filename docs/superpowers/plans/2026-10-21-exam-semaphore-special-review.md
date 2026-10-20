# Exam Semaphore Special Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate fundamental Goho/Juho requirements from teacher-reviewed Umpo Ho, kata and ukemi blocks in the exam semaphore.

**Architecture:** Add a pure curriculum classifier and evaluator, then make `member-exam-status.ts` consume its structured result. Fundamental gaps remain blocking; special review gaps produce yellow once time, attendance and fundamentals pass. Existing history remains the source of proof that a special block was reviewed.

**Tech Stack:** TypeScript, Next.js 15, Supabase, Node assertion checks.

---

### Task 1: Curriculum classifier

**Files:**
- Create: `src/lib/exam-technical-readiness.ts`
- Create: `scripts/check-exam-technical-readiness.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing checks**

Add checks proving that Goho/Juho are fundamental, `umpo_ho`, `KATA_TANEN`, `KATA_SOTAI` and `UKEMI` are special review blocks, and one recorded practice completes a special block.

- [ ] **Step 2: Run the checks and confirm failure**

Run `npm run check:exam-technical-readiness`. Expected: failure because the readiness module does not exist.

- [ ] **Step 3: Implement the pure evaluator**

Export a classifier and an evaluator returning fundamental missing counts plus the names of special review blocks that have never been recorded.

- [ ] **Step 4: Run the checks**

Run `npm run check:exam-technical-readiness`. Expected: all assertions pass.

### Task 2: Integrate semaphore calculation

**Files:**
- Modify: `src/lib/member-exam-status.ts`

- [ ] **Step 1: Load curriculum metadata**

Select `category` and `content_type` together with technique id and name.

- [ ] **Step 2: Replace the flat repetition calculation**

Use the evaluator so only fundamental gaps set `technicalStatus.ok` to false. Carry special review names separately.

- [ ] **Step 3: Apply semaphore priority**

Keep blue first. After time and attendance checks, use red for fundamental gaps, yellow for special review gaps, then preserve grey/reactivation and green behavior.

- [ ] **Step 4: Update notices**

Show special review recommendations in blue as secondary information and in yellow as the main action: schedule one or more review classes.

### Task 3: Verify and publish

**Files:**
- Modify: `docs/superpowers/plans/2026-10-21-exam-semaphore-special-review.md`

- [ ] **Step 1: Run automated verification**

Run `npm run check:exam-technical-readiness`, `npm run typecheck`, `npm run build`, and `git diff --check`.

- [ ] **Step 2: Commit and deploy production**

Commit the code, push `HEAD:main`, and deploy with Vercel production scope.

- [ ] **Step 3: Recalculate production semaphores**

Use the existing authenticated recalculation action so all active members receive the new statuses.

- [ ] **Step 4: Inspect Maider and Uxue**

Confirm their notices distinguish fundamental techniques from special review blocks and that no special block is counted as needing two repetitions.
