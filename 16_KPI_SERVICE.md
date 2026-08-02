# 16 — KPI Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de indicadores: el registro único de definiciones de KPI y el punto único de servicio de sus valores.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y reparto

ESI-005/13 fijó el estándar (definición como contrato, tres rutas por frescura, fechaNegocio, dueños). Este servicio lo materializa como pieza única:

| Es del módulo | Es del KPI Service |
|---|---|
| Definir sus KPIs (fórmula, dimensiones, dueño) y producir los datos fuente (proyecciones, eventos hacia la ruta analítica) | El **registro** de definiciones catalogadas y versionadas, y el **servicio de valores**: una consulta única de KPIs para tableros, reportes y API |
| La semántica del indicador | Que toda superficie lea el mismo número |

El servicio es el guardián anti-bifurcación: si dos pantallas muestran MTTR distinto, el defecto es localizable — hay una sola puerta de salida de valores.

## 2. Reglas

1. **Registro obligatorio**: todo KPI publicado por un módulo vive en el registro con su ficha completa (ESI-005/13 §2.1) y su versión; las superficies consultan por clave de KPI catalogada.
2. **El servicio enruta, no calcula negocio**: según la ruta declarada del KPI (operativo → proyección del módulo; histórico → ruta analítica ETS-007; instantáneo → consulta del módulo), el servicio resuelve la fuente y sirve el valor con su metadato (corte, frescura, versión de definición). La fórmula vive donde la ruta manda; el servicio garantiza la puerta única.
3. **Valores con contexto siempre**: todo valor servido lleva corte temporal, dimensión y versión de definición — un número sin metadato es ilegible y el contrato lo impide.
4. **Cambios de definición versionados** (ESI-005/28 §2.2): v1 y v2 conviven el ciclo N/N-1; los consumidores migran citando versión; el histórico no se reescribe.
5. **Umbrales y metas por tenant**: la definición es del producto; las metas (disponibilidad objetivo 95%) son configuración del tenant sobre el KPI — habilitan semáforos y alertas de negocio (vía doc 03) sin bifurcar fórmulas.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `indicadores` (consulta; por tenant), `metas_y_umbrales` (configuración de metas).
- **Eventos**: "Umbral de KPI Superado" (v1) — insumo de notificaciones de negocio.
- **Contratos**: consulta de valores por clave+dimensiones+período; registro de definiciones (módulos); administración de metas (tenant).
- **Configuración**: metas y umbrales por KPI y dimensión, calendarios de comparación del tenant.
- **KPIs (propios del servicio)**: consultas por KPI/superficie, frescura observada por ruta, definiciones sin consumo (candidatas a retiro).
- **Permisos**: `INDICADORES.CONSULTAR` (afinable por grupo de KPIs si el tenant lo exige), `INDICADORES.METAS.ADMINISTRAR`.
- **Consumidores**: tableros (doc 15), reportes (doc 11), API pública de contratos (ETS-008); todos los módulos como registradores.

## Impacto sobre la implementación

DGP propio (registro, enrutador de valores, metas/umbrales); los DGP-módulo registran sus catálogos de KPIs aquí (la sección de ESI-005/13 se materializa contra este servicio).

## Dependencias

ESI-005/13 y /28; ETS-006/007; docs 03, 11 y 15; ESI-002/21.

## Riesgos

- El enrutador degenerando en motor de cálculo (fórmulas migrando al servicio); mitigación: la frontera §1 es normativa; el servicio sirve valores producidos por las rutas, con la única excepción de agregaciones aritméticas declaradas en la ficha (suma/promedio sobre dimensiones).

## Decisiones habilitadas

- Un solo número por indicador en todo el producto, con versión y corte visibles.
- Alertas de negocio por umbral sin lógica en módulos ni tableros.

## Decisiones bloqueadas

- Prohibido servir KPIs fuera de la puerta única.
- Prohibido recalcular fórmulas en superficies (tableros, reportes, clientes).
- Prohibido reescribir valores históricos ante cambios de definición.

## Reusable Pattern

Registro de definiciones versionadas + puerta única de valores con metadato + metas por tenant: el patrón de todo dato "oficial" servido a múltiples superficies.

## Anti-Patterns

- KPIs "rápidos" calculados en el frontend (AP de ESI-005/13).
- Definiciones duplicadas con matices por superficie.
- Metas del tenant hardcodeadas en fórmulas.

## Knowledge Graph

- **ETS que consume**: ETS-006 (fechas), ETS-007 (ruta analítica), ETS-008 (contratos).
- **ESI que consume**: ESI-005/13 y /28; ESI-002/21.
- **DGP que originará**: DGP-Indicadores; el registro de catálogos de KPIs de cada DGP-módulo.
- **ADR relacionados**: ADR de puerta única de valores (§1); ADR de tres rutas (ESI-005/13 §2.2).
- **Módulos que reutilizarán este patrón**: todos; tableros y reportes son los consumidores universales.
