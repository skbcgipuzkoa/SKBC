# Puntos puntuales y finalizacion anticipada

El usuario confirma que +1/-1 modifica el total acumulado, no la nota sobre diez. Cada movimiento pertenece a un alumno y examinador y conserva su motivo. Con varios examinadores se aplica la media de sus movimientos, incluyendo quienes no hicieron ajustes. El porcentaje queda limitado entre 0 y 100 sin modificar las notas originales.

Terminar examen aqui abre una confirmacion con motivo. Se incluye la actividad actual solo si todos sus alumnos tienen nota u Omitir; en otro caso se termina en la ultima actividad completa anterior. El envio final es independiente y puede cancelarse la finalizacion antes de enviarlo. No se aceptan recorridos sin ninguna puntuacion numerica. Las actividades posteriores se registran como no realizadas, excluidas del denominador. Omitir conserva su significado habitual.

La revision interna y el informe muestran movimientos, examinador, motivo y punto de finalizacion. El profesor conserva la decision final y el registro de grados sigue siendo una accion separada.

Se conservan datos en un sobre versionado en las observaciones existentes, compatible con texto antiguo y sin migracion. El servidor valida la pertenencia de alumnos, notas, motivos, limite y recorrido; no confia en las pantallas ocultas del cliente.
