---
name: Planes de Mantenimiento DGP-012
description: Lecciones del motor preventivo (module-planes), orquestación de OT y comandos vía sync.
---

# Enterprise Maintenance Plans & Preventive Engine (DGP-012)

- **Toda acción que la UI encola offline debe ser un COMANDO oficial del runtime, no solo una ruta HTTP** — una ruta que orquesta en la capa Express no es aceptada por `/sync` y rompe Offline First (fue CRÍTICO). La ruta HTTP debe delegar en el comando.
- **Una orquestación no está terminada hasta persistir el vínculo resultado→origen atómicamente**: generación→OT exige `linkOrden` con guarda de concurrencia (`WHERE orden_trabajo_id IS NULL`), evento autosuficiente (ORDEN_MATERIALIZADA) y proyección; sin eso los reintentos re-materializan y los read models quedan "pendientes" para siempre.
- Cross-runtime: materializar OT desde Planes vía puerto `MaterializadorOrdenes` que compone el comando oficial `modulo.ordenes.crear` con `opId=claveDedup` (dedup determinista planId+versión+ocurrencia); sin puerto ⇒ fallo seguro KRN-CFL. Patrón `capturarRespuesta` con UoWs propias — nunca comandos anidados.
- **CQRS aplica también a agregados "secundarios"** (calendarios, historial): cada creación emite evento y las queries sirven SOLO del read model — el revisor ejecuta sabotaje (vaciar tablas de escritura). Emitir evento incluso para registros de historial.
- Motor de frecuencias determinista: "ahora" y lecturas de medidor siempre como input; sin `Date.now()` en dominio. Definición de workflow con `operacionesEstandar:false` cuando hay comandos explícitos suspender/reanudar/cancelar (evita transiciones ambiguas `de::comando`).
- Seed multi-runtime: drenar el outbox INMEDIATAMENTE tras los comandos de cada módulo — un drain de otro runtime marca eventos ajenos como procesados sin proyectarlos (outbox compartido).
- Tipos canónicos de ordenes: `tipoOrden:"preventiva"` (no "preventivo"); `activoPrincipal` shape `{activoId, entityRef, rol}` (schemas .strict()).
