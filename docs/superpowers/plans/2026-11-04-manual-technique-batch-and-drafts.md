# Preserve plan selection and batch manual techniques

> **For agentic workers:** Use subagent-driven-development with separate server/client ownership and independent review.

**Goal:** Adding/removing manual extras preserves every unsaved regular-plan checkbox across grade groups, supports multiple extras per save, and explicit regular-plan saves preserve completed manual extras.

**Architecture:** A shared class-scoped client draft wrapper restores exact checked/unchecked regular plan IDs after reload/redirect, keeping new server rows at their defaults. Clear a draft only after an acknowledged successful regular-plan save, not on submit/error. Draft is tab-local and does not generate member practice/history. Backend batch action validates all techniques and scopes before one insert, supports legacy single selection, prevents duplicate technique/group extras. Main save touches regular proposals only; manual extras remain done until explicitly removed.

- [ ] Client failing-first tests for multiple grades, checked/unchecked restoration, newly inserted IDs, add/remove reload, save success/error, class isolation and unavailable storage.
- [ ] Multi-select search/picker with removable selections that survive filtering, selected count and one add button; repeated techniqueIds fields and max batch limit.
- [ ] Backend failing-first fixtures for batch cross-product scopes, validation before writes, missing/inactive techniques, foreign groups, duplicates/retries, class boundaries, preserving manual completion on normal save.
- [ ] Validate existing delegated flow; typecheck/build, independent review.
- [ ] Exercise real client interactions with isolated/local fixtures rather than inserting test techniques into live academic classes; deploy and inspect live UI without saving real class changes.
