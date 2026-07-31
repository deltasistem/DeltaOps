# 09_TRANSACTION_BOUNDARIES.md

> **DeltaOps — ETS-011 · v1.0** · Fronteras transaccionales: dónde empieza y termina la consistencia fuerte, y cómo se coordina lo demás.
> Documento de diseño. Sin código, sin clases.

---

## 1. La regla única

**Consistencia fuerte = un agregado, una transacción, un módulo.** Todo lo demás es consistencia eventual coordinada por eventos. No hay transacciones distribuidas, no hay two-phase commit, no hay transacción que cruce módulos — nunca (coherente con ETS-009/16 y la ausencia de FKs entre módulos, ETS-010/06).

| Ámbito | Consistencia | Mecanismo |
|---|---|---|
| Dentro del agregado | Fuerte, invariantes garantizadas | Unit of Work (08) |
| Entre agregados del mismo módulo | Eventual corta; fuerte solo si el Domain Service valida contra estado vigente en la misma transacción (lectura consistente, sin modificar al segundo agregado) | Eventos internos o validación de lectura |
| Entre módulos | Eventual, explícita en la UX (ETS-004) | Eventos vía outbox → consumidores |
| Con el mundo exterior (objetos, IA, correo, conectores) | Ninguna transaccional | Consumidores + reconciliación |

## 2. Procesos de varios pasos (sagas del negocio)

Los flujos que atraviesan módulos (compra→recepción→entrada de bodega; hallazgo→solicitud→OT) se modelan como **procesos por eventos**: cada paso es un comando local con su transacción; el estado del proceso vive en el agregado que lo lidera (la OT, la orden de compra) y avanza al consumir eventos de los demás.

- **Compensación, no rollback**: un paso fallido posterior no "deshace" los anteriores — emite el comando compensatorio del dominio (hecho compensatorio con motivo, ETS-009/04 §3). La historia queda completa: intento, fallo, compensación.
- **Toda espera tiene vencimiento**: un proceso que aguarda un evento que no llega vence por política y produce un hecho de vencimiento visible (nada queda "colgado" en silencio).
- **El estado del proceso es consultable**: la pregunta "¿en qué va?" es un read model, no un misterio de logs.

## 3. Decisiones que esta frontera impone

1. Las validaciones entre módulos son **referencias débiles** (ETS-010/04): se valida contra la vista local/consulta en el momento del comando, se acepta la ventana de carrera y la reconciliación la vigila — jamás bloquear un módulo esperando a otro.
2. La UX declara lo eventual (frescura, "pendiente de…"), no lo disfraza de inmediato (ETS-008/02 frescura; ETS-004).
3. Un requisito que "necesite" transacción entre módulos es una señal de que el límite modular está mal trazado — se revisa el límite (ETS-007), no se rompe la regla.

---

## Impacto sobre la implementación
Prohíbe infraestructura de transacción distribuida; obliga a diseñar cada flujo multi-módulo como proceso por eventos con compensaciones y vencimientos; los read models de estado de proceso entran al catálogo.

## ETS relacionados
ETS-009 (16 consistencia) · ETS-010 (04 débiles, 06 sin FKs cross-módulo) · ETS-004 (UX de lo eventual) · ETS-011 (08 UoW, 10 despachador).

## Riesgos
- Procesos sin vencimiento acumulan limbo → regla §2 obligatoria por proceso, con hecho de vencimiento.
- Compensaciones no diseñadas a tiempo ("ya veremos") → cada proceso se cataloga con sus compensaciones antes de implementarse.

## Decisiones habilitadas
Catálogo de procesos por eventos con sus pasos, compensaciones y vencimientos; read models de estado de proceso.

## Decisiones bloqueadas
Inventario exhaustivo de procesos (se formaliza al implementar cada flujo) y sus tiempos de vencimiento concretos (configuración).
