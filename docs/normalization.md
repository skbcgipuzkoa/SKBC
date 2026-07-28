# Normalizacion legacy

El comando `npm run normalize:legacy` transforma datos preservados en
`legacy_rows` hacia tablas de aplicacion.

Normalizaciones actuales:

- `CLASES_ADULTOS` -> `classes`
- `TECNICAS_ADULTOS` -> `techniques`
- `ASISTENCIAS_LOG` -> `attendance_logs`
- `EXAMENES` -> `exams`
- `CURSOS_NAC` / `CURSOS_INT` -> `courses`
- `GRUPOS_TECNICOS_CLASE` -> `class_technical_groups`
- `PLAN_TECNICO_ADULTOS` -> `technical_plans`
- `ASIGNACION_TECNICA_ALUMNO_CLASE` -> `member_technique_assignments`

Proximas normalizaciones:

- `HISTORIAL_TECNICO_ADULTOS` -> pendiente de tabla final
- `HISTORIAL_TECNICO_ALUMNOS` -> pendiente de tabla final
