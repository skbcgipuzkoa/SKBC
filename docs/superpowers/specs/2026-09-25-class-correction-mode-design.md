# Class Correction Mode Design

## Goal

Allow an administrator to reopen a previously closed class, correct attendance or technical work, and close the original class again without duplicating any derived result.

## User Flow

- A closed class shows a `Reabrir para corregir` action.
- Reopening preserves the original class structure, including combined kids and adults classes.
- The class enters a persistent `correction` status while its `closed` flag remains true internally.
- A correction menu offers the sections that exist for that class: kids attendance, adult attendance, kids technical work, and adult technical work.
- Existing data remains visible and editable. Nothing is reset when correction mode starts.
- The administrator can visit several correction sections before choosing `Guardar cambios y cerrar todo`.
- Completing the correction restores every affected class to `completed` and leaves the day closed.

## Data Integrity

The correction state must not turn `closed` to false. Adult closing already treats a closed class as a rebuild: it deletes system-generated assignments and technical history for that class, then regenerates them from the final attendance and plan. Child syllabus history is likewise deleted by class and regenerated.

Attendance uses a deterministic legacy identifier per class and member, so adding an existing attendee is an upsert rather than a duplicate. Exam status and child rankings are recalculated from source rows. Technique repetition counters are not incremented during correction because the adult class remains internally closed throughout the process.

## Combined Classes

Starting correction from either half of a combined day marks both the kids and adult class rows as `correction`. The correction menu links to the relevant existing panels. Final closure processes both rows and returns the administrator to the adult class when available.

## Error Handling

- Reopen and final-close actions require internal access.
- Invalid class IDs redirect to the class list or show the existing class error state.
- If rebuilding either half fails, the page reports a close error and retains correction mode so the administrator can retry.
- No destructive cleanup is performed when merely entering correction mode.

## Verification

- TypeScript typecheck and production build must pass.
- Confirm that correction mode remains visible after navigation and reload.
- Confirm that a combined day exposes all four applicable correction destinations.
- Confirm source code keeps closed classes closed during correction and adult rebuilds skip metric increments.
- Deploy to Vercel production and verify the production alias serves the new correction UI assets.
