---
name: Workflow & Dynamic Forms DGP-007
description: Convenios de lib/workflow-engine y lib/dynamic-forms que los módulos de negocio futuros deben respetar.
---

# Workflow & Dynamic Forms Engine (DGP-007)

Paquetes `lib/workflow-engine` y `lib/dynamic-forms` (fake + PG, sobre Kernel/Plataforma/Business Foundation). UI técnica en `/deltaops/motores` y `/deltaops/motores/playground` (solo Design System).

Reglas duras (de la revisión arquitectónica — no repetir):
- **Aprobación = gate real**: una transición con aprobación declarada NO cambia estado en `transicionar`; crea la aprobación pendiente (misma UoW) y la transición completa se ejecuta solo al resolverse `aprobar` según el modo; rechazo/vencimiento aplican `rechazoA`. Nunca depender de acciones declaradas manualmente para el gate.
- **Sincronización offline**: jamás un comando kernel que ejecute otros comandos (UoW anidadas). Orquestación `procesarCola`: una UoW por operación, recibos derivados de `_opIds`, tenant-scoped.
- **Plantillas N/N-1**: versiones publicadas inmutables `<clave>:v<N>` + índice `idx:<clave>`; una sola activa por clave; las respuestas anclan `{plantillaClave, plantillaVersion}` y validan SIEMPRE contra su versión original.
- **Condiciones unificadas**: dynamic-forms reutiliza el motor de condiciones de workflow-engine (no duplicar evaluación).
- **Vocabulario prohibido también en identificadores públicos**: 'proveedor' obligó a renombrar a `ResolutorPlantilla*`. Detector `detectarVocabularioProhibido` + test de grep negativo como guardarraíl.
- **Suites PG de los motores dejan eventos pendientes en `deltaops.kernel_outbox`** que rompen el test `lease concurrente` del kernel; marcar `processed_at` en los residuales antes de correr la suite PG del kernel.
