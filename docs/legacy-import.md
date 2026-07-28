# Importacion legacy

El importador conserva todas las pestañas y todas las filas del Google Sheet
actual en Supabase.

## Entrada

Un XLSX descargado del archivo legacy:

`shorinji_kempo_club.xlsx`

El archivo XLSX no se sube a GitHub.

## Comando

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL="https://zxmjhgrpxxcinxtfuers.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
npm run import:legacy:xlsx -- C:\ruta\shorinji_kempo_club.xlsx
```

## Resultado

- `legacy_spreadsheets`: registra el archivo fuente.
- `legacy_sheets`: registra cada pestaña.
- `legacy_rows`: guarda cada fila completa como JSON y array de valores.
- `members`: normaliza `Sheet1` como kenshis/alumnos.

## Campo nuevo

Si el XLSX trae una columna `ID de IKA` o `IKA_ID`, se importa a
`members.ika_id`. Si no existe, queda vacio para rellenarlo en la nueva app.

## Seguridad

El importador usa `SUPABASE_SERVICE_ROLE_KEY`, por eso solo se ejecuta localmente
o en un job privado. Nunca se usa en navegador ni se sube al repositorio.
