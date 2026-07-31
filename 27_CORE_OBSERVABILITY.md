# 27_CORE_OBSERVABILITY.md

> **DeltaOps — ETS-011 · v1.0** · Observabilidad del Core: el núcleo se explica a sí mismo por diseño.
> Complementa la observabilidad de plataforma (ETS-007/10) con lo que solo el Core puede contar de sí.
> Documento de diseño. Sin código.

---

## 1. Qué emite el Core (por construcción, no por decoración)

| Señal | Contenido | Origen |
|---|---|---|
| **Traza por operación** | Una traza por comando/consulta con un tramo por etapa del pipeline (11-12): idempotencia, autorización, validación, resolución, dominio, UoW | Los pipelines la abren/cierran; los casos de uso no instrumentan a mano |
| **Métricas de operación** | Latencia por percentiles contra presupuesto (ETS-004/11), tasa por Resultado (confirmado/rechazado/apartado), por operación del catálogo y por tenant | Pipeline, automática por metadatos (03 §3.6) |
| **Métricas de derivados** | Retraso de cada cursor de consumidor (= frescura real publicada), tamaño de bandejas de error, duración de proyección | Framework de consumidores (10) |
| **Métricas de negocio del Core** | Apartados por causa, denegaciones por operación, conflictos de versión, aceptación de sugerencias IA, entregas de integración por desenlace | Hechos ya persistidos — se proyectan como cualquier read model |
| **Registros estructurados** | Solo lo anómalo (géneros 3-4 de 26) con correlación completa; el camino feliz no llena registros — la traza ya lo cuenta | Fronteras y bandejas |

## 2. Reglas normativas

1. **La correlación es de punta a punta**: el id nace en el borde (o llega del cliente, ETS-008/02), viaja por el Contexto de Ejecución (02), entra al sobre de cada evento y llega a cada consumidor — un clic de soporte reconstruye la cadena comando→eventos→proyecciones→notificaciones.
2. **La telemetría es un puerto** (06): el dominio jamás importa librerías de observabilidad; los pipelines y adaptadores emiten; el dominio es silencioso (su historia son los eventos).
3. **Nada de PII ni datos Restringidos en señales** (ETS-006/13): las trazas llevan ids y códigos, no contenidos; el dato sensible se consulta con autorización, no se pesca en los registros.
4. **Presupuestos como alarmas** (ETS-010/20 §3): la tendencia dispara antes que el incidente; regresión tras despliegue = defecto con dueño.
5. **Por tenant siempre**: toda métrica es segmentable por tenant (aislamiento también en la operación: el ruido de uno no esconde el dolor de otro; base del costo por tenant, ETS-007/10).
6. **La frescura publicada es la medida real** (12 §2.4): el mismo retraso de cursor que ve el usuario en `X-Frescura` es el que ve la operación en el panel — una sola fuente, sin versiones optimistas.

---

## Impacto sobre la implementación
La instrumentación vive en plataforma (pipelines, framework de consumidores, adaptadores) y los módulos la heredan gratis; los paneles por operación/tenant/cursor se generan de los metadatos del catálogo.

## ETS relacionados
ETS-007 (10 observabilidad de plataforma) · ETS-004 (11 presupuestos) · ETS-008 (02 correlación y frescura) · ETS-011 (10, 11, 12, 26).

## Riesgos
- Instrumentación manual dispersa en casos de uso → prohibida por §2.2; lo automático del pipeline es la norma.
- Cardinalidad explosiva (métrica por tenant × operación) → agregación disciplinada y retención por resolución; el detalle fino vive en trazas muestreadas.

## Decisiones habilitadas
Paneles generados, alarmas por presupuesto y tendencia, soporte por correlación, costo por tenant.

## Decisiones bloqueadas
Plataforma concreta de telemetría y políticas de muestreo/retención — implementación (con ETS-007/10).
