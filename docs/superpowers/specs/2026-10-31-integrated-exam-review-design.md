# Evaluacion y revision final de examenes integrados SKBC

Fecha: 31 de octubre de 2026.
Estado: diseno aprobado por el usuario e implementado; pruebas y revision de codigo superadas; despliegue en curso.

## Objetivo

Completar el flujo solicitado: evaluar personalmente desde SKBC, revisar el informe detallado de cada alumno, ajustar puntuaciones, decidir el resultado final y registrar las decisiones para actualizar las fichas y los grados.

## Enfoque recomendado y alternativas

Se recomienda una revision integrada por alumno, separando notas originales, ajustes del profesor y decision final. Conserva la evaluacion recibida y permite justificar una decision distinta del porcentaje calculado.

Una alternativa menor seria anadir acceso directo y un informe de lectura: resuelve la consulta, pero deja pendientes los ajustes y la decision final solicitados. Otra alternativa seria editar directamente las notas originales: requiere menos datos nuevos, pero pierde la distincion entre evaluacion recibida y correccion administrativa. Se descartan ambas por no cubrir el flujo completo con trazabilidad.

## Experiencia propuesta

1. Al crear el examen, opcion «Examino yo». Crea una asignacion propia y vuelve a «Examenes creados», pendiente hasta que se abra explicitamente. Nunca comienza la evaluacion al crear el examen. Los enlaces compartibles siguen disponibles para otros examinadores. Un examen existente ofrece «Examinar como...» para una asignacion propia y «Revisar evaluaciones» despues del envio. Si existen varias asignaciones, el profesor identifica cual es la suya: no se deduce identidad por coincidencia de nombre.
2. Evaluacion en grupo por tecnica o ejercicio, mostrando juntos todos los alumnos que continuan. Cada alumno tiene cuatro opciones de un toque: Bien (10), Mejorable (5), Necesita aprenderlo (0) y Omitir. Omitir queda sin nota y se excluye de la media; no cuenta como cero. Cada examinador guarda su valoracion independiente; la puntuacion original es la media de todos los examinadores que han valorado ese punto. Las observaciones opcionales quedan plegadas. Se mantienen los cortes infantiles y el alcance adulto actual. Tras enviar desde la pantalla interna, volver al panel de revision del examen. La revision final del profesor mantiene ajustes numericos y decision independiente.
3. Panel con siguiente paso visible y estados: pendiente de evaluar, pendiente de revision, revisado y registrado. Abrir un alumno muestra puntos evaluados, notas por examinador, media, porcentaje, observaciones y puntos con menor puntuacion. Los cortes no puntuan y lo no evaluado se distingue de una nota cero. Las sugerencias automaticas describen las puntuaciones y no inventan diagnosticos tecnicos.
4. El profesor puede subir o bajar la puntuacion final de una tecnica, anadir observaciones y revertir un ajuste. Se muestran nota original y ajustada. La nota efectiva usa el ajuste administrativo cuando existe, y en caso contrario la media de examinadores validos.
5. Decision independiente del porcentaje: «Aprobar», «Suspender» o «Pendiente de revision». Guardar tambien una conclusion y aspectos a mejorar. Pedir un motivo si la decision contradice el umbral automatico. Guardar revision no modifica el grado ni registra un examen oficial.
6. Paso final «Registrar resultados y actualizar fichas», con resumen de aprobados, suspensos y pendientes. Requiere decision explicita para cada alumno y evaluacion recibida. Los aprobados reciben su grado objetivo; los suspensos conservan su grado y quedan con su informe y decision guardados en el examen integrado. Tras cerrar, mostrar enlaces al informe, ficha e historial, junto con el resultado real de las actualizaciones.

## Datos y arquitectura

