# Portal del sensei de Anandi

Anandi Tolosa usa la clase Adultos. Cada sensei entra con una cuenta individual vinculada a su dojo. El servidor determina el dojo de la cuenta en cada lectura y escritura. El administrador general de SKBC puede consultar y gestionar todos los dojos y abrir la vista de cada uno.

El portal incluye Kenshis y sus fichas, altas, bajas, avisos de fin del mes de prueba, Clases, Control del día, Modo Dojo, Próximos exámenes, Rankings, Resumen semanal y Sustituto. Próximos exámenes es de consulta. El administrador general gestiona convocatorias, resultados, grados oficiales y diplomas.

Cada kenshi tiene una ficha central. La pertenencia a cada dojo tiene su propio estado para que un kenshi pueda entrenar en dos dojos y darse de baja de uno. Una nueva alta permite pasar asistencia en Anandi desde el primer día y queda pendiente de validación administrativa. El administrador puede vincular un posible duplicado a la ficha existente conservando sus asistencias.

El flujo de clase sigue el de Gainberri. El sensei abre el plan técnico, selecciona las técnicas, pasa lista y marca lo trabajado. Se registra una práctica únicamente si el kenshi asistió, la técnica se marcó como trabajada y le corresponde según las reglas de grado vigentes en el motor de Gainberri. Al corregir una sesión se actualizan los registros correspondientes sin duplicarlos.

Cada clase pertenece a un dojo. El motor reutiliza las reglas actuales y calcula sus propuestas con los grados oficiales de los kenshis y el orden e historial de su propio dojo. Los rankings y el resumen semanal usan las clases y asistencias del mismo dojo. El administrador puede ver el historial completo de un kenshi con el dojo de cada práctica. Un sustituto solo accede a la sesión delegada.

Antes del despliegue se comprobará el flujo de clase con asistencia realista y casos de técnica planificada, técnica trabajada, alumno ausente y grado distinto. Se probará que una práctica en Anandi no cambia las sugerencias ni el ranking de Gainberri. También se probarán altas, bajas, enlaces directos y escrituras con cuentas de sensei, sustituto y administrador, usando datos de prueba.
