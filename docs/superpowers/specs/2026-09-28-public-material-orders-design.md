# Pedidos publicos de material SKBC

## Objetivo

Sustituir el formulario de Google Forms y el flujo manual posterior por un sistema integrado que permita a cualquier persona solicitar material desde la web publica de SKBC, acumule los pedidos en campañas mensuales y facilite desde el sistema de gestion la compra al proveedor, el cobro y la comunicacion individual con cada familia.

El flujo debe ser sencillo para las familias y conservar control administrativo antes de cerrar una campaña, encargar material o enviar emails.

## Limites y propiedad de los datos

- El Supabase de la web publica (`wucxazuhrgokvtajqmsr`) sera la unica fuente de verdad para catalogo, campañas, pedidos, lineas, estados y comunicaciones preparadas.
- El Supabase del sistema de gestion (`zxmjhgrpxxcinxtfuers`) no almacenara copias de estos datos.
- El sistema de gestion consultara y modificara el Supabase de la web desde acciones ejecutadas en el servidor de Vercel.
- Las credenciales con permiso de escritura no se incluiran en JavaScript publico ni se enviaran al navegador.
- La web publica se desplegara desde su proyecto actual; el panel operativo se desplegara en `skbc.vercel.app`.

## Catalogo publico

La pagina actual de pedidos de la web se convertira en un catalogo visual dividido en:

- Dogis de iniciacion y entrenamiento.
- Dogis avanzados y de competicion.
- Cinturones.
- Camisetas, sudaderas y ropa del club.
- Otros materiales configurables.

Cada ficha mostrara imagen, nombre, referencia, uso recomendado, gramaje cuando proceda, descripcion breve, tallas disponibles y atribucion a Fujimae. El precio no se mostrara en el catalogo general; aparecera cuando el usuario seleccione una variante dentro del formulario de pedido.

Las imagenes oficiales de los dogis se obtendran de las fichas de Fujimae, se optimizaran para web y se alojaran como recursos propios de la web para evitar depender de URLs externas. La pagina indicara que el material es suministrado por Fujimae e incluira un enlace al fabricante.

## Dogis iniciales y precios

Los productos iniciales seran dogis completos blancos. Se excluyen las chaquetas y pantalones sueltos, el antiguo Training Lite en liquidacion y productos rojos.

| Producto | Referencia | Tallas | Precio inicial |
| --- | --- | --- | ---: |
| Karate Gi Basic 6,5 oz | 10000 | 0000-2 | 30 EUR |
| Karate Gi Basic 6,5 oz | 10000 | 3-7 | 35 EUR |
| Karate Gi Training 9 oz | 10010 | 0000-2 | 40 EUR |
| Karate Gi Training 9 oz | 10010 | 3-7 | 45 EUR |
| Karate Gi Training Lite 2 | 10021 | 000-2 | 45 EUR |
| Karate Gi Training Lite 2 | 10021 | 3-5 y 7 | 60 EUR |
| Karate Gi Shinsei 11 oz | 10041 | 3-7 | 65 EUR |
| Karate Gi Kata Budokan 12 oz | 10070 | 2-7 | 80 EUR |
| Karate Gi Legacy II 14 oz | 10050 | 3-7 | 85 EUR |
| Karate Gi Kumite Training UpCycle | 10080 | 3-7 | 95 EUR |
| Karate Gi Kumite ProWear | 10060 | 2-7 | 95 EUR |
| Karate Gi Kumite ProWear Hyperlite QS | 10081 | 2-7 | 105 EUR |

Los precios iniciales siguen la regla aprobada de sumar aproximadamente 5 EUR al precio profesional y redondear al multiplo de 5 EUR mas cercano. Coste, margen y precio final seran editables. Una promocion temporal del proveedor no reemplazara automaticamente el precio estable: tendra un precio promocional y una vigencia explicitos.

El obi blanco tendra un precio inicial de 5 EUR. Los pedidos conservaran una copia del nombre, referencia, talla y precio vigentes al confirmar, por lo que los cambios posteriores del catalogo no alteraran el historico.

## Guia de tallas

La guia estara disponible desde todas las fichas de dogi y durante la seleccion de talla:

| Talla | Estatura |
| --- | --- |
| 0000 | 95-105 cm |
| 000 | 105-115 cm |
| 00 | 115-125 cm |
| 0 | 125-135 cm |
| 1 | 135-145 cm |
| 2 | 145-155 cm |
| 3 | 155-165 cm |
| 4 | 165-175 cm |
| 5 | 175-185 cm |
| 6 | 185-195 cm |
| 7 | 195-205 cm |

La guia explicara que debe medirse la estatura de la coronilla al suelo, de pie y con la espalda recta. Cada producto limitara el selector a sus tallas realmente disponibles.

## Formulario publico y carrito

El formulario sera publico tanto para ropa del club como para material de entrenamiento. Solicitara:

- Nombre y apellidos de la persona responsable.
- Email.
- Telefono.
- ID de alumno opcional.
- Observaciones opcionales.
- Aceptacion de privacidad.

El ID sera solo una ayuda administrativa y nunca una prueba de identidad. El formulario explicara donde puede encontrarse y que, si no existe todavia, se puede contactar con el club.

