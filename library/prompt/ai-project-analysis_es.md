Revisa el proyecto actual en modo de solo lectura (si CodeGraph MCP o `.codegraph/` está disponible, puedes usarlo para consultar la estructura de módulos más rápido). Analiza únicamente los archivos que hayas leído realmente y escribe, en español y exactamente con el formato fijo siguiente, las cuatro secciones «## Resumen del proyecto», «## Frontend», «## Backend» y «## APP». Cada sección debe aparecer una sola vez y está prohibido añadir subtítulos adicionales (como `### BFF`):

## Resumen del proyecto
- (2 a 3 puntos concisos resumiendo el propósito del proyecto y las tecnologías principales de FE/BE en un máximo de 120 caracteres; no repitas detalles de las secciones)

## Frontend
- Tecnologías y puntos de entrada: (1-2 líneas describiendo las tecnologías reales y archivos de entrada; marca las rutas inciertas como «por confirmar»)
```text
<directorio-raíz-frontend>/
├── <subdirectorio-principal>/
│   └── <archivo-de-entrada-o-clave>
└── <archivo-de-configuración-o-entrada>
```

## Backend
- Tecnologías y puntos de entrada: (Describe brevemente por separado Backend / BFF / Local Agent; si no existe un directorio independiente para BFF o Local Agent, indica explícitamente «No se detectó directorio independiente de BFF / Local Agent»)
```text
<directorio-raíz-backend-o-bff>/
└── <subdirectorio-o-ruta-compacta-de-paquete>/
    └── <archivo-de-entrada>

<directorio-raíz-local-agent (si existe)>/
└── <archivo-de-entrada>
```

## APP
- (Si existe, incluye tecnologías, entradas y un único árbol ASCII `text`; si no existe, escribe ÚNICAMENTE «No se detectó el directorio APP»)

[Reglas estrictas para el árbol ASCII (Requeridas por el analizador de UI)]
1. `## Frontend` y `## Backend` deben contener cada uno **un único** bloque de código ` ```text `. Si Backend incluye tanto BFF como Local Agent, coloca ambos árboles raíz dentro del mismo bloque ` ```text ` separados por una línea en blanco.
2. Los directorios raíz deben ir sin sangría y terminar con `/` (ej. `src/`, `js-storefront/`, `backend/`, `local-agent/`).
3. Cada nivel hijo debe usar exactamente 4 caracteres de sangría (`│   ` o `    `) seguidos de `├── ` o `└── `.
4. **Todos los nombres de carpetas DEBEN terminar con `/`** (ej. `components/`, `controller/`); **los nombres de archivos NO deben terminar con `/`** (ej. `main.tsx`, `server.ts`).
5. **Carpetas compactas (Compact Folders) para Java / Namespaces profundos**: Desglosa los directorios con múltiples ramas nivel por nivel; sin embargo, para paquetes profundos de una sola cadena sin ramas secundarias (como paquetes Java/Kotlin/C#), **combina la ruta en un único nodo de carpeta en una sola línea** (ej. `└── web/src/com/falconpack/webservices/v2/controller/` o `└── src/main/java/com/example/service/`) para evitar sangrías excesivas, sin sustituir nombres reales por `...`.
6. **PROHIBIDO incluir nodos independientes de puntos suspensivos `...` o `…`**; enumera solo directorios clave y archivos de entrada verificados, sin adivinar ni inventar rutas.
