# Kenshis Summary Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir las cuatro tarjetas del resumen de Kenshis en filtros navegables y eliminar los controles duplicados de clase y estado.

**Architecture:** La pagina de servidor derivara un filtro unico (`active`, `kids`, `adults`, `inactive`) desde los parametros existentes `class` y `status`. Las tarjetas seran enlaces con parametros de URL, preservaran `q`, y las rutas de detalle conservaran la URL completa para restaurar el estado al volver.

**Tech Stack:** Next.js 15 App Router, React Server Components, TypeScript, Supabase, CSS global existente.

---

### Task 1: Derivar filtros y contadores

**Files:**
- Modify: `src/app/kenshis/page.tsx`

- [ ] **Step 1: Definir el filtro seleccionado**

Anadir un tipo `KenshiFilter` y derivar `selectedFilter` de `searchParams`: `inactive` cuando `status=inactive`, `kids` o `adults` cuando `class` tenga esos valores y `active` en cualquier otro caso.

- [ ] **Step 2: Incorporar el contador de inactivos**

Extender el `Promise.all` de contadores con una consulta `status = inactive`. Mantener los contadores globales independientes de la busqueda.

- [ ] **Step 3: Unificar la consulta de miembros**

Aplicar `status=inactive` solo para el filtro inactivo. Para los otros tres filtros aplicar `status=active` y, en `kids`/`adults`, anadir la clase correspondiente.

- [ ] **Step 4: Ejecutar TypeScript**

Run: `npm.cmd run typecheck`

Expected: proceso terminado con codigo 0.

### Task 2: Convertir el resumen en navegacion

**Files:**
- Modify: `src/app/kenshis/page.tsx`

- [ ] **Step 1: Crear enlaces de filtro**

Generar las URLs de las cuatro tarjetas con `URLSearchParams`. Cada URL preservara `q`, fijara el estado necesario y solo incluira `class` para `kids` o `adults`.

- [ ] **Step 2: Sustituir articulos por enlaces accesibles**

Renderizar `Activos`, `Ninos`, `Adultos` e `Inactivos` como enlaces de tarjeta. Aplicar clase `selected` y `aria-current="page"` al filtro activo.

- [ ] **Step 3: Simplificar el buscador**

Eliminar los desplegables `Clase`, `Estado` y el boton `Filtrar`. Conservar `q` y anadir campos ocultos que mantengan `class` y `status` al enviar la busqueda.

- [ ] **Step 4: Mostrar resultados**

Mostrar el numero de resultados junto al campo de busqueda con texto singular/plural y mantener `currentListPath` como ruta de retorno para alumnos, fichas y alta.

### Task 3: Estados visuales y responsive

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Estilizar tarjetas interactivas**

Anadir estilos limitados a `.kenshi-filter-card` para conservar la apariencia actual, eliminar subrayado, mostrar cursor, hover y foco visible.

- [ ] **Step 2: Estilizar seleccion**

Anadir `.kenshi-filter-card.selected` con borde azul, fondo sutil y realce suficiente sin cambiar las dimensiones del grid.

- [ ] **Step 3: Adaptar el buscador**

Anadir `.kenshi-search-form` y `.kenshi-result-count` para que el buscador ocupe el ancho disponible y el contador no desplace ni solape contenido en escritorio o movil.

### Task 4: Verificacion y produccion

**Files:**
- Verify: `src/app/kenshis/page.tsx`
- Verify: `src/app/globals.css`

- [ ] **Step 1: Verificar cambios locales**

Run: `npm.cmd run typecheck`

Expected: codigo 0.

Run: `npm.cmd run build`

Expected: compilacion de produccion completada y ruta `/kenshis` generada sin errores.

- [ ] **Step 2: Revisar alcance del diff**

Run: `git diff --check -- src/app/kenshis/page.tsx src/app/globals.css`

Expected: sin errores de espacios y solo cambios relacionados con filtros.

- [ ] **Step 3: Publicar de forma aislada**

Run: `git add src/app/kenshis/page.tsx src/app/globals.css docs/superpowers/plans/2026-09-25-kenshis-summary-filters.md && git commit -m "Use Kenshis summary as filters" && git push origin main`

Expected: commit en `main` y despliegue automatico de Vercel.

- [ ] **Step 4: Verificar produccion**

Esperar a que el despliegue de Vercel quede `Ready`. Comprobar `/kenshis`, los cuatro enlaces y sus parametros, la seleccion visible, la busqueda combinada y las rutas `returnTo` mediante una sesion administrativa disponible. Si no hay sesion, verificar el HTML autenticado mediante el mecanismo de acceso interno disponible y comunicar cualquier limite concreto.

- [ ] **Step 5: Confirmar reversibilidad**

Registrar el hash del commit funcional. La vuelta al estado anterior se realizara revirtiendo exclusivamente ese commit y desplegando de nuevo.
