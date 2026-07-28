# Plan de migracion SKBC

## Regla principal

El sistema actual de AppSheet, Apps Script, Google Sheets, Drive y Telegram no se modifica. La nueva plataforma se construye en paralelo y solo consumira copias/exportaciones hasta que este validada.

## Fases

1. Auditoria funcional del legacy.
2. Export seguro de Apps Script y definicion AppSheet.
3. Modelo Supabase y RLS.
4. Importadores desde Google Sheets.
5. App admin para el sensei.
6. Portal alumno/familia.
7. Automatizaciones equivalentes.
8. Pruebas comparativas viejo vs nuevo.
9. Piloto controlado.
10. Cambio definitivo cuando el club lo apruebe.

## Fuentes legacy detectadas

- Google Sheet maestro: `shorinji_kempo_club`.
- Carpeta Drive: `appsheet`.
- README tecnico: `README_sistema`.
- Apps Script: `FICHAS NIÑOS`, `Pedidos SKBC GIPUZKOA`, proyecto contenedor del Sheet.
- Backups: `shorinji_kempo_club_Backup_*`.

## Funciones principales a replicar

- Crear, preparar y cerrar clases.
- Generar plan tecnico por grupos.
- Marcar tecnicas realizadas.
- Pasar asistencia.
- Historico tecnico del dojo.
- Historico tecnico por alumno.
- Resumenes de asistencia y tecnicas.
- Fichas web personales con token.
- Ranking de implicacion.
- Hitos Telegram.
- Diplomas automaticos.
- PDF del plan tecnico.
- Archivado rolling.
- Diagnostico de integridad.
