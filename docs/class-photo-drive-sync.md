# Fotos de clases en Drive

Las carpetas siguen siendo privadas. Solo una ficha activa y con asistencia a la clase exacta puede ver o descargar sus fotos.

## Carpetas

SKBC · Fotos de entrenamientos / año / mes / fecha · grupo · clase.

No se crea carpeta al crear o abrir una clase. Se crea al subir la primera foto desde SKBC o al pulsar Preparar carpeta en Drive. Los álbumes anteriores se reorganizan conservando su ID y archivos al prepararlos o en la revisión programada.

## Fotos añadidas directamente en Drive

Subir JPEG, PNG, WebP, GIF o AVIF de hasta 20 MB a la carpeta exacta de la clase. Se incorporan las fotos nuevas legibles por Google, hasta 200 publicadas por clase. No se incluyen subcarpetas ni vídeos/HEIC. El móvil puede subir HEIC mediante SKBC si su navegador puede convertirlo a JPEG.

La subida desde SKBC permite hasta 50 fotos por envío; pueden hacerse varios envíos hasta alcanzar 200 por clase. La galería carga 20 fotos inicialmente y ofrece Ver más fotos. Las importaciones grandes avanzan por tandas conservando el progreso.

La ficha comprueba novedades al abrirse y cada cinco minutos mientras está visible. Hay una revisión diaria adicional y el admin dispone de Sincronizar fotos de Drive ahora. La revisión exige autorización activa y asistencia antes de acceder a Drive; nunca crea carpetas desde la ficha.

La primera revisión de un álbum antiguo establece una referencia de los archivos existentes sin republicarlos. Así los originales antiguos, las exclusiones y las retiradas no reaparecen. Los archivos añadidos después sí pueden publicarse. Retirar una publicación mantiene ocultos sus archivos existentes; futuras fotos nuevas podrán publicarse automáticamente.

## Autorización Google

Desde Fotos del entrenamiento / Conexión con Google Drive, usar Conectar Google para fotos de Drive. Debe ser la cuenta que pueda abrir la carpeta raíz. Autorizar únicamente lectura de Drive; no se cambia la configuración de uso compartido.

El cliente web propio para fotos se configura cifrado desde el admin (o con SKBC_CLASS_PHOTOS_GOOGLE_CLIENT_ID y SKBC_CLASS_PHOTOS_GOOGLE_CLIENT_SECRET). No sirve el cliente de consola CLASP de la conexión antigua. El cliente OAuth de Google debe permitir la URI exacta https://skbc.vercel.app/api/admin/class-photos/google/callback (o el origen HTTPS configurado en SKBC_PUBLIC_URL). Si Google indica redirect_uri_mismatch, registrar esa URI en el cliente de Google Cloud antes de volver a conectar.

La nueva autorización solo afecta a fotos. El refresh token se cifra con AES-256-GCM usando una clave derivada de SUPABASE_SERVICE_ROLE_KEY del servidor, se almacena en un archivo privado de integración en la raíz y nunca se envía a las fichas ni al navegador. La conexión anterior de otros servicios se conserva, y sigue usándose para los metadatos privados y las escrituras de Drive. La nueva autorización solo descarga archivos.

## Verificación

Pruebas: scripts/check-class-photo-drive-sync.mjs, check-class-photo-google-auth.mjs, check-class-photo-sync-route.mjs, check-class-photos.mjs y el resto de comprobaciones class-photo. TypeScript y build de Next deben pasar antes del despliegue.
