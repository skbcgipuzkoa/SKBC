# Inventario legacy: shorinji_kempo_club

Fuente de solo lectura:

- Spreadsheet ID: `1GGVrz7UVNhlDu-NaE9qGs4U2bxXkh7pzXfdixTjYDrc`
- Titulo: `shorinji_kempo_club`
- Locale: `es_ES`
- Timezone del archivo: `America/Los_Angeles`
- Inventariado: 2026-07-28

## Pestañas detectadas

Se detectaron 62 pestañas. Todas deben preservarse en Supabase mediante
`legacy_sheets` y `legacy_rows`, aunque no todas se normalicen en tablas finales
desde el primer dia.

| Orden | Pestaña | Filas grid | Columnas grid | Oculta |
| ---: | --- | ---: | ---: | --- |
| 0 | Sheet1 | 996 | 38 | no |
| 1 | LOG_INFORMES_EXAMEN | 1000 | 26 | no |
| 2 | AUDITORIA_PLAN_TECNICO | 1000 | 26 | no |
| 3 | Próxima Convocatoria | 1000 | 26 | no |
| 4 | NINOS_CONFIG | 1000 | 26 | no |
| 5 | NINOS_FICHAS_CACHE | 1000 | 25 | no |
| 6 | NINOS_NOTAS_SENSEI | 1000 | 26 | no |
| 7 | NINOS_AVISOS | 1000 | 26 | no |
| 8 | NINOS_COMPORTAMIENTO | 1000 | 26 | no |
| 9 | NINOS_RANKING | 1000 | 26 | no |
| 10 | CLASES_ADULTOS | 996 | 26 | no |
| 11 | ASIGNACION_TECNICA_ALUMNO_CLASE | 1000 | 26 | no |
| 12 | TECNICAS_ADULTOS | 50584 | 26 | no |
| 13 | AUDITORIA_TECNICAS_ADULTOS | 50323 | 26 | no |
| 14 | AUDITORIA_EXTRAS_DAN_REVISADA | 1000 | 26 | no |
| 15 | FICHAS_CACHE | 999 | 26 | no |
| 16 | SITES_GRADOS | 1000 | 26 | no |
| 17 | ASISTENCIAS_LOG_ARCHIVO_2022 | 1000 | 26 | no |
| 18 | PLAN_TECNICO_ADULTOS | 52006 | 26 | no |
| 19 | CORRECCION_ASIGNACIONES | 1000 | 26 | no |
| 20 | RESUMEN_CONTROL_ACTUALIZACIONES | 1000 | 26 | no |
| 21 | LOG_CIERRE_SKBC | 2705 | 26 | no |
| 22 | RESUMEN_TECNICAS_ALUMNO | 1000 | 26 | no |
| 23 | RESUMEN_ASISTENCIAS_ALUMNO | 1000 | 26 | no |
| 24 | CONTROL_APP | 1000 | 26 | no |
| 25 | RESUMEN_TECNICAS_DOJO | 1000 | 26 | no |
| 26 | DICCIONARIO_DATOS | 1000 | 26 | no |
| 27 | HISTORIAL_TECNICO_ADULTOS | 1000 | 26 | no |
| 28 | HISTORIAL_TECNICO_ALUMNOS | 1000 | 26 | no |
| 29 | CONFIG_TECNICO_ADULTOS | 1001 | 26 | no |
| 30 | BADGES_LOG | 1000 | 26 | no |
| 31 | MENU | 1000 | 26 | no |
| 32 | IMPLICACION | 999 | 26 | no |
| 33 | TOP10_ADULTOS | 998 | 27 | no |
| 34 | TOP10_NINOS | 998 | 27 | no |
| 35 | RANKING | 1000 | 26 | no |
| 36 | ASISTENCIAS_LOG | 997 | 26 | no |
| 37 | GRUPOS_TECNICOS_CLASE | 998 | 26 | no |
| 38 | CURSOS_INT | 998 | 26 | no |
| 39 | CURSOS_NAC | 996 | 26 | no |
| 40 | EXAMENES | 992 | 32 | no |
| 41 | OPCIONES_IMPREVISTOS | 1000 | 26 | no |
| 42 | CALENDARIO | 1000 | 26 | no |
| 43 | CAMBIOS_2028 | 1000 | 26 | si |
| 44 | CAMBIOS_2029 | 1000 | 26 | si |
| 45 | CAMBIOS_2030 | 1000 | 26 | si |
| 46 | CAMBIOS_2031 | 1000 | 26 | si |
| 47 | CAMBIOS_2032 | 1000 | 26 | si |
| 48 | CAMBIOS_2033 | 1000 | 26 | si |
| 49 | CAMBIOS_2034 | 1000 | 26 | si |
| 50 | CAMBIOS_2035 | 1000 | 26 | si |
| 51 | CAMBIOS_2036 | 1000 | 26 | si |
| 52 | CAMBIOS_2026 | 1000 | 26 | si |
| 53 | CAMBIOS_2027 | 1000 | 26 | si |
| 54 | REQUISITOS_GRADO | 1000 | 26 | no |
| 55 | USUARIOS | 1000 | 26 | no |
| 56 | USUARIO_ALUMNO | 1000 | 26 | no |
| 57 | MATERIAL_GRADOS | 1000 | 26 | no |
| 58 | KAMOKU_VIDEOS | 1000 | 26 | no |
| 59 | GRADOS | 1000 | 26 | no |
| 60 | BACKUP_TECNICAS_ADULTOS_20260525_172244 | 50584 | 26 | no |
| 61 | BACKUP_ORDEN_TECNICAS_20260525_173308 | 50584 | 26 | no |

