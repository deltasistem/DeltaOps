# 16_HISTORY_STRATEGY.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de historización física: cómo la BD responde "cómo era el mundo en cualquier fecha".
> Regla heredada: la historia no se guarda aparte — la historia ES el sistema (eventos + hechos + versiones); este documento fija cómo se consulta eficientemente.
> Documento de diseño. Sin SQL.

---

## 1. Las cuatro mecánicas de historia (ya presentes en el modelo)

| Mecánica | Dónde | Responde |
|---|---|---|
| **Eventos por agregado** | `evento_*` con `(id_agregado, secuencia)` | La historia completa de cualquier entidad, paso a paso |
| **Hechos con tiempo doble** | Tablas de hechos (`fecha_negocio` + `creado_en`) | Qué ocurrió en un periodo (negocio) y qué se sabía cuándo (registro) |
| **Vigencias** | Membresías, asignaciones, nodos, configuraciones (`vigente_desde/hasta`) | Qué regía/quién era responsable en una fecha (predicado de intervalo, 04 §3) |
| **Versiones inmutables** | `*_version` | Con qué definición exacta se interpretó cada hecho |

**No se usan**: tablas espejo `_history` pobladas por triggers (duplican lo que los eventos ya son, con menos semántica), ni columnas `valido_desde/hasta` en agregados (el estado vigente es solo vigente; el pasado se deriva).

## 2. Estado a una fecha (as-of)

- **Ruta normal**: snapshot más cercano anterior + eventos posteriores (ETS-009/09 §4). Físicamente: tabla de snapshots por dominio que los usa (`activos.snapshot_activo` con `(id_activo, secuencia, estado JSONB)`), poblada por el job de umbral.
- **Ruta proyectada**: para las preguntas as-of frecuentes (saldos a fin de mes, dotación a una fecha) existen fotos de corte en `lectura_*` (09 §1) — la respuesta es una búsqueda, no una reconstrucción.
- **Ruta forense**: replay completo desde `evento_*` (audit_consulta, gobernado) — para lo infrecuente y probatorio.

## 3. Reglas físicas

1. Los snapshots son **derivados desechables** (se regeneran del flujo); sus tablas viven junto al dominio pero sin respaldo como verdad (ETS-009/09 §4); esquema JSONB con versión de esquema del snapshot.
2. Las consultas as-of declaran contra qué tiempo operan (negocio vs registro) — el contrato lo exige (ETS-008/02); los índices `(id_tenant, fecha_negocio)` y las fotos de corte sirven cada eje.
3. Las correcciones tardías perfeccionan la historia (fecha de negocio) sin reescribirla (fecha de registro): "el KPI de marzo reportado en abril" y "el KPI de marzo como se conoce hoy" son dos preguntas legítimas y ambas respondibles — la primera por la foto congelada del cierre, la segunda por la proyección viva.
4. La verificación de honestidad (reconstruir muestra desde eventos y comparar con estado vigente/snapshots) corre programada (ETS-009/09 §4) y registra en `plataforma.resultado_reconciliacion`.

---

## Impacto sobre la implementación
Prohíbe triggers de historia y tablas espejo; obliga a implementar snapshots por umbral y fotos de corte como jobs de proyección; las consultas as-of del catálogo (ETS-008/04) se sirven por las rutas del §2.

## ETS relacionados
ETS-009 (09 snapshots, 04 tiempo doble, 08 cortes) · ETS-008 (02 frescura/tiempo, 04 consultas) · ETS-010 (04 vigencias, 09 particiones).

## Riesgos
- Preguntas as-of nuevas sin ruta proyectada caen en replay costoso → el catálogo de fotos de corte crece por evidencia (ETS-009/08 §2).
- Snapshots con esquema desactualizado tras cambios → llevan versión de esquema y se descartan/regeneran, jamás se migran (ETS-009/09 §4).

## Decisiones habilitadas
Jobs de snapshot y corte, consultas as-of del catálogo, verificación de honestidad.

## Decisiones bloqueadas hasta el siguiente ETS
Umbrales concretos de snapshot por dominio (con datos de volumen real) y el formato interno del estado serializado.
