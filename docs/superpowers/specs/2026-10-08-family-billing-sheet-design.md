# Unidades familiares y hojas de cobro

## Objetivo

Crear una unidad familiar administrable desde las fichas internas de los kenshis y generar una unica hoja de cobro por familia cuando se incorpora un nuevo miembro. La hoja explicara la nueva cuota familiar, su desglose y la fecha del primer cobro unificado. El aviso permanecera activo hasta confirmar que la hoja se ha entregado.

El sistema no almacenara DNI, IBAN, firmas ni datos del titular de la cuenta. Esos campos existiran exclusivamente como espacios vacios en el documento impreso.

## Unidad familiar

Se incorporan dos entidades:

- `family_units`: identifica una unidad familiar y conserva un nombre administrativo opcional, fechas de creacion y actualizacion.
- `family_unit_members`: relaciona una unidad familiar con sus kenshis. Cada kenshi puede pertenecer como maximo a una unidad familiar y una unidad puede contener cualquier numero de miembros.

La ficha interna de cada kenshi tendra un bloque `Unidad familiar` que permitira:

- Ver todos los miembros asociados.
- Crear una nueva unidad familiar a partir del kenshi actual.
- Incorporar uno o varios kenshis activos a una unidad existente.
- Retirar un miembro de la unidad.
- Disolver una unidad que se quede sin miembros o con un unico miembro, previa confirmacion.

No se almacenara un tipo de parentesco. La pertenencia a la misma unidad familiar sera el unico dato necesario.

Los alumnos sin unidad familiar se trataran como unidades individuales a efectos del aviso y de la hoja.

## Reglas de cuota

Cuotas mensuales base:

- Ninos: 25 EUR.
- Adultos: 30 EUR.

Descuento por pertenecer a la misma unidad familiar:

- Primer miembro: sin descuento.
- Segundo miembro: 5 EUR de descuento.
- Cada miembro desde el tercero: 15 EUR adicionales de descuento.

La formula del descuento total para `n` miembros es:

- `0 EUR` cuando `n = 1`.
- `5 EUR` cuando `n = 2`.
- `5 + (n - 2) * 15 EUR` cuando `n >= 3`.

La cuota familiar sera la suma de las cuotas base de todos los miembros activos menos el descuento familiar. No habra limite de miembros y el calculo no dependera de cuantos sean ninos o adultos, salvo por su cuota base.

Ejemplos:

- Dos ninos: `25 + 25 - 5 = 45 EUR`.
- Un adulto y dos ninos: `30 + 25 + 25 - 20 = 60 EUR`.
- Dos adultos y tres ninos: `30 + 30 + 25 + 25 + 25 - 50 = 85 EUR`.

Los miembros inactivos no participaran en la cuota ni en el descuento.

## Incorporacion y fecha de cobro

La hoja vigente correspondera siempre al miembro activo incorporado mas recientemente a la unidad familiar. La antiguedad se determinara con la fecha de inicio del mes gratuito y, como respaldo, con la fecha de ingreso.

Para cada miembro se mostraran:

- Nombre y apellidos.
- Clase: ninos o adultos.
- Fecha de alta.
- Inicio del mes gratuito.
- Fin del mes gratuito.
- Cuota base individual.
- Indicacion de miembro ya existente o nueva incorporacion.

El primer cobro unificado usara la fecha de primer cobro valida del miembro incorporado mas recientemente. Hasta esa fecha, la hoja indicara expresamente que se mantiene la situacion de cobro anterior.

Si despues se incorpora otro miembro o cambia la composicion familiar, se creara una nueva tarea de hoja de cobro y la version anterior dejara de ser la vigente.

## Ciclo de la hoja y del aviso

Se creara una entidad `family_billing_sheet_tasks` para conservar el ciclo operativo sin mezclarlo con el estado general del mes gratuito. Cada tarea guardara:

- Unidad familiar, cuando exista.
- Miembro cuya incorporacion origina la hoja.
- Firma estable de los miembros activos incluidos.
- Fecha calculada de primer cobro unificado.
- Estado: pendiente, generada o entregada.
- Fecha de generacion.
- Fecha de entrega.
- Instantanea del calculo, sin DNI, IBAN ni firmas.

El flujo sera:

1. Al terminar el mes gratuito del ultimo miembro incorporado aparece un aviso unico para la familia.
2. El aviso muestra la familia, el nuevo miembro, la cuota resultante y el primer cobro.
3. `Generar hoja de cobro` abre el PDF imprimible y registra la generacion.
4. `Confirmar hoja entregada` registra la fecha de entrega.
5. La tarea desaparece inmediatamente de avisos activos, del contador lateral y de Telegram.

