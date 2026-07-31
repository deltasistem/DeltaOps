# 16_CONSISTENCY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de consistencia: fuerte, eventual y compensaciones.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. El mapa de consistencia

```text
FUERTE (transaccional)          EVENTUAL (declarada)           COMPENSACIONES
dentro del agregado             entre módulos y hacia          cuando el mundo ya
y su outbox                     los read models                 registró algo que
                                                                el dominio corrige
```

La regla que ordena todo: **la frontera de la transacción es el agregado** (ETS-007 NT-04). Todo lo que exige verdad instantánea vive dentro de un agregado; todo lo que cruza agregados o módulos es eventual con frescura declarada; y lo irreversible ya ocurrido se corrige compensando, no deshaciendo.

## 2. Consistencia fuerte

Garantizada dentro de una transacción, y solo ahí:

- **Comando = un agregado:** validación de invariantes contra el estado vigente + nuevos eventos + registro en outbox, atómico (02 §1). O todo consta, o nada consta.
- Invariantes protegidos así: no despachar más del saldo (02 §4), SoD en aprobaciones, transiciones válidas del workflow con su versión, idempotencia (la clave se verifica en la misma transacción — repetido jamás duplica).
- Concurrencia optimista por versión del agregado: el segundo en llegar recibe `CONFLICTO_VERSION` con la representación actual (ETS-008/02) — nunca last-write-wins silencioso.
- **Lo que NO se promete:** transacciones entre agregados o módulos. Un comando que "necesitaría" tocar dos agregados está mal modelado o es un proceso (§3-4).

## 3. Consistencia eventual (declarada)

- Todo lo derivado — read models, vistas, marts, índice, réplica de Audit, cache — converge por consumo de eventos con cursor propio; el outbox garantiza que **converger es inevitable**: ningún evento se pierde, ningún consumidor se salta nada (a lo sumo se atrasa, visiblemente).
- La eventualidad **se declara, jamás se disimula** (`X-Frescura`, ETS-008/06): el usuario que registró un hecho lo ve reflejado en su propia vista inmediatamente (lectura de su escritura por sesión — la UX no muestra "desapareció" lo recién capturado, ETS-004), mientras el resto del mundo converge en segundos.
- Entre módulos: sincrónico solo hacia abajo (Core), todo lo demás por eventos (ETS-007 NT-05) — la consistencia entre Assets y Work Orders es eventual por diseño y las pantallas lo reflejan con estados honestos ("procesando").
- El offline es el caso extremo y normal de eventualidad: días de retraso, resuelto por validación a tiempo de negocio y conflictos de dominio (ETS-006/14) — no una anomalía, el mismo modelo.

## 4. Procesos entre agregados (sagas de dominio)

Los flujos que cruzan agregados (cerrar OT → descontar inventario → actualizar costos; compra → recepción → entrada) avanzan **por eventos, paso a paso, cada paso una transacción local**:

- Cada paso es idempotente (reintentable sin duplicar) y deja hecho + evento.
- No hay coordinador transaccional global ni bloqueo distribuido: hay coreografía de eventos con outbox — el proceso puede quedar temporalmente "a medias" y eso es un **estado visible y legítimo** (la OT cerrada con descuento de inventario en cola), jamás un estado corrupto.
- Un paso que no puede completarse no revierte los anteriores: **compensa** (§5) o queda en bandeja de atención con alerta — nunca silencio.

## 5. Compensaciones

- La corrección de lo ya registrado es siempre un **hecho compensatorio** enlazado con motivo (04 §4): anular un tanqueo mal digitado, reversar un movimiento de inventario, corregir horas — cada uno un comando `Corregir*`/`Anular*` del catálogo con sus propias validaciones y permisos (compensar también exige autorización).
- La compensación **propaga por los mismos eventos**: los read models re-proyectan el neto, los KPIs del periodo afectado se refinan por fecha de negocio (08 §3), el mart de BI la recibe como cualquier hecho — una sola mecánica para toda corrección.
- Compensaciones de proceso: si el paso 3 de una saga falla definitivamente, los pasos 1-2 se compensan con sus hechos inversos explícitos y la cadena completa queda auditada (qué avanzó, qué falló, qué se compensó, quién decidió).
- Lo que salió del sistema (correo enviado, webhook entregado, exportación descargada) no se puede des-enviar: la compensación emite el evento corrector y los consumidores externos lo reciben como cualquier otro (ETS-008/10) — el contrato jamás promete retractación mágica.
