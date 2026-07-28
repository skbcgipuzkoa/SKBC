# Seguridad

## Secretos

No se guardan secretos en GitHub.

Valores permitidos en el repositorio:

- Nombres de variables en `.env.example`.
- Claves publicas de navegador solo cuando sean publicas por diseno.

Valores prohibidos en el repositorio:

- `SUPABASE_SERVICE_ROLE_KEY`.
- Tokens de Telegram.
- Private keys de Google.
- URLs firmadas privadas.
- Dumps con datos personales sin anonimizar.

## Variables previstas

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `GOOGLE_DRIVE_CLIENT_EMAIL`
- `GOOGLE_DRIVE_PRIVATE_KEY`

## Supabase

- RLS activado en tablas con datos del club.
- Acciones delicadas siempre server-side.
- Service role solo en jobs, importadores y rutas internas.
- Auditoria para cierre de clase, importaciones y cambios de grado.
