# 21_STORAGE_EVOLUTION.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de almacenamiento futuro: cómo el modelo físico PostgreSQL evoluciona sin romper nada.
> Hereda la disciplina de ETS-009/19 (motores nuevos detrás de los mismos contratos, poblados por replay). Documento de diseño. Sin SQL.

---

## 1. Palancas dentro de PostgreSQL (antes de cualquier motor nuevo)

El orden oficial de crecimiento — cada palanca aplaza la siguiente:

1. **Vertical y réplicas**: más capacidad en la primaria; más réplicas para lectura (20).
2. **Temperaturas agresivas** (09 §3): menos datos calientes = todo más rápido, sin cambiar nada lógico.
3. **Sub-particionado / grano más fino** en las tablas de mayor volumen (lecturas, telemetría aceptada).
4. **Aislamiento por tenant grande**: particiones dedicadas por tenant o, contractualmente, clúster dedicado — posible porque `id_tenant` está en todas las claves y RLS aísla lógicamente (ETS-009/14 §2); migrar un tenant = exportar por su clave y replay de derivados.
5. **Extracción de esquemas derivados**: `marts`, `lectura_busqueda` o `audit_consulta` a instancias propias — son reconstruibles, la mudanza es replay + conmutación (10 §3), sin tocar la verdad.
6. **Extracción de un módulo**: su(s) esquema(s) de verdad a clúster propio si un módulo se separa como servicio (ETS-007) — la ausencia de FKs físicas entre módulos (06 §2) lo hace posible; las excepciones estructurales (tenant/contexto/actor) exigirían réplica local de esas tablas de referencia, decisión documentada en su momento.

## 2. Salidas previstas a motores especializados (ETS-009/19)

| Necesidad | Disparador medido | Movimiento |
|---|---|---|
| Series de tiempo (lecturas/telemetría) | Ingesta o consulta de series degradando pese a 1-3 | Motor de series como consumidor del flujo; PostgreSQL conserva la verdad aceptada; consultas de series conmutan de read model |
| Búsqueda avanzada | Texto completo nativo insuficiente (facetas, relevancia, semántica) | Motor de búsqueda poblado por los mismos proyectores; `lectura_busqueda` se retira por conmutación |
| Lakehouse / analítica profunda | Preguntas multi-año frecuentes que exigen rehidratación | El frío columnar (09 §3) + motor de consulta federada encima — el formato ya está |
| Warehouse dedicado | Marts superan a las réplicas | Mismo contrato de marts, motor distinto detrás (nadie aguas abajo lo nota) |

Toda salida pasa la puerta de adopción de ETS-009/19 §8 (dolor medido, replay, mismos contratos, respaldo equivalente, plan de salida).

## 3. Lo que nunca cambia

La verdad append-only con su cadena de auditoría permanece en el motor transaccional gestionado; los UUID y el sobre del hecho hacen portable todo; los contratos ETS-008 aíslan a todos los clientes de cualquier mudanza física. **Evolucionar el almacenamiento jamás es un proyecto de reescritura: es replay y conmutación.**

---

## Impacto sobre la implementación
Fija el orden de palancas ante crecimiento (runbook de escala) y las condiciones de salida a motores nuevos; la implementación no debe introducir nada que ate a PostgreSQL más allá de lo declarado (sin lógica de negocio en el motor, 11 §2, 12 §2).

## ETS relacionados
ETS-009 (19 evolución, 14 particionado) · ETS-007 (13 escalabilidad, 14 cloud) · ETS-010 (06 sin FKs cross-módulo, 09 temperaturas, 10 conmutación).

## Riesgos
- Adoptar motor nuevo por moda antes de agotar palancas → puerta de adopción disciplinada.
- Acoplamientos accidentales al motor (funciones propietarias con lógica de negocio) → prohibidos por convención; el lint y la revisión los detectan.

## Decisiones habilitadas
Runbook de escala, planes de tenant dedicado, evaluación futura de motores especializados.

## Decisiones bloqueadas hasta el siguiente ETS
Cualquier adopción concreta (exige dolor medido en producción) y el diseño del clúster dedicado por tenant (contractual, caso a caso).
