# First exam six-month eligibility

> **For agentic workers:** Use subagent-driven-development and independent code review.

**Goal:** First exam eligibility starts six calendar months after joining; subsequent exams retain existing grade requirements from last exam.

**Architecture:** Shared pure timing policy consumed by status calculation and adult-plan proximity. Existing recorded last_exam_on denotes prior exam; missing dates never infer eligibility. First six-month minimum is not reduced by course bonuses. Attendance, technical readiness, activity and official exam calls still apply. No grade/history writes.

- [ ] Failing-first tests for first adult/kid six months, post-exam kyu/dan configured periods, bonus floor, missing dates and month-end boundaries.
- [ ] Apply shared policy in member-exam-status and adult-plan. Explain first-exam timing in generated notices and upcoming-exam rules.
- [ ] Verify status integration, existing readiness/priority/candidate fixtures, typecheck/build, independent review.
- [ ] Publish; recalculate computed statuses through authorized existing internal action; inspect candidates and six-month notice. Preserve academic records and grades.
