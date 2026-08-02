# 17 — Observabilidad en Runtime

> **DeltaOps — ESI-003 · v1.0** · Métricas, trazas y señales: el sistema cuenta lo que hace sin que nadie se lo pregunte.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Los tres pilares y su papel

| Pilar | Pregunta que responde | Runtime |
|---|---|---|
| **Logs estructurados** | ¿Qué pasó exactamente aquí? | Doc 16 |
| **Métricas** | ¿Cómo se comporta el sistema en agregado? | Este documento |
| **Trazas** | ¿Por dónde pasó esta petición y dónde se gastó el tiempo? | Este documento |

La correlación (doc 09) une los tres: desde una alerta de métrica se llega a la traza, y de la traza a los logs.

## 2. Métricas oficiales de plataforma

La plataforma emite de serie, sin que los módulos hagan nada:

1. **Del borde**: peticiones por ruta y resultado, latencia por percentiles, tamaño de respuestas, denegaciones por tipo (401/403/capacidad).
2. **De runtimes**: transacciones de UoW (duración, resultado), eventos despachados y consumidos, profundidad y edad de bandejas, reintentos, trabajos de background por resultado.
3. **De dependencias**: estado y latencia de BD, almacén de archivos e integraciones externas (docs 23/24).
4. **De proceso**: memoria, conexiones del pool, estado del ciclo de vida (doc 03).
5. **De negocio agregadas por tenant**: uso por capacidad (doc 07) — señal de producto, sin PII.

Los módulos pueden añadir métricas propias por el puerto de observabilidad del Kernel, con nombre conforme a convención (doc 26) y revisión normal de PR.

## 3. Trazas

1. Toda petición HTTP y todo consumo de mensaje abre una traza; los tramos estándar (middleware, caso de uso, UoW, repositorios, llamadas externas) los instrumenta la plataforma.
2. La traza cruza la frontera asíncrona: el sobre del evento porta la referencia (doc 09, ETS-008), de modo que causa y consecuencia quedan unidas.
3. El muestreo es configurable por plano despliegue (doc 08): total en DEV/QA, muestreado en PROD según coste.

## 4. Reglas normativas

1. **Instrumentación por plataforma, no por módulo**: el módulo obtiene su observabilidad gratis; solo añade métricas de negocio deliberadas.
2. **Estándar abierto**: la instrumentación sigue el estándar de telemetría abierto aprobado en ESI-001; prohibido acoplarse a un proveedor concreto de APM.
3. **Cardinalidad controlada**: prohibidas etiquetas de cardinalidad alta (identificadores de recurso, correlaciones) en métricas; eso es trabajo de trazas y logs.
4. **Sin PII en telemetría**: mismas reglas que logs (doc 16, regla 1); el tenant se etiqueta por identificador opaco.
5. **Toda alerta tiene respuesta escrita**: una métrica con umbral de alerta sin procedimiento asociado es ruido; las alertas se definen junto a su acción (ESI-002/28, patrón señal→respuesta).

## Impacto sobre la implementación

El DGP de plataforma implementa el puerto de observabilidad, la instrumentación estándar y el catálogo inicial de métricas. La operación define recolección y retención fuera de la aplicación.

## Dependencias

Docs 03, 08, 09, 10, 16 y 18-24; ESI-001 (estándar de telemetría); ESI-002/09.

## Riesgos

- Coste de telemetría descontrolado en PROD; mitigación: muestreo configurable y cardinalidad controlada (reglas 2-3).
- Métricas de negocio usadas para evaluar personas; mitigación: prohibición heredada de ESI-002/14 — las métricas evalúan sistema y plataforma.

## Decisiones habilitadas

- Tableros operativos y de producto sobre las métricas de serie.
- Presupuestos de latencia verificables por tramo (doc 10).

## Decisiones bloqueadas

- Prohibida la instrumentación manual dispersa en módulos para lo que la plataforma ya cubre.
- Prohibido acoplarse a un APM propietario.
- Prohibidas etiquetas de alta cardinalidad en métricas.