El boton de entrega estara disponible aunque el PDF no se haya abierto, para permitir registrar una hoja preparada por otro medio. La interfaz advertira de que se esta cerrando el aviso para toda la unidad familiar.

Los avisos individuales existentes se migraran al nuevo modelo. Las confirmaciones ya realizadas no volveran a aparecer.

## Documento PDF

El PDF sera una pagina A4 preparada para visualizar, imprimir o descargar. Incluira:

- Logo, nombre y datos del club.
- Titulo `Datos para el cobro de las cuotas de SKBC Gipuzkoa`.
- Fecha de emision.
- Identificacion de la nueva incorporacion.
- Tabla de todos los miembros activos de la unidad familiar.
- Inicio y fin del mes gratuito de cada miembro cuando corresponda.
- Cuota base de cada miembro.
- Suma de cuotas base.
- Descuento familiar aplicado.
- Nueva cuota mensual unificada.
- Numero total de personas incluidas y sus nombres completos.
- Fecha del primer cobro unificado.
- Aclaracion de que hasta esa fecha se mantiene el cobro anterior.
- Campos vacios para nombre, apellidos y DNI del titular.
- Campo vacio para IBAN completo.
- Campo vacio de DNI para cada alumno.
- Firma del titular de la cuenta.
- Firma del tesorero del club.

Texto de privacidad:

> Los datos facilitados seran utilizados unica y exclusivamente para gestionar el cobro de las cuotas y los gastos correspondientes al alumno o alumnos indicados en SKBC Gipuzkoa, conforme a la Ley Organica 3/2018, de Proteccion de Datos Personales y garantia de los derechos digitales, y demas normativa aplicable.

El PDF se generara en el servidor a partir de datos internos y no se guardara automaticamente en un servicio externo. DNI, IBAN y firmas nunca formaran parte de la base de datos, logs, URL ni instantanea de calculo.

## Pantallas

### Ficha interna del kenshi

El bloque `Unidad familiar` mostrara los miembros en una lista compacta con nombre, clase y estado. Un selector buscable permitira anadir kenshis activos. Las acciones de retirar o disolver requeriran confirmacion y explicaran si generan una nueva hoja pendiente.

Junto al bloque se mostrara un resumen de cuota familiar: bases, descuento, total y proxima fecha unificada.

### Avisos

Cada unidad familiar aparecera una sola vez. La tarjeta mostrara:

- Nombre administrativo o nombres de los miembros.
- Ultima incorporacion.
- Numero de miembros incluidos.
- Cuota familiar calculada.
- Primer cobro unificado.
- Acciones para abrir la familia, generar la hoja y confirmar la entrega.

## Seguridad y acceso

- Toda la gestion sera exclusivamente interna y exigira acceso administrativo.
- Las tablas familiares tendran RLS sin acceso publico.
- Las operaciones se ejecutaran mediante acciones de servidor validadas.
- El PDF exigira la misma sesion interna que la ficha del kenshi.
- Nunca se aceptaran DNI, IBAN o firmas en formularios digitales de esta funcionalidad.

## Errores y consistencia

- No se permitira anadir dos veces al mismo kenshi ni incluirlo en dos unidades.
- Si cambia la unidad mientras se genera una hoja, se recalculara antes de emitir el PDF.
- La confirmacion de entrega sera idempotente y no generara avisos duplicados.
- Si falta una fecha de prueba, el aviso explicara el dato pendiente y permitira abrir la ficha, pero no inventara una fecha de cobro.
- Un miembro inactivo se excluira del calculo sin borrar su relacion historica.

## Verificacion

Se comprobaran como minimo:

- Unidad individual.
- Dos ninos.
- Familia mixta de tres miembros.
- Familia de cuatro miembros.
- Familia de cinco o mas miembros.
- Miembros con fechas de alta diferentes.
- Exclusion de miembros inactivos.
- Una sola tarjeta por familia.
- Regeneracion al cambiar la composicion.
- Desaparicion tras confirmar la entrega.
- Persistencia de la confirmacion en panel, menu y Telegram.
- Ausencia de DNI, IBAN y firmas en base de datos y logs.
- Renderizado visual del PDF sin cortes, solapamientos ni campos ilegibles.
- Compilacion, comprobacion de tipos y despliegue de produccion.
