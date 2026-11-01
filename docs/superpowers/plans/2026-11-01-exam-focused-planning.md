# Exam-focused adult planning and visual progress implementation plan

> **For agentic workers:** Use subagent-driven-development with separate backend/UI ownership and independent review.

**Goal:** Prioritize adult class proposals that reduce individual exam curriculum deficits, explain projected benefits in the plan, and visually separate techniques and kata in pupil progress.

**Architecture:** Add pure projected-benefit evaluation to the existing generator. Use the same curriculum classification and required repetitions as exam readiness. Preserve forced selection, Goho/Juho balance, kata/review variety and manual control. Persist generation-time explanations in plan focus without migration; never mark practice completed or eligibility automatically. Separate profile progress displays by content type with text plus accessible color, preserving underlying counters.

- [ ] Backend: failing-first fixtures for individual deficits/shared benefit/candidate near readiness/combined chosen techniques/repetition thresholds/manualforce and balance/absence or no history/kata special-review/future history excluded.
- [ ] Implement pure scoring and batched paginated context loading; current class attendees when known, otherwise eligible active adult group with explicit projection caveat. Use actual target grade; avoid promotion prediction from working in another group. Exclude instructor from projected pupil benefits.
- [ ] Explain per-technique contribution and cumulative selected-plan closure, named pupils and remaining requirements; no claim actual aptness or automatic grade change. Existing plans remain readable and unchanged.
- [ ] UI: visible plan benefit notices in internal class plan and relevant alternate instructor plan views; reuse generation-time explanation. Public delegate data must not expose unrelated pupil details.
- [ ] Profile: group techniques and kata in separate labeled/color sections within Progreso tecnico; distinguish other special content; preserve technical readiness and counts. Responsive and color-independent labels.
- [ ] Run meaningful regression fixtures, typecheck/build and independent code review.
- [ ] Commit/publish via Git; validate live read-only views and screenshots without generating or completing real class plans or modifying pupil history.
