# Filtros desde el resumen de Kenshis

## Objetivo

Convertir las tarjetas de resumen de la pagina de Kenshis en el control principal de filtrado, evitando duplicar esa funcion con los desplegables actuales de clase y estado.

## Interaccion

El resumen tendra cuatro tarjetas pulsables:

- **Activos**: muestra todos los kenshis activos, sin filtrar por clase.
- **Ninos**: muestra solamente los kenshis activos de clase infantil.
- **Adultos**: muestra solamente los kenshis activos de clase adulta.
- **Inactivos**: muestra todos los kenshis inactivos, sin filtrar por clase.

La tarjeta seleccionada se distinguira mediante fondo, borde y estado accesible. Toda la tarjeta sera pulsable y funcionara como enlace, por lo que la navegacion sera compatible con el historial y el boton Atrás del navegador.

## Busqueda y navegacion

El formulario inferior conservara unicamente el campo de busqueda. Al buscar, se mantendra el filtro seleccionado. Al cambiar de tarjeta, tambien se conservara el texto buscado.

El filtro y la busqueda viajaran en los parametros de la URL. Los enlaces a un alumno, una ficha y el alta de un nuevo kenshi seguiran incluyendo la ruta de retorno completa. Al volver desde esas pantallas, se restauraran el filtro y la busqueda anteriores.

No se guardara el filtro en cookies ni almacenamiento local. Si el usuario sale de Kenshis a otro menu y vuelve mediante la navegacion lateral, la pagina se abrira en su estado inicial: **Activos**, mostrando todos los kenshis activos.

## Contadores

Las tarjetas mostraran cantidades globales independientes de la busqueda:

- total de activos;
- total de ninos activos;
- total de adultos activos;
- total de inactivos.

La tarjeta `Mostrando` desaparecera. El numero de filas resultantes se indicara junto al buscador o en la zona inmediata de resultados, sin crear una quinta tarjeta.

## Implementacion

La pagina seguira siendo un componente de servidor. Se derivara un unico filtro seleccionado a partir de `class` y `status`, con `active` como valor inicial. Las tarjetas generaran enlaces con `URLSearchParams`, preservando `q` y sustituyendo exclusivamente los parametros de clase y estado.

Se reutilizaran los estilos existentes de las tarjetas y se anadiran estados de interaccion, foco y seleccion. Los desplegables `Clase`, `Estado` y el boton `Filtrar` se eliminaran.

## Casos de comprobacion

- La entrada desde el menu muestra todos los activos.
- Cada tarjeta devuelve el grupo y el contador esperados.
- La busqueda funciona dentro de cada filtro.
- Cambiar de tarjeta conserva la busqueda.
- Abrir un alumno y volver conserva filtro y busqueda.
- Abrir una ficha y volver conserva filtro y busqueda.
- Salir por el menu y volver reinicia a Activos.
- La seleccion es visible y navegable con teclado.
- El diseno mantiene su legibilidad en escritorio y movil.
- La compilacion de produccion termina correctamente y la version desplegada se verifica en `skbc.vercel.app`.

## Reversibilidad

El cambio se publicara en un commit aislado. Si la experiencia no convence, se podra revertir ese commit y desplegar de nuevo para recuperar los desplegables y la tarjeta `Mostrando` actuales.
