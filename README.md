# SKBC

Nueva plataforma paralela para la gestion de SKBC Gipuzkoa.

Este repositorio reemplazara gradualmente la combinacion actual de AppSheet,
Apps Script, Google Sheets y automatizaciones, pero el sistema actual queda
intacto hasta que la nueva aplicacion este validada.

## Principios

- Construccion en paralelo, sin modificar el sistema legacy.
- Supabase como base de datos, autenticacion, storage y backend seguro.
- Vercel como hosting de la aplicacion web.
- GitHub como fuente de codigo, sin claves ni secretos.
- Migraciones e importadores reproducibles.

## Estado

Fase inicial: base tecnica, modelo de datos y plan de migracion.

## Promociones de material

En **Pedidos → Gestionar pedidos de promociones**, crea una promoción, añade las variantes, define el precio original y el precio con código y marca la página como publicada. Copia el enlace o abre «Compartir por WhatsApp». Selecciona el día y la hora de caducidad en horario peninsular. Para camisetas y sudaderas selecciona el grupo de niños o adultos para incluir todas sus tallas automáticamente.

La página compartida muestra la selección de la promoción. El comprador indica su nombre y un contacto. La administración consulta los pedidos con su detalle y el resumen por variante. Los enlaces son de acceso por posesión y la página pide a los buscadores que no la indexen. Cualquiera a quien se reenvíe el enlace puede abrir la página y enviar un pedido. El código fija el precio y se puede desactivar la página desde la administración.

### Configuración de prueba y recuperación

- Aplica supabase/migrations/20261124150000_shop_promotions.sql seguida de supabase/migrations/20261124151500_shop_general_catalog.sql en un Supabase de prueba antes de habilitar el entorno Preview.
- En Vercel Preview configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY con los valores del proyecto aislado. Define SKBC_INTERNAL_ACCESS_CODE para la administración de prueba. El servidor usa VERCEL_URL para los enlaces compartidos de Preview y SKBC_PUBLIC_URL para el dominio de producción cuando corresponda.
- Opcionalmente configura WEB_ORDERS_SUPABASE_URL y WEB_ORDERS_SUPABASE_SERVICE_ROLE_KEY con el catálogo aislado para importar datos de variantes existentes al editor. El editor también acepta variantes manuales.
- Ejecuta node scripts/check-shop-promotion.mjs, npm run typecheck y npm run build. Comprueba un código vigente, uno caducado y la recepción del pedido desde el panel.
- Para detener la recepción de una promoción, desmarca «Página publicada». Los pedidos ya guardados siguen visibles en administración. Para revertir una versión conserva las tablas y exporta o respalda los pedidos antes de cualquier restauración. Una reversión del código no requiere borrar las tablas agregadas.
Después de guardar la promoción, selecciona las variantes que quieres añadir a la tienda y pulsa «Publicar variantes seleccionadas». La tienda general está en /tienda y también se puede compartir por WhatsApp. Desde la tienda se puede usar el código vigente en las variantes publicadas que pertenecen a su promoción.
