# Posibles candidatos para examenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir `Sin datos` por una seleccion fiable y explicada de posibles candidatos para la siguiente convocatoria.

**Architecture:** Un modulo puro evaluara tiempo, asistencia, actividad reciente y progreso tecnico. La pagina cargara en bloque los datos estructurados necesarios, construira una ficha de candidatura por alumno y reutilizara ese resultado para contador, filtro y detalle.

**Tech Stack:** Next.js 15, React 19, TypeScript, Supabase, comprobaciones Node con `assert`.

---

### Task 1: Motor de candidatura

**Files:**
- Create: `src/lib/exam-candidate.ts`
- Create: `scripts/check-exam-candidate.mjs`
- Modify: `package.json`

- [ ] Escribir comprobaciones que cubran el limite de 60 dias, 75 % de asistencia, actividad 6/60 y 1/21, progreso adulto 75 %, inclusion automatica de verde/amarillo y exclusion de inactivos.
- [ ] Ejecutar `npm run check:exam-candidate` y comprobar que falla porque el modulo no existe.
- [ ] Implementar tipos, calculo y motivos de candidatura con datos estructurados.
- [ ] Ejecutar `npm run check:exam-candidate` y comprobar que pasa.

### Task 2: Datos y presentacion

**Files:**
- Modify: `src/app/proximos-examenes/page.tsx`
- Modify: `src/app/globals.css`

- [ ] Cargar asistencias recientes, requisitos, programa tecnico e historial de progreso en bloque.
- [ ] Construir candidatos sin interpretar `exam_notice` y sin contar repasos.
- [ ] Sustituir la capsula `Sin datos` por `Posibles candidatos` y permitir filtrarla desde capsula y selector.
- [ ] Mostrar motivos y pendientes en una columna clara, conservando el semaforo oficial.
- [ ] Adaptar contador y tabla a escritorio, movil, iPad y iPad mini.

### Task 3: Verificacion y entrega

**Files:**
- Modify: any file above only if verification finds a defect.

- [ ] Ejecutar `npm run check:exam-candidate`, `npm run check:exam-technical-readiness`, `npm run typecheck` y `npm run build`.
- [ ] Revisar visualmente la pantalla en los cuatro anchos previstos.
- [ ] Confirmar que no hay cambios ajenos incluidos, crear commit, publicar y desplegar produccion.
