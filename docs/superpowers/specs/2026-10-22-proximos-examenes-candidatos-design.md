# Posibles candidatos para la siguiente convocatoria

## Objetivo

Mejorar la pantalla `Proximos examenes` para que, ademas del estado oficial de los semaforos, muestre una seleccion util de alumnos que estan cerca de poder presentarse. Esta seleccion es orientativa para el profesor: no cambia el semaforo, no convoca automaticamente y no rebaja ningun requisito oficial.

## Criterios de inclusion

Un alumno aparecera como posible candidato cuando este activo y cumpla todas estas condiciones:

- Ya ha cumplido el tiempo minimo o le faltan como maximo 60 dias.
- Ha alcanzado al menos el 75 % de las asistencias minimas exigidas para su siguiente examen.
- Cumple la actividad reciente exigida por el sistema: al menos 6 asistencias en 60 dias y 1 en los ultimos 21 dias.
- En adultos, ha trabajado al menos el 75 % de las tecnicas Goho y Juho exigidas para el siguiente grado. Las tecnicas de repaso no cuentan como progreso de examen.

Los alumnos con semaforo verde o amarillo se incluiran automaticamente mientras esten activos, porque ya requieren valoracion o revision del profesor.

Los alumnos inactivos, sin siguiente grado calculable o que necesiten reactivacion por falta de actividad reciente no apareceran como candidatos.

## Presentacion

La capsula `Sin datos` se sustituira por `Posibles candidatos`, con el numero total encontrado. Al pulsarla, la tabla se filtrara para mostrar exclusivamente esos alumnos.

Cada candidato mostrara informacion breve y verificable:

- Fecha en la que cumple el tiempo minimo o indicacion de que ya esta cumplido.
- Asistencias actuales, minimo requerido y porcentaje alcanzado.
- Actividad de los ultimos 60 y 21 dias.
- En adultos, porcentaje de temario Goho/Juho trabajado y progreso de repeticiones como informacion adicional.
- Motivo de inclusion, por ejemplo `Cumple el tiempo en 42 dias`, `Asistencia al 84 %` o `Pendiente de revision especial`.
- Requisitos que todavia faltan para estar realmente preparado.

La capsula y el filtro no usaran el color verde para evitar confundir `posible candidato` con `apto`. Se empleara un tono informativo diferenciado y se mantendran visibles los colores oficiales del semaforo de cada alumno.

## Calculo y datos

El calculo reutilizara las mismas fuentes de verdad que las fichas individuales y los semaforos:

- Ciclo y tiempo minimo desde el ultimo examen o inicio aplicable.
- Historial real de asistencias del ciclo y ventanas recientes.
- Temario oficial del siguiente grado.
- Historial tecnico individual, excluyendo registros marcados como repaso para el progreso de examen.

No se derivaran porcentajes leyendo textos de `exam_notice`. Los criterios se calcularan con datos estructurados para evitar divergencias entre la ficha, el semaforo y `Proximos examenes`.

## Casos limite

- Si faltan datos esenciales, el alumno conserva su estado actual pero no entra como candidato.
- Si un requisito supera el 100 %, la barra se limita visualmente al 100 % y conserva el valor real en el texto.
- Un alumno puede dejar de ser candidato si pierde la condicion de actividad reciente.
- Cumplir los criterios de proximidad nunca cambia automaticamente su semaforo oficial.

## Verificacion

Se anadiran pruebas para los limites de 60 dias y 75 %, actividad reciente, exclusion de inactivos, inclusion de verde/amarillo y calculo tecnico sin repasos. Tambien se comprobara la pantalla en escritorio, movil, iPad y iPad mini, incluyendo el filtrado desde la nueva capsula.
