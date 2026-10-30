# Class Free Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Dojo and full-class editing from a forced wizard into a freely navigable workspace where every section can be saved repeatedly and closing remains an explicit final action.

**Architecture:** Extend the existing client-side `ClassSectionNav` into a shared contextual action bar that owns previous/next navigation, dirty-form protection, and explicit save submission. Keep all persistence in the existing server actions and change each form's `returnTo` so a normal save reloads the current section from the database. Reuse the same navigation model in correction mode and retain the existing closure progress flow.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, server actions, CSS, Node static regression checks.

---

### Task 1: Shared contextual class actions

**Files:**
- Modify: `src/components/class-section-nav.tsx`
- Modify: `src/app/globals.css`
- Create: `scripts/check-class-free-editing.mjs`

- [ ] **Step 1: Write the failing structural check**

Create a Node check that asserts the shared component renders previous, save, next, and close controls; uses `requestSubmit()` for the active dirty form; and exposes a mobile-safe contextual action bar.

- [ ] **Step 2: Run the check and verify it fails**

Run: `node scripts/check-class-free-editing.mjs`
Expected: FAIL because the contextual action controls are not present.

- [ ] **Step 3: Implement the shared action bar**

Derive previous and next links from `links`, find the form associated with the current section, submit it without changing its normal `returnTo`, and route close through the existing dirty-form confirmation. Keep top tabs clickable and retain the existing multi-form warning behavior.

- [ ] **Step 4: Add responsive styles**

Place the action bar below tabs on desktop/iPad and make it a fixed bottom toolbar on narrow mobile screens with safe-area padding and no overlap with page content.

- [ ] **Step 5: Run the structural check**

Run: `node scripts/check-class-free-editing.mjs`
Expected: PASS.

### Task 2: Dojo saves stay in place

**Files:**
- Modify: `src/app/dojo/[legacyId]/page.tsx`
- Test: `scripts/check-class-free-editing.mjs`

- [ ] **Step 1: Extend the failing check for Dojo return routes and labels**

Assert child attendance, adult plan, and adult attendance save to their current sections and no primary submit label says it will advance automatically.

- [ ] **Step 2: Run the check and verify it fails**

Run: `node scripts/check-class-free-editing.mjs`
Expected: FAIL on forced `step=adults` or `step=close` return routes.

- [ ] **Step 3: Update Dojo form behavior**

Change normal saves to return to the same section with a saved message. Rename buttons to direct commands such as `Guardar asistencia` and `Guardar tecnicas`. Leave navigation to the shared action bar and preserve the existing explicit close form.

- [ ] **Step 4: Run the check**

Run: `node scripts/check-class-free-editing.mjs`
Expected: PASS for Dojo assertions.

### Task 3: Full class and correction use the same workspace

**Files:**
- Modify: `src/app/clases/[legacyId]/page.tsx`
- Modify: `src/components/class-section-nav.tsx`
- Test: `scripts/check-class-free-editing.mjs`

- [ ] **Step 1: Extend the failing check for full-class and correction behavior**

Assert the adult technical save returns to the technical section, correction mode renders the shared navigation, and the correction links provide the same ordered section model.

- [ ] **Step 2: Run the check and verify it fails**

Run: `node scripts/check-class-free-editing.mjs`
Expected: FAIL because correction currently replaces the shared navigation and normal technical save advances to attendance.

- [ ] **Step 3: Update full-class save routes and copy**

Keep technical and attendance saves in their current sections, remove forced-wizard wording, and render shared navigation in correction mode with an `En correccion` state while preserving the existing correction close action.

- [ ] **Step 4: Run the check**

Run: `node scripts/check-class-free-editing.mjs`
Expected: PASS for full-class and correction assertions.

### Task 4: Verification and responsive regression

**Files:**
- Modify if needed: `src/app/globals.css`

- [ ] **Step 1: Run focused checks**

Run: `node scripts/check-class-free-editing.mjs`
Expected: PASS.

- [ ] **Step 2: Run project validation**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: successful Next.js production build.

- [ ] **Step 3: Inspect responsive layouts in the browser**

Verify at 390x844, 768x1024, 820x1180, and 1440x900 that tabs remain usable, the action bar does not cover inputs or closure controls, and dirty-change dialogs fit without horizontal overflow.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/components/class-section-nav.tsx src/app/dojo/[legacyId]/page.tsx src/app/clases/[legacyId]/page.tsx src/app/globals.css scripts/check-class-free-editing.mjs
git commit -m "feat: enable free class editing flow"
```
