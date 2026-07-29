# External exams API

Endpoint for the separate SKBC exams app to write directly into the new parallel platform.

## Endpoint

`POST /api/external/exams`

## Auth

Preferred: send the current Supabase auth access token from the exams app professor session.

Fallback: send the token configured in Vercel as `SKBC_EXAMS_API_TOKEN`.

```http
Authorization: Bearer <EXAMS_APP_ACCESS_TOKEN_OR_SKBC_EXAMS_API_TOKEN>
Content-Type: application/json
```

Never put this token in GitHub or client-side public code.

## Payload

Minimum:

```json
{
  "alumnoId": "13",
  "fechaExamen": "2026-07-29",
  "grado": "4 KYU",
  "examinador": "Sensei",
  "registradoPor": "APP EXAMEN SKBC"
}
```

Accepted identifiers, in priority order:

- `memberId`: new Supabase member UUID.
- `legacyId`, `alumnoId` or `alumnoRef`: legacy member ID.
- `alumno` or `nombre`: display name fallback, only accepted if it matches one member.

Optional document fields:

- `informeUrl`
- `reportUrl`
- `diplomaUrl`

For now these are stored in the existing `exams.diploma_url` field so production does not depend on pending report metadata columns. Once the report migration is applied, this can be split into dedicated report fields.

## Behavior

The endpoint:

- Creates one row in `exams`.
- Updates the member's current grade.
- Updates `last_exam_on`.
- Clears `next_exam_on`.
- Appends to `exam_history`.
- Calculates cycle attendance from new `attendance_logs`.
- Appends to `attendance_history`.
- Stores the optional document URL on the exam line.

It writes only to the new Supabase project.
