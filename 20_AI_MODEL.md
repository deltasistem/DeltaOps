# 20 — Modelo de IA

> **DeltaOps — ESI-005 · v1.0** · Cómo un módulo de negocio incorpora capacidades de IA sin comprometer determinismo, auditoría ni fronteras.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Principio rector

La IA en DeltaOps es **asistiva y acotada**: propone, prioriza, resume o detecta; **no ejecuta comandos de negocio por sí misma**. Toda acción con efecto sigue siendo un comando del patrón, disparado por un humano (o por una regla determinista declarada), con su pipeline completo de denegaciones y auditoría.

## 2. Los usos permitidos (catálogo cerrado inicial)

| Uso | Ejemplo en el dominio | Naturaleza |
|---|---|---|
| **Sugerencia** | Diagnóstico probable de falla a partir del historial del activo; sugerencia de repuestos para una OT | Salida hacia el humano, quien decide |
| **Priorización/detección** | Anomalías de consumo de combustible; riesgo de incumplimiento del plan | Genera señales/elementos de revisión, no efectos |
| **Extracción/resumen** | Estructurar una descripción de falla dictada en campo; resumir el historial de un activo | Asistencia de captura y lectura |

Usos fuera del catálogo (incluida cualquier ejecución autónoma) requieren decisión de arquitectura y ampliación de este catálogo por el proceso único (ESI-002/27).

## 3. Reglas

1. **La IA vive detrás de un puerto** (ETS-011): el módulo declara el puerto ("sugeridor de diagnóstico") con contrato tipado; el proveedor de modelo es un adaptador sustituible de plataforma. Sin llamadas directas a proveedores desde módulos.
2. **Salidas marcadas y trazadas**: toda salida de IA se presenta como tal al usuario, se registra con el modelo/versión que la produjo, y su aceptación o rechazo por el humano queda auditada — la aceptación es el comando; la sugerencia es su contexto.
3. **No determinismo confinado**: ninguna Policy, invariante ni validación depende de una salida de IA. Las decisiones de negocio siguen siendo deterministas y reproducibles; la IA opera antes (asistir la captura) o después (leer resultados), nunca dentro de la transacción de decisión.
4. **Datos bajo las murallas**: los contextos enviados al puerto respetan la clasificación de datos (doc 15) y el aislamiento de tenant (doc 17); prohibido mezclar datos de tenants en un mismo contexto de inferencia; el uso de datos para mejorar modelos es decisión de gobierno de datos (ETS-009), no default.
5. **Capacidad propia**: las funciones de IA de un módulo son capacidades separadas (doc 05), habilitables por tenant, deshabilitadas por defecto.
6. **Degradación limpia**: con el puerto caído, el módulo opera completo sin IA; la asistencia es prescindible por construcción.

## Impacto sobre la implementación

Los DGP declaran sus puertos de IA con contrato, capacidad y catálogo de uso; la plataforma provee el adaptador de proveedor y su gobierno.

## Dependencias

ETS-009/011; ESI-002/27; docs 05, 15 y 17; ESI-004/17 (auditoría).

## Riesgos

- Deriva hacia la autonomía por presión de producto ("que la IA cierre la OT"); mitigación: el catálogo cerrado §2 y la regla §3.3 son bloqueantes; ampliarlos exige decisión formal con análisis de riesgo.

## Decisiones habilitadas

- Funciones de IA por tenant, vendibles y desconectables como capacidades.
- Sustitución de proveedor de modelo sin tocar módulos.

## Decisiones bloqueadas

- Prohibida la ejecución autónoma de comandos por IA.
- Prohibidas decisiones deterministas de negocio dependientes de inferencia.
- Prohibidas llamadas directas a proveedores de IA desde módulos.

## Reusable Pattern

El catálogo de usos §2 + las seis reglas §3 como formulario de "funciones de IA" del DGP: uso, puerto, contrato, capacidad, datos enviados, degradación.

## Anti-Patterns

- Salidas de IA sin marcar presentadas como datos del sistema.
- Prompts con datos crudos sin pasar por la clasificación.
- "Auto-aprobar si la confianza > X" — autonomía disfrazada de umbral.

## Knowledge Graph

- **ETS que consume**: ETS-009 (gobierno de datos), ETS-011 (puertos), ETS-012 (expectativas de producto).
- **ESI que consume**: ESI-002/27; ESI-004/17; docs de esta serie 05, 15, 17.
- **DGP que originará**: la sección "funciones de IA" de los DGP que las incluyan; un DGP de plataforma para el adaptador de proveedor.
- **ADR relacionados**: ADR de IA asistiva no autónoma (este documento §1, elevable a ADR de producto).
- **Módulos que reutilizarán este patrón**: OT (diagnóstico, repuestos), Combustible (anomalías), SST (clasificación de incidentes); Activos e Inventario como fuentes de contexto.
