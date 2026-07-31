# 10_EVENT_DISPATCHER.md

> **DeltaOps — ETS-011 · v1.0** · Despachador de eventos: cómo los eventos confirmados llegan a todos sus consumidores, exactamente en orden y sin pérdida.
> Documento de diseño. Sin código, sin clases.

---

## 1. Arquitectura

```text
COMANDO (UoW, 08)
  └── outbox_<modulo>  (evento confirmado, aún no despachado)
        │
DESPACHADOR (uno por módulo, proceso de plataforma)
  ├── lee el outbox en orden de secuencia
  ├── calcula el eslabón de la cadena de auditoría (ETS-010/15 §2)
  ├── publica en el flujo (puerto Publicador, 06)
  └── marca despachado — al menos una vez, jamás cero veces
        │
CONSUMIDORES (cada uno con su cursor independiente)
  ├── proyectores de read models (ETS-010/10)
  ├── motores de reacción (04 §3: preventivos, reglas, indicadores…)
  ├── pipeline de notificaciones (16), búsqueda (19), IA (21)
  ├── integraciones salientes / webhooks (22)
  └── procesos de negocio multi-módulo (09 §2)
```

## 2. Garantías normativas

1. **Al menos una vez, en orden por agregado**: el despacho puede repetir; jamás omitir ni reordenar dentro de un agregado. Por eso **todo consumidor es idempotente** (control por secuencia de evento consumida, ETS-008/09).
2. **Cursores independientes**: cada consumidor avanza a su ritmo; el retraso de cada cursor es la frescura real de su derivado, medible y publicada (ETS-008/02).
3. **Bandeja de errores por consumidor**: el evento que un consumidor no puede procesar tras reintentos va a su bandeja con diagnóstico (JSONB, ETS-010/14) **sin frenar el flujo de los demás**; la bandeja tiene dueño operativo y alerta — el evento nunca se descarta.
4. **El despachador no filtra ni transforma**: entrega el sobre íntegro (Kernel, 02); el enrutamiento por tipo/interés es del lado consumidor (suscripciones declaradas).
5. **Dentro del proceso del comando no hay "eventos en memoria" hacia otros módulos**: incluso los consumidores del mismo despliegue leen del flujo — un solo camino, un solo orden, una sola auditoría (evita el clásico doble mecanismo divergente).
6. **Replay como operación de primera clase**: reconstruir un derivado = nuevo cursor desde el inicio (o desde snapshot) sobre el mismo flujo (ETS-009/09); el flujo es la fuente eterna, con temperaturas (ETS-010/09).

## 3. Suscripciones

Cada consumidor declara (metadatos): eventos que consume, módulo dueño, derivado que produce, frescura objetivo, política de reintentos. El mapa evento→consumidores es generable y auditable — "¿quién escucha esto?" es una consulta, no arqueología.

---

## Impacto sobre la implementación
El despachador con cadena de auditoría y el framework de consumidor (cursor + idempotencia + bandeja) se construyen una vez como plataforma y todos los módulos los reutilizan (24).

## ETS relacionados
ETS-009 (07 outbox, 08 proyecciones) · ETS-010 (15 cadena, 10 proyectores) · ETS-008 (09 contratos de eventos) · ETS-011 (08 UoW, 09 procesos).

## Riesgos
- Consumidor lento degrada su frescura silenciosamente → alerta por tendencia de retraso de cursor (27, ETS-010/20).
- Bandejas de error ignoradas → dueño operativo obligatorio + panel (ETS-004).

## Decisiones habilitadas
Framework único de consumidores, mapa de suscripciones, replay gobernado, paneles de frescura.

## Decisiones bloqueadas
Tecnología de mensajería concreta (el puerto la aísla; decisión de implementación con ETS-007/08) y políticas de reintento finas.
