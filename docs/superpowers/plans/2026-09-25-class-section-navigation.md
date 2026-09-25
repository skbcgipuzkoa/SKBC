# Class Section Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add guarded direct navigation across every major section of a class in Dojo and complete-class views.

**Architecture:** A shared client component renders navigation links and owns dirty-form detection plus the save/discard/cancel dialog. Each server page supplies destinations and completion state using its existing class data and routes.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, server actions, CSS.

---

### Task 1: Shared guarded navigator

**Files:**
- Create: `src/components/class-section-nav.tsx`
- Modify: `src/app/globals.css`

- [ ] Render available sections, current state, and completion state.
- [ ] Track changed forms with supported `returnTo` fields.
- [ ] Offer save-and-continue, discard, and cancel for one dirty form.
- [ ] Block unsafe navigation when several forms contain unsaved changes.
- [ ] Add a browser refresh/close warning.

### Task 2: Dojo integration

**Files:**
- Modify: `src/app/dojo/[legacyId]/page.tsx`

- [ ] Replace the visual-only stepper with guarded links.
- [ ] Add a direct child-technical destination that opens the child plan.
- [ ] Preserve the explicit final close action.

### Task 3: Complete-class integration

**Files:**
- Modify: `src/app/clases/[legacyId]/page.tsx`

- [ ] Add the same navigator near the top of the class workspace.
- [ ] Map links to existing sections and anchors without resetting class data.
- [ ] Keep correction mode navigation unchanged and avoid duplicate controls.

### Task 4: Verify and deploy

**Files:**
- Verify all modified files.

- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run build`.
- [ ] Stage only feature-specific hunks from dirty files.
- [ ] Commit, push `main`, wait for Vercel `Ready`, and verify production assets.