- Reutilizar las tablas exam_events, exam_event_students, exam_event_items, exam_event_examiners, exam_event_scores y exam_event_reviews.
- Cargar y guardar notes en las puntuaciones y review_notes, reviewed_by y reviewed_at en revisiones; actualmente existen campos que el panel no expone.
- Guardar ajustes por alumno e item en un sobre JSON versionado dentro del campo review_notes existente, junto con conclusion, decision y referencias de registro/documentos. Esta concrecion tecnica reutiliza el almacenamiento disponible sin una migracion de produccion. Las puntuaciones de examinadores permanecen intactas. Validar pertenencia al mismo examen, rangos y permisos de administracion.
- Reutilizar componentes de evaluacion entre la ruta interna autenticada y la ruta existente de examinadores. Todas las operaciones administrativas comprueban acceso interno en el servidor. El token de un examinador no concede permisos de revision o cierre.
- Centralizar el calculo de notas originales, ajustadas y decisiones finales en logica comprobable, compartida por pantalla, cierre e informes. La autorizacion final no se deduce de la nota automatica.
- Un recalculo no sustituye decisiones humanas guardadas. Si cambia la evaluacion despues de una revision, marcar esa revision como pendiente de confirmar sin borrar sus ajustes o notas.
- Los examenes anteriores sin revision humana quedan pendientes de revisar al abrir el nuevo flujo. Los ya cerrados permanecen de consulta y no se registran de nuevo.

## Registro y actualizacion

- Usar el registro oficial existente para los aprobados y conservar referencias estables entre alumno del evento y examen oficial para reintentos seguros.
- Validar todas las revisiones antes de comenzar el registro. El cierre debe controlar concurrencia y recordar los resultados registrados para que un doble clic o un reintento no genere promociones ni historiales duplicados.
- Actualizar members.grade, fecha de ultimo examen, historial y calculos dependientes mediante el servicio oficial, e invalidar las vistas que leen esos datos: ficha publica, detalle y lista de kenshis, areas tecnicas, dojo, ranking, avisos y proximos examenes segun sus dependencias reales.
- Los informes utilizan puntuaciones efectivas, conclusion y decision final, incluyendo suspensos. Generar diploma unicamente para aprobados.
- Si falla Drive o el diploma, indicar que el resultado academico esta registrado y que documento falta; permitir reintentar solo ese documento. No anunciar envio completo si hay errores ni repetir la promocion para regenerar documentos.
- Ninguna simulacion existente se convierte en examen oficial como efecto de implementar o desplegar. El profesor debe revisar y ejecutar el registro final.

## Pruebas y verificacion

- Acceso directo propio, otros examinadores y retorno a revision.
- Informe con varios examinadores, cortes infantiles, puntos no evaluados y notas cero.
- Ajustes hacia arriba y abajo; reversion y persistencia despues de recalcular.
- Aprobar por decision docente con nota bajo el umbral y suspender con nota sobre el umbral; motivo y decision final coherentes en pantalla e informe.
- Bloqueo de registro con revisiones pendientes y proteccion frente a accesos de examinador a acciones administrativas.
- Registro de aprobados, conservacion de grado en suspensos, idempotencia y recuperacion de fallos de documentos.
- Verificacion de actualizacion en las superficies que muestran el grado y de las pruebas existentes del programa infantil y examenes.
- Compilacion, TypeScript, revision de codigo y comprobacion del despliegue. Usar evaluaciones de prueba y no cerrar ni registrar las del usuario durante la validacion.

## Limites

No se cambia el temario, la progresion de grados ni las evaluaciones historicas originales. Esta propuesta no añade notificaciones a familias ni envio de mensajes. La publicacion del nuevo flujo se realiza tras aprobar el diseno y superar las verificaciones.

### Recorrido por actividad (31/10/2026)
Cada tecnica o ejercicio ocupa una pantalla con todos los kenshis a quienes corresponde. Continuar requiere una valoracion u Omitir para cada uno. Los cortes tienen pantalla propia con quienes se sientan y quienes continuan. Anterior conserva las valoraciones y observaciones. El envio se realiza en una ultima pantalla independiente.

Validacion: recorrido local de dos alumnos con distintos grados, cuatro opciones, bloqueo parcial, regreso conservando notas, cortes y envio completo de FormData; typecheck, build y regresiones de navegacion y evaluacion correctos.

