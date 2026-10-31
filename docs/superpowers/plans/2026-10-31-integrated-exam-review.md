# Integrated Exam Review Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent modules below. Preserve other workers' edits.

**Goal:** Ship the approved evaluate, inspect, adjust, decide and register flow without altering the user's simulation results.

**Architecture:** Reuse the existing score and review tables. Store a validated versioned review envelope in review_notes (already text), including item adjustments and registration/document checkpoints; preserve original examiner scores. This replaces the proposed new adjustment table with a backwards-compatible use of existing storage, avoiding a production schema dependency. Pure review calculations are shared by the admin view and registration. Internal evaluation uses authenticated routes and explicit examiner assignments.

**Tech Stack:** Next.js 15, server actions, Supabase, TypeScript, existing pdf-lib reports.

## Task 1: Pure review model (parent)
- [ ] Add failing node tests for weighted averages, skipped items, adjustments, explicit decision, conflicting-result reason, stale source signatures, malformed/legacy JSON and registration readiness.
- [ ] Implement src/lib/integrated-exam-review.ts with strict parsing, scoring and validation.
- [ ] Run the regression script and share typed interfaces with backend/frontend workers.

## Task 2: Backend and actions
Files: src/lib/integrated-exams.ts, new src/app/examenes/review-actions.ts and targeted changes to src/app/actions.ts.
- [ ] Return reviews, notes and only valid submitted examiner scores; propagate read errors.
- [ ] Save validated adjustments and explicit decisions, preserving original notes and scores. Use source signatures so changed exams require reconfirmation without deleting reviews.
- [ ] Validate scores, relevance, lifecycle and complete submissions. Save examiner notes.
- [ ] Add own-examiner creation and authenticated internal submission/return flow.
- [ ] Require all student decisions, lock finalization with compare-and-swap and recoverable lease; store official exam IDs before generating documents. Reuse checkpoints on retries.
- [ ] Register approvals only. Store decisions for failures. Report document failures accurately and support document-only retry. Invalidate dependent paths after registration.
- [ ] Tests for permissions, decision persistence, duplicate submission and registration prerequisites.

## Task 3: UI
Files: src/app/examenes/IntegratedExamCreateForm.tsx, src/app/examenes/[eventId]/page.tsx, new internal evaluar route and shared evaluation component, src/app/examinar/[token]/page.tsx, isolated review CSS.
- [ ] Add default «Examino yo» and direct authenticated evaluation.
- [ ] Render per-student original scores, examiner notes, final item adjustments, percentage and explicit decision with conclusion.
- [ ] Show pending review/registered/failure states and clear next action.
- [ ] Block final registration until decisions are complete; show registered documents and retry errors without hiding failures.
- [ ] Preserve existing syllabus editor, shared examiner links and child cuts.

## Task 4: Reports
File: src/lib/integrated-exam-documents.ts and small standalone report helper if needed.
- [ ] Use reviewed effective scores, conclusion, final pass/fail and original notes in PDF.
- [ ] Support reports for failures saved in review metadata without creating an official passing exam or diploma.
- [ ] Return report URL to registration service; only approvals receive diploma.

## Task 5: Review, tests and production
- [ ] Typecheck, full build, relevant existing child-program checks and new review regressions.
- [ ] Independent code/security review and fix findings.
- [ ] Inspect production simulation read-only; verify UI without submitting official decisions or registering results.
- [ ] Publish isolated commit to main, await Vercel Production success and verify live UI. Leave simulation unregistered for user testing.
