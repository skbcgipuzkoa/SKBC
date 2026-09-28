# Pedidos internos de cinturones de examen

## Objetivo

Convertir la pestana `Cinturones internos` en una herramienta dedicada exclusivamente a preparar y seguir los cinturones que corresponden a alumnos aprobados. Los dogis, la ropa del club y el resto del material continuan en el sistema publico de pedidos de la web y no se gestionan desde esta pestana.

## Flujo automatico

El alta del cinturon se integra en el registro central de aprobados, de forma que funcione con examenes manuales, examenes integrados y resultados recibidos desde el sistema externo.

Cuando se confirma un aprobado, el sistema mantiene el flujo actual de registro del examen, actualizacion del grado, informe y diploma, y ademas crea una linea interna con:

- Alumno y examen vinculados.
- Fecha del examen.
- Grado objetivo aprobado.
- Articulo `Cinturon`.
- Color derivado del grado objetivo mediante una correspondencia centralizada.
- Cantidad `1`.
- Medida `Pendiente de indicar`.
- Estado inicial `Pendiente de medida`.

La combinacion de examen y alumno debe ser idempotente: repetir el cierre o recibir dos veces el mismo resultado no puede crear dos cinturones. Los pedidos ya existentes no se sobrescriben, para conservar cualquier medida, nota o estado editado manualmente.

El pedido del cinturon no sustituye ni condiciona la generacion del informe o diploma. Si el alta automatica no pudiera completarse, el sistema conserva el aprobado y muestra una incidencia operativa suficientemente visible para que el cinturon pueda regularizarse desde la pantalla interna.

## Pantalla de gestion

La pestana pasa a llamarse `Cinturones de examen`. Su contenido queda separado del panel de pedidos publicos y presenta:

- Indicadores de `Pendientes de medida`, `Listos para pedir`, `Pedidos`, `Recibidos` y `Entregados`.
- Una tabla principal con alumno, fecha y referencia del examen, grado objetivo, color, medida, estado y observaciones.
- Filtros por estado y busqueda por alumno, grado o color.
- Edicion de color, medida, cantidad y observaciones.
- Acciones para avanzar o corregir el estado: pendiente de medida, listo para pedir, pedido, recibido y entregado.
- Eliminacion manual con confirmacion para casos en los que el cinturon no deba comprarse.

Los registros con medida pendiente deben destacarse y no pueden marcarse como `Listo para pedir` hasta indicar una medida valida.

## Alta manual

Se conserva una accion secundaria `Anadir cinturon manual` para excepciones. Requiere seleccionar un alumno activo o escribir un nombre, indicar grado/color y permite dejar la medida pendiente. No incluye catalogo general, dogis, camisetas, cobros ni comunicaciones.

## Datos y compatibilidad

Se reutiliza `belt_order_lines` para conservar el historial existente, pero la interfaz solo muestra lineas de cinturones. Se anaden los campos o restricciones necesarios para representar el estado `Pendiente de medida`, distinguir el origen automatico y garantizar unicidad por examen y alumno.

Las lineas antiguas de otros materiales permanecen en la base de datos para no perder informacion, pero dejan de aparecer en esta pestana. Los pedidos publicos siguen almacenados y gestionados en la base de datos de la web mediante el panel mensual existente.

## Errores y seguridad

- Todas las acciones requieren acceso interno.
- Las mutaciones validan que la linea y el alumno existan.
- Los cambios de estado se validan en servidor.
- La eliminacion queda protegida por confirmacion y se envia a la papelera si el patron actual lo permite.
- La automatizacion registra errores sin duplicar aprobados ni pedidos.

## Verificacion

- Pruebas de la correspondencia entre grado objetivo y color.
- Prueba de creacion automatica al aprobar por cada via de examen.
- Prueba de idempotencia para el mismo alumno y examen.
- Prueba de que una edicion manual no se sobrescribe al reprocesar el aprobado.
- Prueba de validacion de medida antes de marcar `Listo para pedir`.
- Compilacion de produccion y comprobacion visual en escritorio y movil.
- Despliegue y verificacion final en `https://skbc.vercel.app`.
