# Edicion libre de clases abiertas y reabiertas

## Objetivo

Simplificar la edicion de una clase para que el profesor pueda moverse libremente entre asistencia y programa tecnico, guardar tantas veces como necesite y seguir modificando cualquier apartado hasta que decida cerrar la clase de forma explicita.

El comportamiento debe ser coherente en Modo dojo, Clase completa y una clase reabierta para correccion, en movil, iPad Mini, iPad y escritorio.

## Problema actual

El flujo actual mezcla tres acciones distintas: guardar datos, avanzar al siguiente apartado y cerrar la clase. Algunos formularios redirigen automaticamente al siguiente paso despues de guardar, mientras que otros controles solo aparecen en determinadas etapas. Esto dificulta volver atras, anadir otra tecnica, revisar una asistencia o corregir una clase reabierta.

## Modelo de interaccion

La clase abierta se comportara como un espacio de trabajo editable, no como un asistente lineal obligatorio.

Cada vista mostrara cuatro acciones con responsabilidades separadas:

- **Anterior:** navega al apartado anterior sin guardar ni cerrar.
- **Guardar:** guarda exclusivamente los cambios del apartado actual y permanece en ese apartado.
- **Siguiente:** navega al apartado siguiente sin guardar ni cerrar.
- **Cerrar clase:** abre la confirmacion de cierre y, tras confirmarla, ejecuta el cierre completo.

La navegacion superior permitira abrir directamente cualquier apartado disponible:

1. Asistencia de ninos.
2. Tecnica de ninos.
3. Tecnica de adultos.
4. Asistencia de adultos.
5. Revisar y cerrar.
6. Pedidos y entregas, conservando el retorno al apartado actual.

Los apartados inexistentes para una clase se omitiran. Por ejemplo, una clase exclusivamente infantil no mostrara las secciones de adultos.

## Guardado

Guardar nunca cambiara automaticamente de apartado. Tras completar la operacion:

- La pagina volvera al mismo apartado.
- Se mostrara una confirmacion visible de cambios guardados.
- Los valores guardados se volveran a cargar desde la base de datos.
- El profesor podra seguir modificando y volver a guardar.

Esto se aplicara al programa tecnico adulto, plan infantil, tecnicas manuales, trabajo por grupos y asistencias.

Los botones con textos como `Guardar tecnicas y pasar a adultos` se sustituiran por acciones simples como `Guardar tecnicas`. La navegacion se realizara con los controles Anterior y Siguiente.

## Barra de control

Se creara una barra comun reutilizable para Modo dojo y Clase completa.

- En movil permanecera fija en la parte inferior, respetando el area segura del dispositivo.
- En iPad y escritorio permanecera visible bajo la navegacion de secciones.
- La accion Guardar sera la principal del apartado editable.
- Cerrar clase tendra una presentacion diferenciada y no se confundira con Guardar o Siguiente.
- Los controles mantendran dimensiones estables para evitar saltos de interfaz.

Cuando un apartado no tenga formulario editable, la barra mostrara Anterior, Siguiente y Cerrar clase, sin inventar una accion Guardar.

## Cambios sin guardar

Los formularios editables detectaran cambios locales respecto a los valores cargados.

Si el usuario intenta navegar a otro apartado con cambios pendientes, se mostrara una confirmacion que permita:

- Permanecer y guardar.
- Salir sin guardar.

No se realizara guardado automatico silencioso. El cierre de clase tampoco descartara cambios locales sin advertirlo.

## Clases reabiertas

Una clase reabierta mostrara el estado `En correccion`, pero utilizara la misma navegacion y los mismos controles que una clase abierta.

- Podra recorrerse cualquier apartado en cualquier orden.
- Cada apartado podra guardarse varias veces.
- Los datos anteriores se sustituiran de acuerdo con la logica de correccion existente; no se duplicaran historiales ni contadores.
- La accion final sera `Guardar correcciones y cerrar clase`.

No habra un segundo flujo de edicion exclusivo para correcciones. La diferencia sera el estado visual y la accion de cierre final.

## Cierre

Cerrar clase sera la unica accion que consolide los efectos finales en fichas, rankings, historiales y progreso tecnico.

Antes de ejecutar el cierre se mostrara una revision con:

- Asistencia infantil registrada.
- Trabajo tecnico infantil registrado.
- Tecnicas adultas marcadas.
- Asistencia adulta registrada.
- Advertencias relevantes, como una clase adulta sin tecnicas marcadas.

La confirmacion conservara la ventana de progreso real ya existente. Al terminar mostrara un resultado verde inequívoco. Si falla, la clase seguira abierta o en correccion y el usuario podra reintentar sin perder los guardados previos.

## Componentes y limites

La implementacion reutilizara las acciones de servidor existentes y separara la redireccion posterior de la operacion de guardado.

Se introduciran componentes pequenos y compartidos:

- Navegacion de secciones con orden y estado.
- Barra de control contextual.
- Deteccion de cambios pendientes para formularios interactivos.
- Configuracion del flujo que determine apartado anterior, actual y siguiente.

Modo dojo y Clase completa conservaran sus presentaciones propias, pero usaran la misma definicion de secciones y comportamiento de guardado. No se duplicara la logica de orden o disponibilidad de pasos.

## Compatibilidad

El cambio no modificara el modelo de datos ni la forma en que se calculan asistencia, tecnicas, rankings o fichas. Tampoco cambiara los enlaces de sustituto en esta fase.

Los enlaces existentes a apartados concretos seguiran funcionando mediante los parametros `step` y `section`, con normalizacion a una seccion valida cuando el apartado solicitado no exista.

## Errores y recuperacion

- Un guardado fallido permanecera en el mismo apartado y mostrara el error junto al formulario.
- Los datos confirmados anteriormente no se revertiran por un fallo posterior.
- Una clase cerrada no sera editable salvo que se reabra mediante la accion administrativa existente.
- Si otro usuario cierra la clase mientras alguien la edita, la siguiente accion detectara el estado cerrado e impedira nuevos cambios, mostrando `Clase cerrada`.

## Verificacion

Se cubriran como minimo estos escenarios:

1. Guardar tecnicas adultas permanece en Tecnica adultos.
2. Guardar asistencia permanece en el apartado de asistencia.
3. Anterior y Siguiente navegan sin cerrar la clase.
4. Las pestañas permiten cambiar de apartado en cualquier orden.
5. Se puede guardar un apartado varias veces.
6. Una tecnica manual puede anadirse y quitarse antes del cierre.
7. Una clase reabierta usa el mismo flujo y no duplica historiales al volver a cerrar.
8. Los cambios sin guardar generan una advertencia al navegar.
9. Un cierre concurrente bloquea posteriores modificaciones.
10. La barra no tapa contenido ni controles en movil, iPad Mini, iPad y escritorio.
11. El cierre muestra progreso real, resultado correcto y recuperacion ante errores.

## Fuera de alcance

- Redisenar el modo sustituto.
- Cambiar los calculos de ranking, asistencia o progreso tecnico.
- Introducir guardado automatico en segundo plano.
- Modificar el esquema de Supabase.
