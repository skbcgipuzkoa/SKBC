# Adult examiner link management

User requests create/delete/renew examiner links, multiple examiners sharing a target grade, and averaging all evaluations before the teacher's final decision. Children's examinations remain unchanged.

- Expand existing adult group editor to add multiple examiner rows in one save, select one or more target grades, and remove assignments before evaluation. Empty new names create distinct pending identities, identified at first opening.
- Keep existing same-person grouping; distinct examiners may share any grade. All target grades remain covered. Changing judges or scopes after evaluation remains blocked.
- Add authenticated per-examiner 'Eliminar enlace' and 'Generar enlace nuevo'. Disabling invalidates the old credential but preserves examiner identity, scores, submission and grade assignments. Renewing keeps the same identity and evaluations with a fresh token. Never delete score rows.
- Represent a disabled credential as a random token in a reserved disabled namespace, rejected by public lookup and never displayed as a link. This avoids changing evaluation participation through revoked_at. Detach a renewed/disabled migrated examiner from its source alias so an older parent link cannot recover the replacement credential. No schema migration or GET writes.
- Reuse the existing event mutation lease and token CAS; no identity/grade permission expansion. Management only for open adult/dan events; old forms cannot submit after rotation. Tests must cover stale tokens, alias invalidation, score/identity preservation, auth, multi-row same-grade creation and real averaged results with final teacher review.
- Review UI on small screens through existing responsive layout patterns, run backend/SSR tests and build, then deploy.
