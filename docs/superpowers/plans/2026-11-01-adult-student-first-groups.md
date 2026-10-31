# Adult exams: pupils first, grade groups and personal access

User approved selecting pupils first, automatic target-grade grouping, independent grade access and one personal multi-grade link per examiner.

- Adult creation starts with controlled pupil selection and a live target-grade preview. Examiner names are no longer required during adult creation. Existing child flow remains available.
- New adult events create one pending examiner assignment per represented target grade with single-grade scope. Admin shows cards of pupils and per-grade links. Pending examiner must identify before submitting marks.
- Assignment editing before any marks arrive supports naming pending assignments and combining equal examiner names into one multi-grade assignment. One additional examiner may be added per save. Shared grades stay possible with distinct examiner identities.
- Grade-specific links use the personal access token plus a validated grade parameter. Server returns only that grade's pupils and syllabus. Personal base link covers remaining assigned grade groups.
- Grade-specific submission persists that complete grade route, including unreached markers after an early stop. The examiner is globally submitted only when all their assigned grade groups are complete. Review includes complete grade submissions for the appropriate pupils and excludes incomplete or unrelated assignments.
- Existing adult exams default to existing assignments. No migration; versioned assignment settings preserve pupil-group mode/pending identities. All scope/name mutations use the existing event lock and freeze after any scores have been submitted.
- Validation: grouping/creation regression, scoped grade links, separate grade completion and retry protection, averages/bonus consistency, group UI, name attribution, auth and cross-grade rejection, build/typecheck/reviewer, browser fixture, production deployment.

Backend and UI ownership split between existing agents; root integrates, reviews and publishes.
