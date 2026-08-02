# 26 — Relación con DGP

> **DeltaOps — ESI-006 · v1.0** · Cómo el estrato compartido se materializa en DeltaOps Generation Packages: qué DGP existen y cómo se entrelazan con el portafolio de módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Las dos familias de DGP del estrato

| Familia | Contenido | Cuántos |
|---|---|---|
| **DGP-Servicio** | Un paquete por servicio del catálogo: declaración completa (doc 21), contratos, marcas que define, checklist CS (doc 24), madurez objetivo | Hasta 14 (doc 02), secuenciados por demanda |
| **Extensiones de plataforma** | Las piezas transversales nuevas que esta serie identificó: evaluación derivada de permisos (doc 19), catálogo de marcas (doc 18), niveles de configuración (doc 20), registro extendido (doc 21) | Un DGP de plataforma previo al primer servicio |

Los DGP-módulo (ESI-005/27) **añaden secciones de consumo**: catálogo de tipos de notificación, categorías de adjuntos, marcas de cronología/indexación, plantillas de importación, definiciones de reporte, widgets, reglas de pendiente, funciones de IA, KPIs registrados — cada ficha (docs 03-16) definió la suya.

## 2. La secuencia (entrelazada con el portafolio ESI-005/27)

1. **Extensiones de plataforma** — antes que todo servicio (§1).
2. **Ola 1, con Activos**: Indicadores, Búsqueda, Adjuntos, Cronología, Exportaciones, Importaciones, Identificación física — las columnas D/C de Activos en la matriz (doc 22 §2.3).
3. **Ola 2, con OT ∥ Inventario**: Notificaciones, Comentarios, Tareas, Reportes, Tableros.
4. **Ola 3, con Compras ∥ Combustible**: Integraciones, Plataforma IA.
5. **SST** no introduce servicios nuevos: consume el estrato completo — la prueba de que la declaración basta (doc 18 §2.1).

## 3. Reglas

1. **Ningún DGP-Servicio sin consumidor comprometido en la ola** (doc 02 §2.5); la matriz manda sobre el entusiasmo.
2. **Un servicio entra a la ola en M1 y madura con ella**: la meta de M2 se alcanza cuando el segundo módulo de la ola lo consume (doc 23).
3. **Dependencias entre DGP explícitas**: servicio→extensiones de plataforma; módulo→servicios de su ola (blandas salvo declaración, doc 23 §2.4); el grafo de DGP se publica con el portafolio.
4. **Cada DGP cita, no repite**: los DGP-Servicio citan las fichas de esta serie como norma; el contenido nuevo es lo específico (contratos detallados, plantillas, baterías).

## Impacto sobre la implementación

El portafolio total = DGP de plataforma + DGP-módulo (ESI-005/27) + DGP-Servicio entrelazados por olas; la planificación gana un eje pero ninguna pieza nueva de proceso.

## Dependencias

ESI-005/27; docs 02, 18-24; ESI-002 (proceso de generación).

## Riesgos

- La ola 1 sobrecargada (siete servicios + Activos); mitigación: los siete de la ola 1 son los de menor complejidad relativa (satélites y derivados) y admiten M1 mínimo; el corte fino lo decide el portafolio con la matriz en la mano.

## Decisiones habilitadas

- Plan de construcción total del sistema (módulos + servicios) con dependencias explícitas.
- SST como validación del modelo declarativo (§2.5).

## Decisiones bloqueadas

- Prohibido iniciar DGP-Servicio fuera de su ola sin decisión de portafolio.
- Prohibido el primer servicio antes de las extensiones de plataforma.
- Prohibidos DGP que dupliquen normas de esta serie en vez de citarlas.

## Reusable Pattern

Olas de servicios ancladas a los módulos que las demandan + un DGP de extensiones previo: el patrón de secuenciación para todo crecimiento futuro del estrato.

## Anti-Patterns

- Construir los catorce servicios "de una vez" antes del primer módulo.
- DGP-Servicio sin sección de consumo correspondiente en los DGP-módulo de su ola.
- Tratar las extensiones de plataforma como "mientras tanto" sin DGP propio.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (el producto que ordena las olas).
- **ESI que consume**: ESI-002 (generación); ESI-005/27 (portafolio de módulos).
- **DGP que originará**: DGP de extensiones de plataforma + hasta 14 DGP-Servicio + secciones de consumo en los seis DGP-módulo.
- **ADR relacionados**: ADR de secuenciación por demanda (doc 02 §2.5).
- **Módulos que reutilizarán este patrón**: los seis; Activos ancla la ola 1 y SST valida el modelo declarativo completo.
