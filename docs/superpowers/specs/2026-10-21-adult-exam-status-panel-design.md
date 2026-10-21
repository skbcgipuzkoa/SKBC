# Panel visual de estado de examen para adultos

## Objetivo

Sustituir el aviso textual de examen de la ficha pública adulta por un resumen visual que explique de un vistazo el estado real de la convocatoria, sus requisitos cumplidos y los motivos pendientes. La ficha infantil no cambia.

## Alcance

- Solo se modifica la ficha individual pública de adultos.
- Administración conserva el diagnóstico técnico completo y las revisiones internas del profesor.
- La ficha pública no menciona revisiones internas de kata, ukemi, Umpo Ho u otros bloques especiales.
- No se añaden consultas a Supabase ni nuevas llamadas externas.

## Composición

El panel reemplaza la caja actual de semáforo y contiene:

1. Un indicador circular con el color del semáforo almacenado.
2. El título público del estado y la próxima convocatoria prevista.
3. Cuatro criterios independientes:
   - Tiempo mínimo.
   - Asistencia.
   - Técnicas fundamentales Goho/Juho.
   - Actividad reciente.
4. Cada criterio muestra etiqueta, valor comprensible y barra de progreso.
5. Una orientación breve al final, sin texto técnico interno.

## Estados visuales

- Verde: requisito cubierto.
- Amarillo: requisito en seguimiento o próximo a completarse.
- Rojo: requisito que bloquea la convocatoria.
- Azul: el tiempo mínimo aún no ha llegado.
- Gris: inactividad o ausencia de datos suficientes.

El color general del indicador circular siempre coincide con el semáforo calculado por el sistema. Los colores de cada criterio reflejan su propio estado y no sustituyen la decisión global.

## Datos y cálculo

El panel reutiliza los campos ya cargados en la ficha: `semaphore`, `next_exam_on`, `exam_notice`, `attendance_count`, `minimum_attendance`, `total_cycle_sessions` y el historial de asistencia disponible.

El detalle técnico se extrae de `exam_notice` mediante el parser común existente. Para Goho/Juho se muestran las técnicas fundamentales que cumplen las repeticiones mínimas frente al total requerido cuando esos datos puedan derivarse correctamente. Si el aviso solo contiene pendientes, se muestra el número pendiente sin inventar un total.

La actividad reciente reutiliza el mismo cálculo de reactivación empleado por la explicación pública actual. El panel no recalcula ni modifica el semáforo.

## Rendimiento

La representación se calcula en memoria durante el renderizado del servidor. No se añaden consultas, imágenes, JavaScript cliente ni animaciones continuas. El HTML y CSS adicionales son pequeños y responsivos.

## Responsive y accesibilidad

- Móvil: indicador y cabecera en una fila compacta; criterios en una columna.
- iPad y escritorio: criterios en una cuadrícula de dos columnas cuando haya espacio.
- Las barras incluyen texto visible, por lo que el color no es el único medio de información.
- El indicador tiene una etiqueta textual del estado.

## Administración

La ficha administrativa mantiene el listado detallado de motivos: ventana temporal, asistencia, bloqueo fundamental, revisiones especiales e implicación. Este trabajo no reduce ni oculta información al profesor.

## Verificación

- Comprobar estados azul, amarillo, rojo, verde y gris con datos sintéticos del parser.
- Verificar que no aparecen revisiones internas en la ficha pública.
- Ejecutar las comprobaciones del semáforo y la compilación de producción.
- Revisar visualmente móvil, iPad Mini, iPad y escritorio sin desbordamientos.
