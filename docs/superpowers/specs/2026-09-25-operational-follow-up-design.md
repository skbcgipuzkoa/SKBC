# Seguimiento operativo del dojo

## Objetivo

Incorporar cuatro ayudas de gestion conectadas entre si: alumnos provisionales, alertas operativas, notas internas por alumno y un resumen semanal. Deben funcionar en el panel y, cuando corresponda, en Telegram, sin alterar los calculos actuales de examenes, tecnica, antiguedad o facturacion.

## 1. Alumnos provisionales

Durante la toma de asistencia se podra crear un invitado indicando solamente nombre y grupo (`kids` o `adults`). El invitado quedara disponible en la clase actual y en futuras asistencias mientras siga pendiente.

Los provisionales se almacenaran separados de `members`. Sus asistencias se relacionaran con el registro provisional y no participaran en progresion tecnica, examenes, antiguedad, cuotas, rankings ni estadisticas propias de kenshis. Si se anade plan tecnico a una clase con provisionales, la clase se conserva, pero no se genera historial tecnico para ellos.

La conversion pedira seleccionar un kenshi ya creado o crear/completar el kenshi definitivo. En una transaccion logica se reasignaran al miembro todas las asistencias del provisional que no existan ya para ese miembro y esa clase. Los duplicados se omitiran. El provisional quedara convertido, con referencia al miembro, y no volvera a aparecer como pendiente. Deshacer la conversion no forma parte de esta version.

## 2. Notas internas

Cada ficha de kenshi tendra un historial cronologico de notas internas con fecha, autor, texto, estado e indicador de importancia. Se podran crear notas, marcarlas o desmarcarlas como importantes y resolverlas sin borrarlas. Las notas resueltas seguiran visibles en el historial.

Las notas seran exclusivamente administrativas: no apareceran en el area privada del alumno, informes familiares ni comunicaciones automaticas. Las notas importantes abiertas alimentaran la bandeja de alertas y el resumen semanal.

## 3. Alertas operativas

La pagina de alertas existente incorporara una bandeja calculada a partir de datos reales. La primera version incluira:

- clases que siguen abiertas o en correccion;
- provisionales pendientes de convertir;
- alumnos activos sin asistencia reciente;
- pruebas gratuitas proximas a finalizar o finalizadas sin revisar;
- notas importantes abiertas;
- fichas activas con datos esenciales incompletos.

Los umbrales se definiran en un modulo central para poder convertirlos en configuracion mas adelante. Inicialmente, la ausencia relevante sera de 21 dias para ninos y 30 dias para adultos. No se alertara por ausencia a quien se haya incorporado dentro del propio umbral ni durante cierres de calendario que cubran el periodo.

Cada alerta tendra una clave estable. Las alertas calculadas no se duplicaran; podran descartarse mediante el mecanismo actual y reapareceran solo si nace una incidencia nueva con otra clave. Las notas se resolveran desde su origen. Las alertas urgentes o nuevas se incluiran en Telegram; el panel mantendra la vista completa.

## 4. Resumen semanal

Cada lunes a las 08:00, zona `Europe/Madrid`, se generara un resumen de la semana natural anterior. Mostrara:

- clases celebradas, abiertas y corregidas;
- asistencias totales, de ninos, de adultos y asistentes unicos;
- kenshis nuevos y provisionales creados o pendientes;
- alumnos con ausencia relevante;
- notas importantes abiertas;
- otras tareas operativas pendientes.

El mismo contenido se guardara para consulta en el panel y se enviara por Telegram. Una clave por semana y canal garantizara idempotencia: reintentar el proceso no creara dos resumenes ni dos mensajes. Si Telegram falla, el resumen del panel seguira disponible y el envio podra reintentarse.

## Arquitectura y datos

Se anadiran tablas para `provisional_members`, `provisional_attendance`, `member_notes`, `weekly_summaries` y `notification_deliveries`. Las migraciones incluiran indices y restricciones de unicidad para asistencia y envios. Las politicas de acceso seguiran el patron administrativo existente.

La logica de dominio se dividira en servicios independientes:

- provisionales y conversion;
- calculo de alertas;
- notas de miembro;
- agregacion y entrega semanal.

Las paginas y acciones reutilizaran esos servicios. El generador de Telegram existente recibira las nuevas secciones sin crear un segundo sistema de mensajeria. El proceso semanal se expondra mediante una ruta protegida compatible con el programador de Vercel y tambien podra ejecutarse manualmente para recuperacion.

## Interfaz

Los formularios de asistencia de dojo y clase completa tendran una accion compacta `Anadir invitado`. La fila provisional se distinguira claramente y permitira registrar o quitar su asistencia igual que el resto, respetando los avisos de cambios sin guardar.

La lista de Kenshis ofrecera una entrada visible para provisionales pendientes y su conversion. La ficha del alumno incluira el bloque de notas internas. La pagina de alertas conservara sus controles actuales y anadira filtros por tipo y prioridad. El panel incluira el ultimo resumen semanal y acceso al historial.

## Errores y consistencia

La conversion no eliminara el provisional hasta terminar la reasignacion. Los conflictos de asistencia se resolveran conservando una sola asistencia por clase. Ningun fallo de Telegram revertira datos administrativos. Los errores de envio quedaran registrados para reintento.

Las consultas toleraran que una migracion aun no se haya aplicado durante un despliegue, pero la funcionalidad solo se considerara terminada tras aplicar y verificar las migraciones de produccion.

## Verificacion

Se cubriran con pruebas las reglas de exclusion del provisional, conversion sin duplicados, umbrales de ausencia, claves estables de alerta, periodo semanal e idempotencia de envios. Tambien se verificaran los flujos de interfaz, `typecheck`, compilacion de produccion, migraciones, despliegue de Vercel y respuesta de `https://skbc.vercel.app`.

## Fuera de alcance

- Configuracion visual de umbrales y horarios.
- Comunicaciones directas con familias desde las notas.
- Facturacion de provisionales.
- Historial tecnico previo a la conversion.
- Deshacer automaticamente una conversion.
