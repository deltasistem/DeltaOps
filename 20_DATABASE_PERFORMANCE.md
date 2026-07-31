# 20_DATABASE_PERFORMANCE.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de rendimiento de la base de datos: cómo el modelo físico cumple los presupuestos.
> Hereda ETS-009/15 (pagar el costo en el momento barato) y los presupuestos de ETS-004/11. Documento de diseño. Sin SQL.

---

## 1. Presupuestos y dónde se cumplen

| Operación | Presupuesto (ETS-004/11) | Cómo lo cumple lo físico |
|---|---|---|
| Comando interactivo | Fracciones de segundo | Transacción mínima (agregado+eventos+outbox), append a partición actual, índices mínimos en la verdad (08), UUIDv7 (05) |
| Consulta de pantalla | Fracciones de segundo | Read model con la forma de la respuesta + índice compuesto por filtro (una búsqueda, cero agregación) |
| Dashboard / drill-down | ≤3 clics fluidos | `kpi_periodo_nodo` y agregaciones por nivel ya proyectadas (10) |
| Sincronización de lote móvil | Absorción sin degradar | Cola + procesamiento por elemento; `resultado_comando` indexado por clave (18) |
| Analítica/BI/reportes | No compite con operación | Réplicas + `marts`; rol de BI sin acceso a la verdad (01 §3, 11 §6) |

## 2. Palancas físicas permanentes

1. **Separación de cargas por conexión**: pools distintos para comandos, proyectores, consultas y BI — la saturación de uno no ahoga a los demás; los proyectores y replays a prioridad baja sobre réplicas.
2. **Poda de particiones** en todo lo particionado (09 §4): las consultas operativas tocan el presente físico.
3. **Autovacuum afinado por familia**: agresivo en estado vigente de agregados y read models calientes (alta tasa de update); relajado en hechos (append puro casi no genera trabajo); vigilancia del envejecimiento de transacciones como métrica de plataforma.
4. **Estadísticas y planes**: estadísticas extendidas donde los filtros correlacionan (tenant+contexto); revisión de planes en las rutas del catálogo como parte de la validación de presupuesto (ETS-008/18 §G).
5. **Sin trucos frágiles**: sin hints, sin desnormalización no declarada, sin caches dentro de la BD — la velocidad viene del modelo (read models), no de parches.

## 3. Observabilidad del rendimiento (de serie)

- Métricas por operación del catálogo: latencia por percentiles contra presupuesto, por tenant (ETS-007/10).
- Métricas físicas: retraso de cursores de proyección (= frescura real), retraso de réplicas, uso de índices (para retirar los muertos, 08 §3), tamaño y edad de particiones, bloqueos y esperas, transacciones largas (alerta: violan 07 §4).
- **La tendencia es la alarma** (ETS-009/15 §6): crecimiento de latencia o de retraso dispara trabajo antes de que el usuario lo sienta; una regresión tras un despliegue es un defecto con dueño.

## 4. Qué hacer cuando algo es lento (orden oficial)

1. ¿Falta poda de tiempo o índice de la consulta? (08) →
2. ¿La pregunta merece read model/agregación nueva? (10, por evidencia) →
3. ¿La carga pertenece a otra réplica/pool? (§2.1) →
4. ¿El volumen pide grano de partición más fino o temperatura? (09) →
5. ¿El dato pide motor especializado? (21 — última puerta, con su disciplina)

Jamás: relajar RLS, saltarse el read model consultando la verdad "por rapidez", o desindexar hechos sin pasar por la puerta de archivado.

---

## Impacto sobre la implementación
Configura pools, prioridades, autovacuum por familia y el tablero de métricas desde el arranque; institucionaliza el orden del §4 como runbook de rendimiento.

## ETS relacionados
ETS-009 (15) · ETS-004 (11 presupuestos) · ETS-007 (10 observabilidad, 16 performance) · ETS-010 (08, 09, 10, 21).

## Riesgos
- Pools mal dimensionados producen inanición cruzada → dimensionamiento inicial conservador + métricas de espera por pool.
- El presupuesto se valida en demo y se degrada con volumen → pruebas de carga con datos sintéticos al volumen del año cinco en las rutas críticas antes de liberar.

## Decisiones habilitadas
Runbook de rendimiento, pruebas de carga, paneles por tenant, política de réplicas.

## Decisiones bloqueadas hasta el siguiente ETS
Valores concretos de parámetros del motor, tamaños de pool y número de réplicas (con medición real).
