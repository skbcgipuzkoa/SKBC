# Monthly exam calls, followed by explicit date confirmation

User approved monthly invitations with no fixed day, early registration in the ficha, and prominent access from Próximos exámenes.

- Display configured calls as month/year in planning, forecasts, Telegram and nonapproved fichas. Keep the existing configured date as a stable internal key, never as a promised exam day. Current-month calls remain available even after that reference day.
- Monthly forecasts use the final day of the month as an explicit planning boundary. Map forecast results back to the configured call key. A confirmed actual-date override always uses the exact day and never gets monthly leeway.
- Approve selected students with an optional actual date. When omitted, persist a pending-day flag; the internal month-end boundary is not displayed as an actual date. The four academic indicators stay unchanged. Monthly approval enables voluntary accept/defer/message in the own ficha.
- Prominent top access links lead to Convocar alumnos and Confirmar día/ver inscritos. List approved events, response counts and names; teacher can confirm a future day within the same month. Revalidate preparation for that exact day, atomically update approval scope/deadlines and preserve all responses and enrolments. Do not mutate grades, pass results or payments. Block evaluation/finalisation until a real day is confirmed.
- Existing events default to confirmed; no historical dates or existing registrations are rewritten by the migration. Test only synthetic rollback records; no real invitations or messages during verification. Independent review, SQL smoke, production build and read-only browser proof before reporting completion.
