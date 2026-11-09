# Super Developer

[Español](README.es.md) | [繁體中文](README.md) | [English](README.en.md)

Consola de gestión de proyectos personales y colaboración con IA construida con un panel de control modular, centro de configuración unificado y un agente local Node Loopback. Integra flujos de trabajo Git, planificación de tareas Jira, despacho de CLI de IA, gestión de Skills/MCP y administración de Prompts.

---

## Características Principales

### 1. Visión General y Detalle de Proyectos (Project Overview & Detail)
- **Gestión de Directorios de Proyecto**: Agregue múltiples carpetas locales en lote mediante el selector nativo del sistema. Permite fijar proyectos, análisis múltiple, reanálisis y eliminación segura (sin borrar archivos locales del disco).
- **Reloj del Sistema en Tiempo Real y Saludos Dinámicos**: Cabecera con reloj dinámico y avisos según la franja horaria (Mañana, Mediodía, Tarde y descanso nocturno). Incluye pista animada personalizable con hasta 5 animales y 4 fondos escénicos (Color sólido, Césped, Atardecer, Noche).
- **Apertura Multiplataforma de Carpetas**: Botón de apertura en un clic adaptado a macOS (`open`), Windows (`explorer.exe`) y Linux (`xdg-open`).
- **Salud del Espacio de Trabajo y Visor de Especificaciones**:
  - Barra horizontal superior que muestra en tiempo real archivos pendientes, commits adelantados/atrasados, tickets de Jira, avance del stack y disponibilidad de proveedores de IA.
  - Visor integrado de archivos en `spec/` para previsualizar especificaciones técnicas y registros de despacho en Markdown.

### 2. Operaciones Git y Banco de Trabajo Commit / Stash
- **Consola de Comandos**: Soporte completo para status, fetch, pull, push, branches, registro de commits y checkout.
- **Banco de Trabajo Interactivo de Commits**:
  - Selección de archivos mediante casillas con visor de diferencias (Diff) en tiempo real.
  - Función de Stash rápido con `git stash push -u` para archivos seleccionados (modificados y no rastreados).
  - Protección contra condiciones de carrera asíncronas y recarga instantánea de archivos pendientes al alternar proyectos.
  - Botón `Push` para confirmar y enviar en un solo clic; regresa automáticamente a la consola cuando no quedan archivos pendientes.

### 3. Centro de Trabajo de Jira e Integración OAuth
- **Banco de Trabajo de Tickets**: Combina "Mis Tareas" y "Despacho de Proyectos" con búsqueda, ordenación por columnas, filtros, agrupación por estados y vistas de Tarjeta/Lista.
- **Asignación Local de Tickets**: Asigne tickets de Jira a proyectos locales; la vista de detalle muestra automáticamente los códigos de proyecto Jira asociados y conserva las asignaciones al reanalizar.
- **Soporte para Múltiples Clientes OAuth**: El BFF en Express/TypeScript permite persistir varios clientes Atlassian mediante variables de entorno o SQLite, facilitando inicio de sesión independiente, comprobación de conectividad y alternancia de clientes.

### 4. Colaboración con IA y Centro de Trabajo (AI Work Center)
- **Planificación de Trabajos de IA**: Supervise y gestione centralizadamente tareas de IA de todos los proyectos. Almacena entradas de Prompt, proveedor, modelo, esfuerzo de razonamiento, logs de ejecución y estado en tiempo real.
- **Secciones Paginadas e Independientes**: Las secciones de trabajos en ejecución e historial completado se gestionan y pliegan de forma independiente, con búsqueda por ID, resumen, proyecto y claves Jira.
- **Integración Nativa con CLI de IA**: Compatible con `Antigravity (agy)`, `OpenAI Codex`, `Claude Code` y proveedores CLI personalizados. La configuración se guarda atómicamente con permisos seguros (`~/.config/super-developer/providers.config.json`), evitando la fuga de credenciales al almacenamiento del frontend.

### 5. Biblioteca Central: Skills, MCP y Prompts
- **Gestión de Skills y MCP**: Administre `library/skills` y `library/mcps` con modo de solo lectura por defecto, edición explícita, archivos auxiliares y seguimiento del estado de instalación en cada agente.
- **Plantillas de Prompt**: Gestor de plantillas en Markdown con previsualización multiidioma, generación asistida por IA y traducción automática entre chino tradicional, inglés y español.

