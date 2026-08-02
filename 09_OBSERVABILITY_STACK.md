# 09_OBSERVABILITY_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de observabilidad: las señales que ETS-011/27 diseñó, con herramienta y hogar.
> Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación |
|---|---|---|
| **Instrumentación** | **OpenTelemetry (SDK y protocolo OTLP)** como estándar único de emisión | estándar abierto de facto; la aplicación se instrumenta UNA vez y los almacenes de análisis son sustituibles (principio de puertos aplicado a telemetría — ETS-011/27 §telemetría-como-puerto) |
| **Colector** | **OpenTelemetry Collector** entre la aplicación y los almacenes | desacopla emisión de destino: enrutamiento, muestreo y redacción de datos sensibles ocurren en el colector, no en el código |
| **Logs** | **Logs estructurados (JSON) a stdout** → colector → **Loki** | stdout es el contrato del contenedor (05); Loki indexa por etiquetas (tenant, operación, correlación) con costo de almacenamiento bajo — suficiente porque los logs de DeltaOps son solo anomalías (ETS-011/27 §registros) |
| **Tracing** | OTLP → **Tempo** (o Jaeger como visor equivalente; se fija en ADR del esqueleto) | una traza por comando/consulta con tramo por etapa de pipeline (ETS-011/27); correlación de punta a punta ya diseñada — aquí solo se le da hogar |
| **Métricas** | OTLP/Prometheus → **Prometheus** + **Grafana** para paneles | el modelo de métricas por operación/tenant/cursor de ETS-011/27 es naturalmente dimensional; Prometheus es el estándar; Grafana unifica métricas+logs+trazas en un solo panel |
| **Health checks** | endpoints estándar de vida y preparación por contenedor (web y workers) + **chequeo profundo programado** (BD, Redis, object storage, retraso de cursores) | el orquestador (05) reinicia por vida/preparación; el chequeo profundo alimenta alertas — el retraso de cursor ES la frescura publicada (ETS-011/27 §frescura única) |
| **Alertas** | **Alertmanager (Prometheus)** con las alertas diseñadas: presupuestos de latencia, tendencia (antes que incidente), tamaño de bandejas, retraso de cursores, errores género 3-4 | las alertas ya están definidas por diseño (ETS-011/26-27); aquí solo se les da motor; toda alerta tiene dueño — la alerta sin dueño se elimina |

## 2. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **Suites SaaS (Datadog, New Relic)** | excelentes y descartadas por costo creciente por volumen/host y dependencia propietaria (01 §2.5); OpenTelemetry deja la puerta abierta: si algún día conviene, es cambio de destino en el colector, no de código |
| **ELK (Elasticsearch para logs)** | costo operativo y de recursos muy superior a Loki para un volumen de logs deliberadamente bajo (solo anomalías); la búsqueda pesada de texto no es el caso de uso |
| **Sentry como pieza central** | útil para agregación de errores de frontend; puede sumarse después vía OTLP/SDK sin ser columna vertebral; el manejo de errores del backend ya está normado por taxonomía propia (ETS-012/15) |
| **Logging a archivos con rotación** | contrato de contenedor roto (05); stdout+colector es el patrón OCI |
| **StatsD/agente propietario** | OpenTelemetry lo reemplaza como estándar único |

## 3. Reglas de uso

1. **El código emite por OpenTelemetry y punto**: ningún módulo conoce Loki/Tempo/Prometheus; los destinos viven en la configuración del colector (sustituibles sin tocar aplicación).
2. **Nada de PII ni datos Restringidos en señales** (ETS-011/27 §regla 3): ids y códigos, jamás contenidos; el colector aplica redacción defensiva como segunda capa.
3. **Cardinalidad gobernada**: tenant y operación son dimensiones; los ids de entidad NO son dimensiones de métricas (van en trazas). La explosión de cardinalidad es el incidente clásico de Prometheus y se previene por regla, no por sorpresa.
4. **Los paneles se generan de los metadatos del catálogo** donde sea posible (ETS-011/27 §paneles generados): panel por operación y por consumidor, nacidos con la pieza.
5. El stack completo corre en el Compose de desarrollo (05 §regla 3): el diagnóstico por traza se aprende desde el primer día, no en el primer incidente.

---

## Impacto sobre la implementación
La observabilidad diseñada en ETS-011/27 queda instrumentable: OpenTelemetry en plataforma (pipelines y framework de consumidores la emiten por los módulos), colector como frontera, y Grafana como cara única de operación.

## Dependencias
05 (Compose que lo hospeda, stdout como contrato) · 07 (k6 integra métricas) · 10 (despliegue del stack) · ETS-011/27 (el diseño que esto materializa) · ETS-006/13 (clasificación para redacción).

## Riesgos
- Cardinalidad explosiva por dimensión indebida → regla 3 + revisión de toda métrica nueva.
- Stack de observabilidad caído dejando ciega la operación → el chequeo profundo y Alertmanager se monitorean cruzado (alerta de silencio); la aplicación jamás falla por telemetría caída (emisión best-effort).

## Decisiones habilitadas
Paneles por operación/tenant/cursor, alertas con dueño, diagnóstico por correlación en dev y prod, sustitución futura de destinos sin tocar código.

## Decisiones bloqueadas
Retención por señal y muestreo de trazas — ESI de operación, con datos reales de volumen.
