# 24 — Portfolio Execution

> **DeltaOps — DGP-000 · v1.0** · La estrategia de ejecución de portafolio: cómo se conduce el programa día a día — cadencia, priorización, desbloqueo y las decisiones de conducción.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

Los documentos 04-23 definen la estructura del programa; este define su **conducción**: el bucle operativo que lo mantiene avanzando. La cadencia base es la congelada (ESI-009/20); aquí se instancia para el portafolio de DGP.

## 2. El bucle de conducción

1. **La cadencia de programa** (al ritmo de la cadencia sincronizada, ESI-009/20 §2.1) recorre, en orden fijo:
   - **Bloqueados críticos primero** (doc 08 §2.3): causa, dueño del desbloqueo, edad.
   - **El hito en curso**: estado de criterios del próximo M-N (doc 15) contra el tablero.
   - **La cola de autorización**: qué DGP entran a Autorizado según dependencias (doc 16), capacidad real (doc 18) y camino crítico.
   - **Los cerrables**: DGP con AG pendientes de constatación — cerrar es tan prioritario como abrir.
   - **Señales de riesgo activadas** (doc 17 §2) y excepciones solicitadas.
2. **La priorización tiene regla fija**: camino crítico > desbloqueo > cierre de DGP maduros > apertura de DGP nuevos > todo lo demás — abrir trabajo nuevo con trabajo maduro sin cerrar es la inversión de prioridades clásica (el WIP como enemigo, la lección de flujo de ESI-009/18).
3. **Las decisiones de conducción se registran proporcionales**: autorizaciones y cierres, en el registro (doc 12); cambios de composición, alcance de ola o matriz estructural, como decisión formal (doc 28; ESI-010/07) — la conducción deja rastro sin burocratizarse.
4. **La cadencia lee, no fabrica**: llega con el tablero y el registro ya derivados (ESI-010/25); la reunión que empieza recolectando estados ya fracasó (ESI-010/18 §2.1).

## 3. Reglas normativas

1. **El programa limita su WIP**: la cantidad de DGP En ejecución simultáneos se acota por capacidad real de células y revisión (docs 18-20); el WIP por encima del límite no se autoriza aunque haya ansiedad de arranque.
2. **El desbloqueo tiene dueño y plazo**, como todo: el Bloqueado sin plan de desbloqueo en dos cadencias escala (a decisión, a replanificación o a cancelación honesta).
3. **La conducción respeta la estructura**: la cadencia no salta compuertas, no renegocia hitos ni reinterpreta olas — conduce dentro del programa; cambiar el programa es el canal del doc 28.
4. **El portafolio se conduce con los mismos números que se reporta** (ESI-010/25 §3.2): sin versión ejecutiva paralela.

## Impacto sobre la implementación

La agenda fija del bucle se instala desde W0; el registro y el tablero son la infraestructura de conducción — sin herramienta de gestión paralela.

## Dependencias

ESI-009/18, /20; ESI-010/07, /18, /25; docs 08, 11-12, 15-20, 28.

## Riesgos

- La conducción capturada por lo urgente visible (demos, pedidos) contra la regla de priorización; mitigación: la agenda fija del bucle con el crítico y los bloqueados primero — lo urgente entra al final por diseño, y el rastro muestra si la regla se respeta.

## Decisiones habilitadas

- Conducción diaria del programa con agenda y prioridad objetivas.
- Escalado natural de bloqueos y excepciones a sus foros.

## Decisiones bloqueadas

- Prohibido autorizar por encima del límite de WIP.
- Prohibido conducir con números paralelos al tablero.
- Prohibido usar la cadencia para renegociar la estructura del programa.

## Reusable Pattern

Bucle de conducción con agenda fija + priorización regla-fija + WIP limitado + rastro proporcional: el portafolio conducido como sistema, no como negociación semanal.

## Anti-Patterns

- La reunión de programa que recolecta estados a mano.
- Diez DGP abiertos por célula "para avanzar en todo".
- El bloqueado eterno que nadie escala por incomodidad.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-009/20 (cadencia base); ESI-010/25 (números únicos).
- **DGP que originará**: todos se conducen por este bucle.
- **ADR relacionados**: ADR de conducción de portafolio con agenda fija.
- **Módulos que reutilizarán este patrón**: sus carteras internas se conducen igual.