### 6. Temas e Internacionalización (i18n)
- **4 Temas de Geometría Rectangular**: Estilos Modern, Esports, 8-Bit y Retro con persistencia local inmediata.
- **Localización Completa**: Cambio fluido en un clic entre chino tradicional (`zh-TW`), inglés (`en`) y español (`es`).

---

## Arquitectura del Sistema

```
┌────────────────────────────────────────────────────────┐
│                   Vite + React 19 Frontend             │
│   (AppShell, Project Overview, Git, Jira, AI Center)   │
└──────────────┬───────────────────────────┬─────────────┘
               │ (Proxy /api/...)          │ (Direct /api/...)
               ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│      Jira BFF (Node.js)   │ │  Local Provider Agent    │
│  - Express 4 + SQLite     │ │  - Native Node Loopback  │
│  - OAuth 2.0 Clients      │ │  - Local Git & FS Ops    │
│  - Tickets & Sites State  │ │  - CLI Adapters (agy,    │
└───────────────────────────┘ │    codex, claude)        │
                              └──────────────────────────┘
```

- **Frontend**: Vite 8, React 19, TypeScript 6, Sass.
- **Backend (BFF)**: Node.js 24 con SQLite nativo, Express, Session y Helmet.
- **Agente Local**: Servidor Node.js Loopback que administra el sistema de archivos local, comandos Git y procesos CLI de IA.

---

## Instalación y Puesta en Marcha Rápida

### Requisitos Previos
- **Node.js 24** o superior (con soporte nativo para SQLite).
- **npm 10** o superior.
- *(Opcional)* **Python 3.10+ con soporte venv** (p. ej., `sudo apt install python3-venv`, solo necesario si se habilita la Skill/MCP de Graphify).

### 1. Configuración Rápida (Recomendada)

```bash
# Clonar el repositorio y entrar al directorio
cd super_developer

# Instalar dependencias raíz
npm ci

# Inicialización en un clic: genera .env, instala backend y crea claves criptográficas
npm run setup

# Iniciar entorno full-stack (Frontend: 5173, Backend BFF: 4318)
npm run dev:all
```

### 2. Configuración Manual Paso a Paso

```bash
# 1. Instalar dependencias del frontend
npm ci

# 2. Inicializar archivo de variables de entorno del backend
npm run env:init
# O copiar manualmente: cp backend/.env.example backend/.env

# 3. Instalar dependencias del backend BFF
npm run bff:install

# 4. Generar claves criptográficas locales (SESSION_SECRET y TOKEN_ENCRYPTION_KEY)
npm run renew

# 5. Iniciar servidores de desarrollo
npm run dev:all
```

> **Nota**: `npm run renew` comprueba `backend/.env`. Si faltan `SESSION_SECRET` o `TOKEN_ENCRYPTION_KEY`, genera claves seguras aleatorias de 32 bytes sin alterar los valores existentes.

---

## Referencia de Comandos

| Comando | Descripción |
|---|---|
| `npm run setup` | Configuración en un clic: copia `.env`, instala paquetes BFF y genera claves |
| `npm run env:init` | Comprueba y copia `backend/.env.example` a `backend/.env` |
| `npm run bff:install` | Instala dependencias del backend BFF (`npm --prefix backend ci`) |
| `npm run renew` | Genera claves criptográficas ausentes en `backend/.env` |
| `npm run dev:all` | Inicia simultáneamente el servidor Vite (puerto 5173) y el BFF de Jira (puerto 4318) |
| `npm run dev:frontend` | Inicia únicamente el servidor de desarrollo Vite |
| `npm run dev:bff` | Compila e inicia únicamente el servidor BFF de Jira |
| `npm run build` | Compila recursos del frontend y el paquete de producción del backend |
| `npm run typecheck` | Ejecuta comprobación de tipos TypeScript en frontend y backend |
| `npm run lint` | Ejecuta análisis estático con ESLint |
| `npm run jira:config:check` | Valida la configuración pública de conexión con Jira |

---

## Archivos Locales y Reglas de Seguridad

Las siguientes rutas contienen estado local o credenciales privadas, están excluidas por Git y nunca deben confirmarse:

- `backend/.env` y otros archivos `.env.*` (solo se versiona la plantilla `backend/.env.example`)
- `backend/data/` (base de datos SQLite local, sesiones y tokens OAuth)
- `~/.config/super-developer/` (archivo de configuración local de proveedores CLI)
- `dist/`, `backend/dist/`, `node_modules/` (artefactos de compilación y dependencias)
