# Semaforo de examen y bloques de revision especial

## Objetivo

Separar la tecnica fundamental de los contenidos que necesitan una revision global del profesor. El semaforo no tratara Umpo Ho, katas y ukemis como si fueran tecnicas Goho o Juho sujetas al mismo numero de repeticiones.

## Regla de estados

- **AZUL**: el kenshi todavia no ha cumplido el tiempo minimo para su siguiente grado. Este estado conserva prioridad sobre los demas.
- **ROJO**: ya esta en plazo, pero no cumple la asistencia minima o le faltan tecnicas fundamentales Goho/Juho exigidas para el grado.
- **AMARILLO**: cumple tiempo, asistencia y tecnica fundamental, pero tiene bloques especiales pendientes de revision por el profesor.
- **VERDE**: cumple tiempo, asistencia y tecnica fundamental, y los bloques especiales exigidos han sido revisados.
- **GRIS/INACTIVO**: mantienen su comportamiento actual de reactivacion e inactividad.

## Clasificacion de contenidos

### Tecnica fundamental

Las tecnicas Goho y Juho mantienen el requisito configurable de repeticiones. Sus carencias pueden bloquear la convocatoria y producir semaforo rojo.

### Revision especial

Los siguientes contenidos no se contaran como tecnicas convencionales ni exigiran dos repeticiones individuales:

- Umpo Ho.
- Katas tan-en y sotai.
- Ukemis.
- Otros contenidos que se identifiquen expresamente como bloque global de revision.

Estos contenidos deben constar en el programa del grado y en el historial, pero su ausencia produce amarillo y una recomendacion para programar una o varias clases de repaso.

## Confirmacion del profesor

Un bloque especial quedara revisado cuando exista un registro de practica completado para ese kenshi y contenido. El profesor podra registrarlo desde una clase conjunta o manualmente desde el flujo tecnico existente. No se necesita una cantidad minima de repeticiones: una practica registrada confirma que el bloque ha sido revisado.

## Mensajes

El aviso del semaforo diferenciara ambos tipos de pendiente:

- Rojo: `No convocar: faltan tecnicas fundamentales o asistencia minima.`
- Amarillo: `Revision del profesor pendiente: Mae ukemi, Tenchi ken dai ni. Programar una o varias clases de repaso.`
- Verde: confirmara que asistencia, tecnica fundamental y bloques especiales estan revisados.

Si el kenshi esta azul, el aviso seguira mostrando la fecha de elegibilidad y, como informacion secundaria, los bloques especiales que conviene revisar antes de esa fecha.

## Datos y compatibilidad

La clasificacion utilizara primero `category` y `content_type` de `techniques`. Se mantendra una deteccion compatible por nombre para registros antiguos incompletos. No se borrara historial y no sera necesaria una tabla nueva.

Tras publicar el cambio se recalcularan todos los semaforos activos para actualizar las fichas, Proximos examenes, Inicio, avisos y Telegram con la misma regla.

## Verificacion

- Caso rojo por falta de Goho/Juho.
- Caso amarillo con tecnica fundamental completa y kata/ukemi/Umpo Ho pendiente.
- Caso verde con todos los bloques revisados.
- Caso azul que informa de pendientes sin cambiar la prioridad temporal.
- Comprobacion de Maider y Uxue tras el recalculo.
- Compilacion, pruebas del calculo y validacion en produccion.
