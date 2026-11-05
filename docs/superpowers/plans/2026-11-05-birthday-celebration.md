# Birthday celebration in member fichas

User-approved visual requirements: large full-width ZORIONAK!!! birthday ribbon, gentle wind motion, opening confetti; avoid red/yellow palette. Use green, blue, white and violet. Implement the specified design without another approval round.

- Shared birthday helper validates date and compares month/day using Europe/Madrid, never server-local timezone. Exact birthday only, including February 29 on leap years. Missing, invalid or future birth dates produce no celebration.
- Shared accessible celebration component in adult/child student fichas and internal kenshi detail, near top inside main content. No new birthdate data disclosure, no age necessary.
- CSS ribbon with continuous gentle motion and a visible accessible pause/resume control. Confetti runs once per opening, short finite duration, pointer-events none, decorative aria-hidden and clipped to avoid overflow. Reduced-motion disables motion/confetti. No external dependency, audio, flashing or interaction blocking. Mobile and iPad landscape supported.
- Failing-first date tests with UTC/Madrid midnight boundary, leap dates, invalid/future dates. Render/component tests for exact copy and reduced-motion CSS; use a disposable local UI fixture with synthetic birthday data for browser proof rather than editing real member birthdates.
- Typecheck, build, independent code review, production deploy and visible proof. Never expose real birthdates in fixture or screenshots.

