# Seguimiento familiar de pagos de pedidos

## Objetivo

Anadir a cada campana de pedidos publicos un seguimiento posterior al envio de emails para saber que familias han pagado en efectivo, cuales siguen pendientes y a cuales ya se les ha lanzado el cobro por cuenta corriente.

El seguimiento se realiza una sola vez por familia y campana, aunque el email incluya pedidos de varios alumnos o varias solicitudes separadas.

## Propiedad de los datos

Los datos se almacenan en el Supabase de la web, junto a las campanas, pedidos y comunicaciones publicas. La base principal de gestion solo consulta y actualiza esta informacion mediante la conexion privada ya utilizada por el panel de pedidos.

Se crea una tabla de seguimiento con una restriccion unica por `campaign_id` y clave familiar. La clave familiar reutiliza la misma agrupacion que las comunicaciones: email normalizado cuando existe y, como respaldo, telefono o identidad normalizada del responsable.

## Creacion y sincronizacion

El panel genera o sincroniza una fila por familia a partir de los pedidos de la campana seleccionada. Cada fila conserva:

- Campana.
- Clave familiar estable.
- Nombre y contacto del responsable.
- Identificadores de los pedidos incluidos.
- Nombres de alumnos o destinatarios y resumen de articulos.
- Importe total familiar.
- Forma prevista de pago: efectivo, cuenta corriente o ya pagado.
- Estado de seguimiento.
- Fecha de actualizacion y observaciones.

La sincronizacion puede anadir pedidos nuevos mientras la campana no este cerrada, pero nunca debe sobrescribir un estado de cobro ya marcado manualmente. En campanas cerradas, los importes y pedidos quedan congelados como en el flujo actual.

## Estados

Solo existen tres estados operativos:

- `pending`: pendiente de resolver.
- `cash_paid`: pagado en efectivo.
- `bank_submitted`: cobro enviado al banco.

Los pedidos cuya forma ya era `paid` se inicializan como `cash_paid` y pueden corregirse manualmente. No se incorpora una confirmacion bancaria adicional por decision del responsable del club.

Cada cambio guarda la fecha efectiva del estado. Volver a `pending` limpia la fecha para permitir corregir errores.

## Interfaz

Dentro de `Cobros y comunicaciones`, despues del cierre y envio, aparece `Seguimiento de pagos` con:

- Total de la campana.
- Efectivo pendiente.
- Efectivo recibido.
- Cobros enviados al banco.
- Una fila por familia con responsable, alumnos/articulos, total, forma prevista, estado, fecha y observaciones.
- Acciones directas para marcar `Pagado en efectivo`, `Cobro enviado al banco` o devolver a `Pendiente`.
- Filtros por pendiente, efectivo y cuenta corriente.

El seguimiento sigue editable cuando la campana esta cerrada. Cambiar un pago no altera los emails enviados, sus instantaneas ni el estado de entrega del material.

## Integridad y errores

- Todas las mutaciones requieren acceso interno.
- La actualizacion comprueba que el seguimiento pertenece a la campana seleccionada.
- Una familia no puede tener dos seguimientos en la misma campana.
- Los importes se calculan en centimos a partir de las lineas reales, sin sumar articulos entre si ni reconstruir precios desde texto.
- Si la tabla todavia no esta disponible, el resto del panel sigue funcionando y muestra un aviso concreto en el bloque de cobros.

## Verificacion y produccion

- Verificar agrupacion de varios pedidos de una misma familia.
- Verificar importes y destinatarios del ultimo pedido ya comunicado.
- Verificar las tres transiciones de estado y sus fechas sin enviar comunicaciones.
- Comprobar que una campana cerrada permite editar cobros.
- Ejecutar chequeo de tipos y compilacion de produccion.
- Aplicar la migracion en el Supabase de la web.
- Desplegar en Vercel y comprobar la campana real sin cambiar estados de pago existentes.
