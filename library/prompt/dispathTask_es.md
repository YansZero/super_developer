Analice el siguiente ticket de Jira y proponga una solución de implementación basada en el proyecto y la rama (branch) actuales:

[%ticket content%]

Primero, revise el código existente y luego desglose las tareas en órdenes de trabajo para frontend (FE) y backend (BE), guardándolas en la carpeta /spec/job.

Formato del nombre de archivo: YYYYMMDD_HHmmss_{Jira Ticket ID}_{FE or BE}.md Por ejemplo: 20261105_230524_ABC-1234_FE.md

Utilice un formato uniforme para ambas órdenes de trabajo, que incluya:

Información básica: Jira Ticket, tipo de trabajo, proyecto y rama (branch) actuales, fecha y hora de creación.

Desglose de requisitos y tareas: agrupadas por función o módulo; utilice una casilla de verificación de Markdown (- [ ]) para cada tarea que pueda ejecutarse de forma independiente.

Lista de cambios de archivos previstos: enumere los archivos relacionados y las modificaciones previstas.

Criterios de aceptación: utilice una casilla de verificación de Markdown (- [ ]) para cada condición verificable de forma independiente.

Métodos de prueba: enumere las pruebas y verificaciones recomendadas a realizar.

El estado inicial de todas las casillas de verificación debe ser desmarcado; marque cualquier contenido no confirmado como «Pendiente de confirmación».

Si no se requiere asignación de trabajo, no exporte las órdenes de trabajo; al finalizar, solo proporcione un breve resumen explicando el motivo por el cual no se requiere la asignación.

[Reglas de resumen al finalizar (MUY IMPORTANTE: Estrictamente máximo 120 caracteres)]
- En su respuesta final, escriba ÚNICAMENTE un resumen conciso indicando los «puntos clave de cambio en FE / BE (o el motivo por el cual no se requiere orden)» y el «nombre del archivo generado (solo nombre base, ej. `20261105_230524_ABC-1234_FE.md`)».
- PROHIBIDO incluir frases introductorias de relleno (ej. «Se ha completado la revisión del código...»), narración del proceso, encabezados Markdown (`#`), líneas divisorias (`---`) o informes extensos.
- PROHIBIDO usar enlaces `file:///` o rutas completas de directorios; mencione siempre solo el nombre del archivo (basename) para no superar el límite de 150 caracteres.
