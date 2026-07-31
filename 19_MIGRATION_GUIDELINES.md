# 19_MIGRATION_GUIDELINES.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de migraciones físicas: cómo evoluciona el esquema PostgreSQL sin cortes.
> Materializa ETS-009/18 (expandir→migrar→contraer) en reglas operativas del motor. Documento de diseño. Sin SQL.

---

## 1. Régimen general

- **Toda migración es un artefacto versionado en el repositorio**, aplicado por el rol de migración (01 §3) mediante la herramienta única de migraciones (una sola vía; jamás DDL manual en entornos compartidos, 07 §5).
- Registro en `plataforma.migracion_aplicada`: qué, cuándo, duración, resultado — el estado del esquema es auditable.
- Cada migración ensayada contra una **restauración de producción** antes de producción (ETS-009/17 §6); las de tablas grandes, además con medición de duración y bloqueo.
- Orden de despliegue: migración expandida primero, código después (el esquema N es utilizable por el código N-1, ETS-009/18 §3) — el rollback de aplicación jamás exige rollback de datos.

## 2. Reglas de no-bloqueo (las que evitan incidentes)

| Operación | Regla |
|---|---|
| Crear índice | Siempre concurrente (sin bloquear escritura); en particionadas, por partición y luego el padre |
| Agregar columna | Solo nullable o con default no volátil (barato en PostgreSQL moderno); el NOT NULL llega después de poblar, como constraint validada en dos pasos |
| Constraint nueva (FK/CHECK) | NOT VALID primero, VALIDATE después (escaneo sin bloqueo exclusivo prolongado) |
| Poblado masivo (fase migrar) | Por lotes con pausa, medible y reanudable; jamás un UPDATE global en una transacción |
| Renombrar/cambiar tipo | Prohibido en sitio: columna nueva + convivencia + vista de compatibilidad (11 §1) + contraer cuando telemetría confirme no-uso |
| Retirar (contraer) | Solo con evidencia de no-uso (estadísticas del motor + telemetría de aplicación); reversible hasta el drop, y el drop de columnas/tablas espera un ciclo de versión adicional |
| Bloqueos | Toda migración con tiempo máximo de espera de bloqueo corto y reintento — antes esperar que encolar tras un bloqueo eterno |

## 3. Lo intocable

- Las migraciones **jamás reescriben contenido** de hechos, eventos ni versiones publicadas (NP-16): los cambios de forma histórica se resuelven con traducción al leer (upcasting) o proyección nueva — la uniformidad la da la lectura.
- Las migraciones no "corrigen datos de negocio": eso es un comando compensatorio del dominio con autoría real (ETS-009/18 §4). La única excepción: reparaciones técnicas de plataforma documentadas, auditadas y aprobadas caso a caso.
- RLS y privilegios append-only (12) se migran con revisión reforzada (tocar la muralla exige dos pares de ojos).

## 4. Read models: migrar ≠ migrar

Los derivados no se migran en sitio: **se reconstruyen** como versión nueva y se conmutan (10 §3). Una "migración" de read model es solo: crear estructura v2 + replay + conmutar vista + retirar v1 — sin fase de poblado incremental delicada.

---

## Impacto sobre la implementación
Define el pipeline de migraciones del proyecto (herramienta única, ensayo contra restauración, reglas de no-bloqueo codificadas en revisión); ningún DDL se aprueba fuera de estas reglas.

## ETS relacionados
ETS-009 (18 migraciones, 17 respaldos) · ETS-010 (07 §5 gobierno, 11 vistas de compatibilidad, 12 constraints) · ETS-008 (17 N/N-1).

## Riesgos
- La disciplina de dos pasos (NOT VALID→VALIDATE, nullable→NOT NULL) duplica migraciones y tienta atajos → plantillas de migración por patrón que lo hacen barato.
- Migraciones largas de poblado compiten con producción → lotes con pausa, en valle, con métrica de impacto y freno automático.

## Decisiones habilitadas
Elección de herramienta de migraciones, plantillas por patrón, integración con CI (lint de esquema 07, ensayo automático).

## Decisiones bloqueadas hasta el siguiente ETS
Herramienta concreta y el primer plan de DDL por fases (corresponde a la implementación gobernada por esta serie).