Cada articulo sera una linea independiente con destinatario, producto, variante, talla, cantidad, precio unitario y subtotal. Los articulos no se combinaran en el desglose familiar, aunque sean iguales. El resumen de compra para el proveedor si podra agrupar referencias y tallas identicas.

Antes de confirmar se mostraran todas las lineas y el total. La web indicara que se trata de una solicitud de material, que el club la revisara y que la forma de pago se comunicara posteriormente. Al finalizar se mostrara un numero de pedido.

## Campañas mensuales

- Cada campaña abarcara desde el dia 16 de un mes hasta el dia 15 del siguiente.
- Los nuevos pedidos se asignaran automaticamente a la campaña abierta.
- El dia 15 la campaña pasara a `pendiente de cierre`, pero no se cerrara automaticamente.
- El administrador podra revisar y corregir pedidos antes del cierre.
- Al pulsar `Cerrar campaña`, se congelaran pedidos, lineas, destinatarios y precios.
- Los pedidos posteriores se asignaran a la nueva campaña.

Estados de campaña: `abierta`, `pendiente de cierre`, `cerrada`, `pedido realizado`, `recibida` y `completada`.

## Panel en el sistema de gestion

El sistema de gestion incorporara un apartado de pedidos con estas vistas:

1. **Resumen actual**: campaña, dias restantes, pedidos, unidades, importe y acciones pendientes.
2. **Pedidos recibidos**: una fila por articulo con filtros por persona, producto, talla y estado.
3. **Resumen para proveedor**: referencias y tallas agrupadas con cantidades, coste y total estimado.
4. **Cobros**: desglose por responsable, forma de pago y estado.
5. **Comunicaciones**: emails preparados, vista previa, edicion y envio confirmado.
6. **Catalogo**: productos, variantes, imagenes, costes, margenes, precios y disponibilidad.
7. **Historico**: campañas cerradas consultables sin modificar sus precios originales.

La forma de pago se asignara exclusivamente desde el panel. Valores iniciales: `entregar en el club`, `cargar en cuenta` y `pagado`.

## Comunicaciones

Al cerrar una campaña se preparara un email por responsable con:

- Nombre del responsable.
- Una linea separada por cada articulo y destinatario.
- Precio unitario, subtotales y total.
- Forma de pago asignada.
- Logo, identidad y redes sociales del club.

Los emails quedaran en estado `preparado`. No se enviaran automaticamente. El administrador podra revisar y editar antes de pulsar `Enviar comunicaciones` y confirmar la operacion.

Cada email final se enviara por separado a una unica direccion, sin CC ni BCC compartidos. Ninguna familia vera datos o pedidos de otra. El envio de prueba podra reunir todas las vistas previas, pero llegara exclusivamente al correo interno del club.

## Modelo de datos

La solucion ampliara o migrara de forma compatible el sistema actual `skbc_merch_orders` mediante entidades equivalentes a:

- `skbc_merch_products`
- `skbc_merch_variants`
- `skbc_order_campaigns`
- `skbc_merch_orders`
- `skbc_merch_order_items`
- `skbc_order_communications`

Las lineas guardaran snapshots de producto, referencia, destinatario, talla, precio unitario y subtotal. Los totales se calcularan en servidor o base de datos, nunca a partir de un total proporcionado por el navegador.

## Seguridad y errores

- El catalogo tendra lectura publica limitada a productos activos.
- Los visitantes podran crear pedidos, pero no leer, modificar ni enumerar pedidos.
- La insercion completa de pedido y lineas sera atomica para evitar pedidos parciales.
- Se conservaran campo trampa, tiempo minimo y limitacion de frecuencia contra bots.
- Se validaran email, telefono, cantidades, variantes activas y precios vigentes.
- Si falla el guardado, la interfaz conservara el carrito y permitira reintentar sin duplicar el pedido.
- Cada confirmacion usara una clave de idempotencia para evitar dobles envios.
- Las acciones administrativas se ejecutaran con sesion privada y permisos de servidor.
- No se realizara ningun cobro ni pedido automatico al proveedor.

## Migracion y despliegue

1. Crear el esquema en el Supabase de la web sin eliminar `skbc_merch_orders`.
2. Cargar catalogo inicial, variantes, guia e imagenes optimizadas.
3. Construir el panel remoto en el sistema de gestion.
4. Sustituir la pagina publica de pedidos conservando un camino de retorno durante la validacion.
5. Probar un pedido completo en entorno controlado.
6. Verificar resumen de proveedor, cierre, emails y privacidad.
7. Desplegar ambos proyectos y comprobarlos en sus URLs de produccion.

## Criterios de aceptacion

- Una familia puede crear un pedido con varios destinatarios sin usar Google Forms.
- Cada articulo aparece separado y conserva su precio.
- Todos los pedidos del periodo aparecen en una campaña mensual comun.
- El resumen del proveedor agrupa correctamente producto, referencia y talla.
- El cierre requiere una accion administrativa.
- Los emails quedan preparados y requieren confirmacion antes de enviarse.
- Cada destinatario recibe exclusivamente su propio pedido.
- El sistema de gestion no duplica los pedidos en su Supabase.
- La pagina publica funciona correctamente en movil y escritorio.
- Ambos proyectos quedan desplegados y verificados en produccion.
