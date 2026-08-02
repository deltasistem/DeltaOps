# 11 — Report Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de reportes: documentos formales parametrizados — órdenes impresas, certificados, informes — con plantillas gobernadas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y frontera

Un **reporte** es un documento formal con formato (típicamente PDF): la OT imprimible para el técnico, el informe de incidente SST, el acta de recepción de compras. Se distingue de sus vecinos:

| Pieza | Naturaleza |
|---|---|
| Exportación (doc 09) | Datos tabulares crudos para análisis |
| Tablero (doc 15) | Vista interactiva en pantalla |
| **Reporte** | **Documento formal con diseño, para imprimir, firmar o archivar** |

| Concepto | Definición |
|---|---|
| **Definición de reporte** | Declarada por el módulo: consultas fuente (del plano de lectura propio), plantilla de diseño versionada, parámetros tipados |
| **Generación** | Instancia: parámetros + momento de corte + generador como trabajo (patrón doc 09); entrega vía adjuntos con categoría "reporte" |
| **Plantilla** | Diseño versionado con variantes por tenant permitidas solo en zonas declaradas (logo, encabezado, pie legal) |

## 2. Reglas

1. **Los datos, del módulo dueño con los permisos del solicitante** (regla del doc 09 §2.1); el servicio compone y da formato, no accede a datos por cuenta propia.
2. **El reporte es fotografía**: corte declarado, parámetros visibles en el documento, regenerable con los mismos parámetros — pero el histórico generado no se reescribe (un certificado emitido es un hecho).
3. **Plantillas gobernadas**: el diseño base es del producto, versionado; la personalización del tenant se limita a zonas declaradas — sin "editores libres" que conviertan cada tenant en un fork de diseño.
4. **Los reportes con valor formal se registran**: los marcados como formales (certificados, actas) quedan ligados a su entidad como adjunto permanente y entran a la cronología (doc 06).

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `reportes` (núcleo), `personalizacion_de_plantillas` (zonas del tenant) — separables.
- **Eventos**: "Reporte Generado" (v1; con marca de formal/informal).
- **Contratos**: generar reporte (definición + parámetros); consultar generaciones propias; declaración de definiciones por módulo; administración de zonas de plantilla.
- **Configuración**: zonas personalizadas del tenant (logo, pies legales), idioma/formato regional, retención por tipo de reporte.
- **KPIs**: generaciones por definición/tenant, tiempo de generación, tasa de fallo, reportes formales emitidos.
- **Permisos**: `REPORTES.GENERAR` + permiso de las consultas fuente (doble llave); `REPORTES.PLANTILLAS.ADMINISTRAR`.
- **Consumidores**: OT (orden imprimible), SST (informes de incidente), Compras (actas, órdenes de compra), Activos (fichas técnicas, certificados).

## Impacto sobre la implementación

DGP propio (motor de composición, plantillas versionadas, generación como trabajo); los módulos declaran definiciones apuntando a consultas existentes.

## Dependencias

Docs 04, 06 y 09; ESI-003/22; ESI-005/07 y /13; ETS-008/009.

## Riesgos

- La plantilla como campo de batalla de personalización por cliente; mitigación: zonas declaradas §2.3 — lo que no cabe en zonas es cambio de producto, no configuración (misma frontera que ESI-005/09 §2.3).

## Decisiones habilitadas

- Documentos formales uniformes con identidad del tenant, sin forks de diseño.
- Certificados y actas con valor probatorio trazable (corte + parámetros + adjunto permanente).

## Decisiones bloqueadas

- Prohibida la generación de documentos formales fuera del servicio.
- Prohibidos editores libres de plantillas por tenant.
- Prohibido regenerar-y-sustituir reportes formales emitidos.

## Reusable Pattern

Definición declarada → generación como trabajo → entrega por adjunto + registro de formales: la instancia documental del patrón del doc 09, con plantillas gobernadas como añadido propio.

## Anti-Patterns

- Reportes que recalculan KPIs por su cuenta (los toman del doc 16).
- HTML de pantalla "imprimido" como sustituto de documento formal.
- Lógica de dominio en plantillas (condicionales de negocio en el diseño).

## Knowledge Graph

- **ETS que consume**: ETS-008 (contratos), ETS-009 (retención), ETS-012 (documentos exigidos por la operación).
- **ESI que consume**: ESI-003/22; ESI-005/07 y /13; docs 04, 06, 09 de esta serie.
- **DGP que originará**: DGP-Reportes; catálogos de definiciones en cada DGP-módulo.
- **ADR relacionados**: ADR de zonas de personalización (§2.3); ADR de doble llave (doc 09).
- **Módulos que reutilizarán este patrón**: OT, SST, Compras y Activos en v1; todos a término.
