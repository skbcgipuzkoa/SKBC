# Adult examiner grade assignment

**Goal:** In adult integrated events assign each examiner one or several target grades; each examiner receives the full syllabus and pupils of those grades, while the teacher reviews the whole event.

**Design:** Add an adult-only assignment form in event administration before any examiner submits. One form saves all examiner grade selections atomically under the existing event mutation lease. Validate nonempty examiner scopes, membership in event target grades, complete pupil-grade coverage, and no edits after submission. Existing events default every examiner to all grades. Several examiners may share grades; only assigned examiner scores contribute to a pupil. Registration and reports identify actual pupil examiners.

**Persistence:** A versioned event-notes settings envelope preserves legacy free text and stores scopes by examiner id without database migration. Scope filtering happens on the server for both internal evaluation and token links. Scope configuration is never exposed to the evaluator beyond their assigned grade list. Reject any submission for other pupils. Grade assignment must not invalidate existing official results; freeze after submission. Duplication must display a clear default or preserve settings by examiner name.

**Plan:**
- [ ] Pure assignment codec/validation/filter regressions before implementation.
- [ ] Backend scoped payloads, score checks, assignment mutation and actual-examiner registration/report filtering.
- [ ] Adult-only admin form, assigned-grade indicators, action auth and validation feedback.
- [ ] Group assigned adult screens by target grade with complete techniques, no empty activities.
- [ ] Code review, backend/SSR/registration/PDF regressions, typecheck/build, browser fixtures, deploy and verify production.

Backend and UI work delegated to existing agents with separate ownership. Root owns review, integration and deployment.
