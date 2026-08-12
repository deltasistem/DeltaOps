---
name: Sesiones de trabajo DGP-020.2
description: Lecciones de implementar sesiones de trabajo con tramos append-only y duración real — identidad canónica vs espejo, bypass por capacidades, offline optimista, estabilidad de suites PG.
---

## La identidad canónica debe fluir explícitamente hasta el módulo — el principal espejo NO es la identidad
El router de Órdenes construye `principal.id` con el ID entero espejo (`deltaops.users.id`); la identidad canónica (UUID de Identity) vive aparte en la sesión HTTP. Cualquier feature que atribuya trabajo a una identidad debe recibirla por un canal explícito (`metadata.identityId` en el ctx) y FALLAR CERRADO si falta — jamás usar el ID espejo como fallback ni aceptarla del body. Resolverla AL INICIO del comando (antes del claim de opId y del lookup del agregado) para que el rechazo sea determinista (AUTH > NF).
**Why:** un técnico bien asignado recibía 403 (se comparaba entero vs UUID) y el bypass de supervisor atribuía sesiones al ID legacy — invisible en tests que no modelan mirror≠canónico.
**How to apply:** en todo comando nuevo con atribución de identidad, testear con mirror≠canónico y un caso "ctx sin identidad ⇒ KRN-AUTH aunque el agregado no exista".

## Los permisos derivados de un mapeo "todos menos admin" cuelan privilegios
`principalOrdenes` daba a todo rol espejo `operador` (SUPERVISOR/PLANIFICADOR/TECNICO colapsados) todos los permisos salvo `.admin`, incluyendo `.validar` ⇒ cualquier operador pasaba por supervisor y saltaba la verificación de asignación. Los bypass de negocio deben ligarse al ROL CANÓNICO de la sesión, no al rol espejo colapsado.
**How to apply:** al conceder permisos por rol, enumerar explícitamente por rol canónico; testear la matriz negativa (planificador/técnico NO asignados ⇒ rechazo).

## Offline-first exige estado optimista derivado de la cola
Encolar comandos no basta: si el panel no refleja la operación encolada, el usuario no puede encadenar (pausar/reanudar/cerrar) en campo. Patrón: derivar un estado local plegando las ops pendientes de la cola (FIFO, `ocurridoAt` de los clicks = fuente de campo) sobre el read model, con marca "pendiente de sincronizar", y refrescar queries al reconectar/drenar. Los comandos que operan sobre "la sesión abierta de (OT, identidad)" no necesitan sesionId ⇒ el orden FIFO de la cola basta para encadenar.

## Duración real: tramos append-only con ocurridoAt(device)≠registradoAt(server)
La duración se calcula SOLO desde tramos (efectivo/pausado/transcurrido; pausas múltiples suman); workflow/bitácora son señal auxiliar. Anomalías de reloj se marcan sin corregir el hecho. La proyección lee estado/cierre de la cabecera fuente-de-verdad ⇒ replay orden-independiente.

## Suites PG contra outbox compartido: drenaje a-vacío, no una pasada
`processPending()` procesa UN lote global (50, SKIP LOCKED sin filtro de tenant): con backlog ajeno, una sola llamada puede no proyectar los eventos del test ⇒ flakiness por timeout. Drenar iterando hasta ciclo sin trabajo (con tope), tenants/identidades únicos por corrida, y testTimeout explícito (30s) en suites de integración PG. Reproducir la contención del revisor corriendo suites en paralelo antes de declarar estable.
