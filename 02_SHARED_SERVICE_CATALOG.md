# 02 — Catálogo Oficial de Servicios

> **DeltaOps — ESI-006 · v1.0** · La lista cerrada de servicios compartidos de plataforma, con su propósito y sus consumidores previstos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El catálogo v1

| # | Servicio | Código | Propósito | Consumidores previstos |
|---|---|---|---|---|
| 1 | Notification | `notificaciones` | Avisar a personas por múltiples canales sobre hechos del sistema | Todos |
| 2 | Attachment | `adjuntos` | Archivos ligados a entidades de negocio | Todos |
| 3 | Comment | `comentarios` | Conversación contextual sobre entidades | OT, Compras, SST, Activos |
| 4 | Timeline | `cronologia` | Historia visible de una entidad (qué pasó, quién, cuándo) | Todos |
| 5 | Task | `tareas` | Pendientes personales y asignaciones ligeras transversales | OT, Compras, SST |
| 6 | Search | `busqueda` | Búsqueda global tipada sobre lo indexado por los módulos | Todos |
| 7 | Export | `exportaciones` | Generación de archivos descargables desde listados y reportes | Todos |
| 8 | Import | `importaciones` | Carga masiva validada de datos (maestros, movimientos) | Activos, Inventario, Compras |
| 9 | Report | `reportes` | Documentos formales parametrizados (PDF) con plantillas | Todos |
| 10 | Operational (QR/Barcode/NFC) | `identificacion_fisica` | Puente entre objetos físicos etiquetados y entidades del sistema | Activos, Inventario, Combustible, OT |
| 11 | AI Platform | `plataforma_ia` | Puerta única a proveedores de IA con gobierno (ESI-005/20) | OT, Combustible, SST |
| 12 | Integration | `integraciones` | Infraestructura común de integración externa (ESI-005/19) | Compras, Combustible, Inventario |
| 13 | Dashboard | `tableros` | Composición de tableros por rol/tenant desde widgets declarados | Todos |
| 14 | KPI | `indicadores` | Registro, cálculo y servicio de KPIs catalogados (ESI-005/13) | Todos |

## 2. Reglas del catálogo

1. **Cerrado con proceso de alta**: entrar al catálogo exige el criterio de admisión (doc 01 §3) y decisión de arquitectura (ESI-002/27); esta v1 es la lista completa autorizada.
2. **Cada servicio tiene ficha normativa** (docs 03-16) con los siete rubros de publicación obligatorios (capacidades, eventos, contratos, configuración, KPIs, permisos, consumidores).
3. **Códigos estables** en español, como los módulos (ESI-005/04).
4. **La matriz de consumo** (doc 22) mantiene la verdad de quién usa qué; "consumidores previstos" de esta tabla es diseño, la matriz es realidad.
5. **Prioridad de construcción**: la fija la demanda de los DGP-módulo (doc 26); ningún servicio se construye sin consumidor comprometido en el portafolio.

## Impacto sobre la implementación

Catorce DGP potenciales de servicios, secuenciados por demanda real; los DGP-módulo declaran qué servicios consumen y con qué urgencia.

## Dependencias

Doc 01; ETS-002 (funcionalidad), ESI-002/27; ESI-005/13, /19-20; docs 03-16 y 22.

## Riesgos

- Construir servicios "de catálogo" antes de que alguien los necesite; mitigación: regla §2.5 — demanda comprometida primero.

## Decisiones habilitadas

- Planificación del portafolio de servicios acoplada a la del portafolio de módulos.
- Contratos únicos por función transversal desde el día uno.

## Decisiones bloqueadas

- Prohibido añadir servicios fuera del proceso de alta.
- Prohibido construir servicios sin consumidor comprometido.
- Prohibido que dos servicios se solapen en propósito (el catálogo particiona).

## Reusable Pattern

La ficha de catálogo (propósito, código, consumidores + los siete rubros) es el formulario de todo servicio presente y futuro.

## Anti-Patterns

- El servicio 15 "misceláneo" para lo que no encaja.
- Catálogos paralelos por equipo o por moda tecnológica.
- Solapamientos tolerados ("dos búsquedas mientras tanto").

## Knowledge Graph

- **ETS que consume**: ETS-002 (transversales del producto), ETS-012 (expectativas de servicio).
- **ESI que consume**: ESI-002/27; ESI-005/13, /19, /20.
- **DGP que originará**: hasta catorce DGP de servicio, secuenciados por el doc 26.
- **ADR relacionados**: ADR de catálogo cerrado con proceso de alta (§2.1).
- **Módulos que reutilizarán este patrón**: todos; la columna de consumidores se materializa en la matriz del doc 22.
