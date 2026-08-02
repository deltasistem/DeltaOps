# 10_EVENT_DISPATCHER_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación del Event Dispatcher: del outbox a los consumidores, con garantías.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. El ciclo del despachador (por módulo)

```
1. TOMAR      lote del outbox del módulo, en orden de confirmación
2. SELLAR     calcular el eslabón de la cadena de auditoría (hash encadenado, ETS-011/10)
3. PUBLICAR   al flujo de eventos con el sobre del Kernel completo
4. MARCAR     el outbox como despachado (jamás borrar: el outbox es historia)
CONSUMIDORES  cada uno con su cursor independiente, avanzando a su ritmo
```

## 2. Reglas de implementación

1. **El despachador es plataforma, se escribe UNA vez**: los módulos no implementan despacho; tienen un outbox con el esquema universal (ETS-010) y la plataforma lo drena. Toda mejora del despacho beneficia a todos simultáneamente.
2. **At-least-once asumido en todas partes**: el despachador puede republicar (caída entre 3 y 4); por eso TODO consumidor es idempotente por diseño (clave: id de evento + id de consumidor). "Me llegó dos veces" nunca es un bug del despachador; un consumidor no idempotente sí es un bug del consumidor.
3. **Orden por agregado, no global**: la única promesa de orden es por agregado (secuencia de versión); los consumidores que necesiten correlacionar entre agregados usan los datos del sobre, no el orden de llegada.
4. **El consumidor tiene una plantilla fija**: leer desde cursor → procesar (proyección o comando de reacción) → avanzar cursor en la MISMA transacción local que su efecto. Cursor y efecto atómicos o el consumidor duplica/pierde — esta regla no tiene excepciones.
5. **Falla al consumir = bandeja, jamás bloqueo del flujo** (ETS-011/10): el evento problemático va a la bandeja del consumidor con diagnóstico y el cursor decide según el caso: detenerse (proyecciones donde el orden importa) o saltar a bandeja (reacciones independientes). Cada consumidor declara cuál de las dos disciplinas usa.
6. **Replay como operación de primera clase**: reconstruir un read model = crear cursor nuevo en cero sobre un derivado vacío; el implementador de todo consumidor debe poder responder "¿qué pasa si esto se re-ejecuta desde el inicio?" — si la respuesta no es "el mismo resultado", el consumidor está mal escrito.
7. **Los sobres nunca se mutan ni se enriquecen al pasar**: lo publicado es lo que el UoW confirmó; un consumidor que necesita más datos, los consulta con la identidad del sobre — no se le agrega "un campito" al evento histórico.
8. **El retraso del cursor es métrica automática** (ETS-011/27): el framework la emite; ningún consumidor la implementa a mano.

## 3. Prueba obligatoria

Suite transversal de consumidores (ETS-011/25): cada consumidor se prueba con — entrega duplicada (mismo efecto), entrega en desorden entre agregados (tolerada), replay completo (resultado idéntico), evento venenoso (a bandeja, flujo vivo). Corre con flujo en memoria; el transporte real se cubre en integración.

---

## Impacto sobre la implementación
El despachador y el framework de consumidores son de las primeras piezas de plataforma a construir: todos los derivados del sistema (read models, búsqueda, notificaciones, integraciones) viven sobre ellos.

## ETS relacionados
ETS-011 (10, 17 cadena de auditoría, 27) · ETS-010 (esquema de outbox y cursores) · ETS-009 (18 versionado de eventos).

## Riesgos
- Consumidores con efecto y cursor en transacciones separadas → regla 4; la plantilla del framework lo hace difícil de violar.
- Bandejas ignoradas acumulando eventos → cada bandeja tiene dueño y alerta por tamaño (ETS-011/27).

## Decisiones habilitadas
Derivados desechables y reconstruibles, módulos desacoplados de verdad, diagnóstico por bandeja.

## Decisiones bloqueadas
Tecnología del flujo de eventos — ETS-007/009 norman las garantías; el producto concreto se elige con el stack.
