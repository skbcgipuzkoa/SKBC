# Normalizacion legacy

El comando `npm run normalize:legacy` transforma datos preservados en
`legacy_rows` hacia tablas de aplicacion.

Normalizaciones actuales:

- `CLASES_ADULTOS` -> `classes`
- `TECNICAS_ADULTOS` -> `techniques`

Proximas normalizaciones:

- `ASISTENCIAS_LOG` -> `attendance_logs`
- `PLAN_TECNICO_ADULTOS` -> `technical_plans`
- `ASIGNACION_TECNICA_ALUMNO_CLASE` -> `member_technique_assignments`
- `EXAMENES` -> `exams`
- `CURSOS_NAC` / `CURSOS_INT` -> `courses`
