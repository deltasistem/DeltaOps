---
name: Discovery duración real de OTs DGP-020
description: Hallazgos duraderos del discovery de duración real, mano de obra y costos de OT — límites del corpus y arquitectura aprobada a nivel de propuesta.
---

## Timestamps de transición son de SERVIDOR, no de campo
Todas las transiciones de OT sellan fechas con `new Date()` en el host (`sincronizarEstado`); `transicionar` no acepta ni propaga hora de dispositivo. Offline, el timestamp de una transición es la hora de SINCRONIZACIÓN. Solo `bitacora.ocurridoAt` porta device-time, y la bitácora es opcional y desacoplada de las transiciones (PAUSADA no sella `pausadaDesde`).
**Why:** cualquier métrica de "duración real" derivada de eventos de transición reproduce el desfase de reloj (GAP-CLOCK); la revisión independiente bloqueó una propuesta que lo ignoraba.
**How to apply:** para duración efectiva/pausada, la fuente de verdad debe capturarse con comandos aditivos que EXIJAN `ocurridoAt` de dispositivo + `registradoAt` de servidor; los eventos del motor y la bitácora solo sirven como señal de contraste.

## G-1 sigue vigente: asignación sin vínculo a identityId
`ord_asignaciones.asignado_id` y responsables de read models son `text` libre sin FK ni validación contra Identidad; no hay puerto de Identidad inyectado en Órdenes. DGP-018 solo mitigó en UI con match estricto.

## Mano de obra: cero datos en el corpus
No existe tarifa, horas, jornada, turno, centro de costo ni costo laboral; solo `tiempoReal`/`costoReal` globales manuales en la OT. Repuestos: `registrar-recurso` es descriptivo (sin costo/stock/FK a Abastecimiento — los costos viven en el read model propio de Abastecimiento). Órdenes nunca invoca Activos ⇒ no hay contrato OT→estado del activo (disponibilidad no inferible de "OT abierta").

## Arquitectura aprobada (nivel propuesta, no implementada)
Módulo nuevo de tramos de sesión append-only (`modulo.tiempos.sesion.*`, payload con ordenId/identityId/tramo/borde/ocurridoAt/registradoAt/opId), proyecciones CQRS propias con RLS, reglas deterministas (idempotencia por opId, orden por ocurridoAt, tramos abiertos excluidos y reportados, solapes por unión, reloj-sospechoso normalizado solo en el derivado). Fases recomendadas: 020.1 identityId en asignación → 020.2 duración real → 020.3 mano de obra → 021 costos.
**How to apply:** si Dirección aprueba 020.x, partir de `docs/DGP-020-DESCUBRIMIENTO.md` (§24-§26) como contrato de diseño.