## Cabeceras confirmadas de pestañas criticas

### Sheet1

`AlumnoRef, ID, Nombre, Apellidos, Tutor, Teléfono Tutor, Teléfono Alumno,
Dirección, Fecha Ingreso, Clase, Asistencias, Estado, AlumnoFoto,
Historial Exámenes, Fecha Ultimo examen, Grado, Aviso, ProximoExamen,
HistorialAsistencias, EmailFamilia, AsistenciasTotales, AlumnoFotoURL,
Semaforo, PorcentajeAsistencia, MinimoAsistencias, TotalSesionesCiclo,
FaltanAsistencias, URL_Site, ID_FICHA, URL_FICHA, ID_FICHA_ALUMNO,
TOKEN_FICHA_WEB, URL_FICHA_WEB, ID_CARPETA_ALUMNO, URL_CARPETA_ALUMNO,
FICHA_PERSONAL, NOTAS_SENSEI, FICHA_PADRES`

Campo nuevo en la plataforma: `ika_id`.

### Pestañas de niños

- `NINOS_CONFIG`: `CLAVE, VALOR`
- `NINOS_FICHAS_CACHE`: `ID, TOKEN_FICHA_WEB, FECHA_ACTUALIZACION, TIMESTAMP_ACTUALIZACION, ESTADO, ERROR, JSON_FICHA, URL_FICHA_WEB, FICHA_PADRES`
- `NINOS_NOTAS_SENSEI`: `ID, Nombre, Apellidos, Fecha, Tipo, Nota, Visible_Familia, Autor`
- `NINOS_AVISOS`: `ID, Nombre, Apellidos, Fecha, Titulo, Aviso, Color, Activo`
- `NINOS_COMPORTAMIENTO`: `ID, Nombre, Apellidos, Fecha, Actitud, Atencion, Respeto, Esfuerzo, Compañerismo, Observacion`
- `NINOS_RANKING`: `ID, Nombre, Apellidos, Grado, Asistencias_30d, Asistencias_90d, Ultima_Asistencia, Dias_Sin_Venir, Score, Posicion, Nivel`

### Pestañas operativas adultos

- `CLASES_ADULTOS`: `ID_CLASE, FECHA, NOMBRE_CLASE, GRUPO, TIPO_CLASE, RESPONSABLE, OBSERVACIONES, PLAN_GENERADO, CLASE_CERRADA, ESTADO, ACCION_SISTEMA`
- `TECNICAS_ADULTOS`: `ID_TECNICA, GRADO, TECNICA_BASE, NOMBRE_TECNICA, CATEGORIA, TIPO_CONTENIDO, ORDEN_PROGRAMA, ACTIVA, ACTIVA_EN_PLANIFICACION, FORZAR_PROXIMA, PUNTUACION, REPETICIONES, ULTIMA_VEZ_ENTRENADA, ORDEN_CURRICULAR, DIAS_SIN_ENTRENAR`
- `PLAN_TECNICO_ADULTOS`: `ID_PLAN, ID_CLASE, ID_GRUPO_TECNICO, FECHA, TIPO_SESION_TECNICA, GRADO, GRADO_GRUPO, GRADO_OBJETIVO, ID_TECNICA, GRADO_TECNICA, TECNICA_BASE, NOMBRE_TECNICA, CATEGORIA, TIPO_CONTENIDO, TIPO_PROPUESTA, ENFOQUE_TECNICO, ORDEN_SUGERENCIA, PUNTUACION_EN_ESE_MOMENTO, REALIZADA, OBSERVACIONES, USADA_PARA_HISTORIAL`
- `ASISTENCIAS_LOG`: `LOG_ID, Fecha, ID, Nombre, Apellidos, Clase, ID_CLASE, GRADO_OFICIAL_DEL_DIA, GRADO_TECNICO_ENTRENADO, ROL_TECNICO_EN_CLASE, OBSERVACION_TECNICA, USAR_PARA_HISTORIAL`
- `ASIGNACION_TECNICA_ALUMNO_CLASE`: `ID_ASIGNACION, ID_CLASE, FECHA, ID_ALUMNO, NOMBRE_ALUMNO, GRADO_ALUMNO, ID_GRUPO_TECNICO, GRADO_GRUPO_ASIGNADO, ACTIVO, OBSERVACIONES, CREADO_EL, CREADO_POR, ID_PLAN, ID_TECNICA, NOMBRE_TECNICA, REALIZADA, CUENTA_COMO_PROGRESION, CUENTA_COMO_REPASO, CUENTA_PARA_ESTADISTICA`

### Examenes y cursos

- `EXAMENES`: `FechaExamen, ID, Alumno, Clase, Grado, AsistenciasCiclo, Examinador, RegistradoPor, TimestampRegistro, URL_Diploma, InformePDF, InformeCreadoEl, InformeCreadoPor, InformeTipo, InformeNombreArchivo`
- `CURSOS_NAC`: `Fecha, ID, Donde, Curso, Sensei, Notas, LOG_ID, Timestamp`
- `CURSOS_INT`: `Fecha, ID, Donde, Curso, Sensei, Notas, LOG_ID, Timestamp`

## Nota de acceso

La exportacion directa del Google Sheet a XLSX desde Drive devolvio `403
Forbidden`. La importacion completa se hara por uno de estos metodos:

1. Apps Script lector de solo lectura que exporte JSON/CSV por pestaña.
2. Permiso Drive/Sheets que permita descarga XLSX.
3. Lectura por lotes de rangos acotados desde Google Sheets API.

En todos los casos, el archivo original queda sin modificaciones.
