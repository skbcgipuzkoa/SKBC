# Direct teacher approval in Próximos exámenes

User requests selecting multiple kenshis and approving their call without going through notifications, with an editable actual date instead of treating the configured date as fixed.

- Add native row checkboxes to the existing filtered candidate table, select/clear visible eligible candidates, selected count, actual exam date, and one explicit approval button. A single configured call scopes the selection; all-call views ask the teacher to choose one call. Impossible/noncandidate rows stay disabled.
- Reuse admin authentication, canonical roster validation, actual-date feasibility, immutable snapshots, expiry and per-student invitation approval. Ficha-only authorisation requires no email and never dispatches messages. Email invitations retain their address requirement.
- Replace unanswered drafts and approve the replacement in one SQL transaction. Any approval failure restores the previous approval and event. Answered or sent invitations cannot be silently replaced; the teacher edits the existing event from Exámenes. Approval reserves no student until they accept; grades, payment records and the four academic criteria remain untouched.
- Regression checks: auth, actual vs configured date, missing-email mode, no SMTP, invalid-date no mutation, row selection eligibility, unchanged public criteria. Synthetic SQL rollback verifies direct approval, replacement date, stale-date rollback and no academic/enrolment changes. Independent review, production build, schema before deploy, read-only production UI verification.
