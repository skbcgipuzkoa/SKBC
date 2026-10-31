# Exam points and early finish implementation plan

**Goal:** Add auditable raw point movements and early completion without counting unreached exercises as zero.

**Architecture:** A pure session metadata codec supports legacy score observations; server submission validates a completed prefix and stores unreached rows explicitly. Review calculates raw movements independently from technique overrides. Existing event mutation locks, teacher decisions and registration remain authoritative.

**Tech Stack:** Next.js, React, TypeScript, Supabase, existing PDF renderer.

- [x] Backend: failing calculation/validation regression, codec, submission validation, action parsers, review averages and signatures.
- [x] UI: pupil point ledger, reasons, early finish confirmation and reversible cutoff, disabled future controls, final summary.
- [x] Reports: admin and PDF expose movements, stopping point and unperformed items.
- [x] Verification: focused regressions, typecheck, build, code review, browser local interaction, publish via existing Git deployment and verify production (deployment verification pending).

Independent backend and UI files are assigned to existing agents; the root owns admin/PDF presentation and integration. Agents must preserve each other's edits.

