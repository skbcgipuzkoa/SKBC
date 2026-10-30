# Programa infantil independiente y examenes progresivos

## Objetivo

Crear un apartado administrativo propio para mantener el programa tecnico infantil por grados, separado del programa de adultos. El mismo catalogo sera la fuente de verdad para las clases infantiles, las fichas de los alumnos y la preparacion de examenes infantiles progresivos.

El sistema debe reutilizar el temario infantil existente, conservar los historicos y evitar que una correccion posterior del catalogo cambie un examen ya creado.

## Alcance

Incluye:

- Un acceso de menu llamado `Programa infantil`.
- Gestion de tecnicas, actividades y otros contenidos infantiles.
- Asignacion de un mismo contenido a uno o varios grados.
- Estado activo y evaluable independiente por grado.
- Archivado seguro de contenidos utilizados.
- Integracion con clases infantiles, modo sustituto, fichas y examenes progresivos.
- Selector de temario dentro del flujo existente de creacion de examenes.

No incluye:

- Cambios en el programa tecnico de adultos.
- Un segundo apartado de examenes.
- La modificacion retroactiva de examenes o clases ya cerrados.

## Experiencia de administracion

### Navegacion

El menu incorporara `Programa infantil` como area independiente. La pantalla seguira la direccion visual limpia elegida en la opcion B y tendra tres vistas:

1. `Temario por grados`: vista principal para revisar y ordenar el programa de cada grado.
2. `Catalogo general`: buscador de todos los contenidos y formulario para crear o editar.
3. `Archivados`: contenidos retirados que conservan historial y pueden restaurarse.

La creacion de examenes seguira estando exclusivamente en el apartado `Examenes`.

### Temario por grados

El administrador seleccionara un grado infantil y vera sus contenidos agrupados por categoria. Cada fila mostrara, como minimo:

- Nombre.
- Categoria.
- Estado activo.
- Estado evaluable.
- Orden dentro del grado.
- Acciones de editar, archivar o retirar de ese grado.

La pantalla permitira reordenar contenidos sin modificar otros grados. Las secciones estaran replegadas por defecto cuando la cantidad de contenido lo aconseje.

### Catalogo general

Cada contenido tendra:

- Nombre.
- Categoria.
- Descripcion opcional.
- Uno o varios grados asignados.
- Orden por grado.
- Indicadores `Activo` y `Evaluable` por cada grado asignado.

Una tecnica o actividad compartida se creara una sola vez. La correccion de su nombre, categoria o descripcion se reflejara en todos los grados asignados. La activacion, evaluabilidad y posicion seguiran siendo configurables por grado.

Las categorias actuales se conservaran para no perder informacion: gakka, dojo, cinturon, vocabulario, kihon, goho, juho, tecnica, desplazamiento, ukemi, kata tanen, kata sotai, howa, shakujo, comportamiento, juego y otro.

## Estados y eliminacion

`Activo` y `Evaluable` son controles diferentes:

- Activo: puede aparecer en clases, planificacion y consulta infantil.
- Evaluable: se preselecciona para examenes del grado cuando tambien esta activo.

Un contenido no evaluable puede seguir siendo parte normal de las clases.

Reglas de retirada:

- Si nunca se ha utilizado, puede eliminarse definitivamente.
- Si aparece en clases, historicos o examenes, se archiva.
- Un contenido archivado deja de ofrecerse en nuevas clases y examenes.
- Los registros historicos conservan el nombre y la relacion original.
- Un contenido archivado puede restaurarse.

## Examen infantil progresivo

La creacion permanece en `Examenes` y utiliza el catalogo infantil como fuente.

### Flujo

1. El administrador elige `Ninos - progresivo`, fecha, examinadores y alumnos.
2. El sistema identifica los grados actuales y objetivos implicados en la convocatoria.
3. Muestra el temario agrupado por grado y preselecciona todos los contenidos activos y evaluables correspondientes.
4. El administrador puede desmarcar, anadir o reordenar contenidos antes de crear el examen.
5. La seleccion conserva los cortes progresivos por grado para que los alumnos de grados inferiores terminen cuando corresponda.
6. Al confirmar, el examen guarda una instantanea completa del contenido seleccionado.

La instantanea incluye nombre, descripcion, categoria, grado/corte, orden y peso. Las ediciones posteriores del catalogo no alteran la convocatoria creada ni sus resultados.

La duplicacion de un examen seguira copiando la instantanea del examen original. Antes de crear la copia, el administrador podra revisar alumnos, examinadores y temario.

## Integracion con clases y fichas

El catalogo se utilizara en:

- Programa tecnico de las clases infantiles normales.
- Modo dojo infantil.
- Enlaces de sustituto para ninos.
- Historial de practica infantil.
- Fichas individuales de alumnos.
- Examenes infantiles progresivos.

Las clases solo ofreceran contenido activo. Los historicos continuaran mostrando contenidos aunque despues se archiven.

## Modelo de datos

El modelo conceptual separara:

- El contenido compartido: nombre, categoria y descripcion.
- La asignacion a grado: grado, orden, activo y evaluable.

La implementacion debe mantener compatibilidad con `child_syllabus_items`, `child_syllabus_history`, `child_class_plans` y `exam_event_items`. La migracion reutilizara los identificadores o mantendra una correspondencia estable para no romper referencias existentes.

Los contenidos repetidos entre grados se consolidaran solo cuando la coincidencia sea segura. Las posibles colisiones o variaciones de nombre se conservaran separadas para revision manual, evitando fusiones destructivas.

## Migracion

1. Inventariar el contenido actual por grado y sus referencias.
2. Crear la estructura de contenido compartido y asignaciones por grado.
3. Migrar cada elemento existente conservando su estado, orden y evaluabilidad.
4. Vincular duplicados seguros como un unico contenido compartido con varias asignaciones.
5. Mantener compatibilidad con historicos y examenes existentes.
6. Verificar conteos por grado antes y despues de la migracion.
7. Activar la nueva pantalla y actualizar los consumidores de clases, fichas y examenes.

La migracion debe ser repetible o estar protegida frente a una segunda ejecucion.

## Validacion

Se verificara:

- Alta, edicion y asignacion de un contenido a varios grados.
- Estados activo y evaluable independientes por grado.
- Reordenacion sin afectar otros grados.
- Archivado, restauracion y eliminacion cuando nunca se uso.
- Conservacion de historicos tras archivar.
- Carga del mismo catalogo en clase normal, dojo y sustituto infantil.
- Preseleccion correcta del temario de los grados convocados.
- Edicion de la seleccion antes de crear un examen.
- Cortes progresivos correctos durante la evaluacion.
- Inmutabilidad de examenes ya creados tras editar el catalogo.
- Duplicacion de examen con revision de temario, alumnos y examinadores.
- Funcionamiento en escritorio, movil, iPad e iPad mini.

## Criterios de aceptacion

- Adultos y ninos no comparten pantallas ni reglas de mantenimiento de temario.
- Existe una unica fuente de verdad para el contenido infantil nuevo.
- Un contenido puede pertenecer a varios grados sin duplicar su definicion.
- Las clases solo muestran contenido activo.
- Los examenes preseleccionan contenido activo y evaluable, pero permiten modificarlo.
- Los examenes progresivos mantienen sus cortes por grado.
- Los historicos y examenes anteriores no cambian ni pierden nombres.
- El administrador puede comprender el estado del temario sin navegar por `Areas tecnicas`.
