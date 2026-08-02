# 22 — Cross Module Matrix

> **DeltaOps — ESI-006 · v1.0** · La matriz módulos × servicios: quién consume qué, con qué intensidad y por qué vía.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La matriz de diseño v1

Consumo previsto (D = declarante/emisor intensivo, C = consumidor estándar, · = no previsto en v1):

| Servicio ↓ / Módulo → | Activos | OT | Inventario | Compras | Combustible | SST |
|---|---|---|---|---|---|---|
| Notificaciones | C | D | C | D | C | D |
| Adjuntos | C | D | C | D | C | D |
| Comentarios | C | D | · | D | · | D |
| Cronología | D | D | C | C | C | C |
| Tareas | · | D | · | D | · | D |
| Búsqueda | D | C | D | C | C | C |
| Exportaciones | D | C | D | C | C | C |
| Importaciones | D | · | D | D | · | · |
| Reportes | D | D | C | D | C | D |
| Identificación física | D | C | D | · | D | D |
| Plataforma IA | · | D | · | · | D | D |
| Integraciones | · | · | D | D | D | · |
| Tableros | C | D | D | C | C | C |
| Indicadores | D | D | D | D | D | D |

## 2. Reglas

1. **La matriz de diseño guía; la observada manda**: esta tabla fija expectativas de v1; la matriz **observada** se deriva de declaraciones (registro, doc 21) y telemetría de consumo real, y se publica en el mapa vivo (ESI-004/21). Las celdas se reconcilian en cada revisión periódica.
2. **Toda celda nueva es declarativa**: un módulo empieza a consumir un servicio declarándolo (marcas, plantillas, definiciones) — la celda aparece en la observada sin tocar este documento; la matriz de diseño se actualiza por versión de la serie.
3. **Las celdas justifican el portafolio**: la secuencia de DGP de servicios (doc 26) se ordena por columnas comprometidas — un servicio sin celdas del primer módulo del portafolio no se construye primero.
4. **Doble uso de la matriz**: hacia adelante (planificación: qué servicios necesita el próximo módulo) y hacia atrás (impacto: a quién afecta cambiar un servicio — el insumo del análisis N/N-1).

## Impacto sobre la implementación

Ningún componente propio: la matriz observada es una vista derivada del registro + telemetría; esta tabla es el criterio de aceptación de cobertura de cada DGP.

## Dependencias

Docs 02-16 (celdas provenientes de las fichas), 21 y 26; ESI-004/21; ESI-005/27 (portafolio).

## Riesgos

- La matriz de diseño fosilizada mientras la realidad diverge; mitigación: reconciliación periódica §2.1 con divergencias tratadas como hallazgos (celda observada sin diseño = decisión pendiente; celda de diseño nunca observada = sobre-ingeniería).

## Decisiones habilitadas

- Priorización de servicios con evidencia (columnas del portafolio).
- Análisis de impacto de cambios de servicio con radio explícito.

## Decisiones bloqueadas

- Prohibido consumo módulo→servicio no declarado (sin celda observable).
- Prohibido construir servicios para celdas vacías del portafolio vigente.
- Prohibido cambiar contratos de servicio sin recorrer su fila de consumidores.

## Reusable Pattern

Matriz diseño vs. observada con reconciliación: el patrón para gobernar cualquier relación muchos-a-muchos declarada del sistema (módulos×servicios hoy; módulos×integraciones mañana).

## Anti-Patterns

- Celdas "por si acaso" que inflan servicios tempranos.
- Consumo real invisible (integración sin declaración) tolerado.
- Usar solo la matriz de diseño para análisis de impacto en producción.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (los módulos y sus necesidades transversales).
- **ESI que consume**: ESI-004/21; ESI-005/27.
- **DGP que originará**: criterios de cobertura en cada DGP (módulo y servicio); la vista observada en el DGP de plataforma.
- **ADR relacionados**: ADR diseño-vs-observado (§2.1).
- **Módulos que reutilizarán este patrón**: los seis; Indicadores es la única fila universal-declarante (todo módulo publica KPIs).
