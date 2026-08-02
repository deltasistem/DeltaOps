# 06 — Timeline Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de cronología: la historia visible de cada entidad, compuesta desde eventos, sin escribir nada dos veces.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

La cronología responde "¿qué ha pasado con esta OT?" en una vista única: transiciones de estado, adjuntos, comentarios, avisos relevantes — ordenados en el tiempo, con autor. Es una **proyección de solo lectura** (ESI-004/15) alimentada por eventos publicados; nadie "escribe en la cronología".

| Concepto | Definición |
|---|---|
| **Entrada de cronología** | Derivada de un evento: tipo, fecha (fechaNegocio cuando exista), actor, resumen legible desde plantilla declarada, referencia al origen |
| **Suscripción de cronología** | El módulo declara qué eventos suyos son "cronologizables" para qué tipo de entidad, con su plantilla de resumen |
| **Vista** | Consulta paginada por referencia de entidad, filtrable por familia (estados, archivos, conversación) |

## 2. Reglas

1. **Solo eventos publicados** la alimentan — de módulos y de otros servicios compartidos ("Adjunto Registrado", "Comentario Publicado"): la cronología demuestra la composición del estrato consigo mismo.
2. **No es la auditoría**: la auditoría (ESI-004/17) es el registro transaccional con garantías para auditores; la cronología es la vista humana, reconstruible y sin valor probatorio. Comparten origen (los hechos), no propósito ni garantías.
3. **Reconstruible por diseño** con verificación de divergencia (ESI-004/15); su pérdida no pierde información (los eventos y la auditoría permanecen).
4. **Acceso derivado de la entidad** (patrón doc 04); las entradas derivadas de datos clasificados heredan su refuerzo (doc 04 §1, ESI-005/15).

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `cronologia` (única; por tenant).
- **Eventos**: ninguno propio en v1 — la cronología consume, no produce hechos de negocio; su declaración lo hace explícito.
- **Contratos**: consulta por referencia de entidad (cursor, filtros por familia); declaración de suscripciones cronologizables.
- **Configuración**: horizonte de la vista por tenant (ETS-009), familias visibles por defecto.
- **KPIs**: cobertura (entidades con cronología activa), retraso de proyección (edad de bandeja), consultas por módulo.
- **Permisos**: lectura derivada de la entidad; `CRONOLOGIA.SUSCRIPCIONES.ADMINISTRAR` para el alta declarativa.
- **Consumidores**: todos los módulos como declarantes; el cliente como lector; adjuntos y comentarios como alimentadores.

## Impacto sobre la implementación

DGP propio centrado en el consumidor proyector y las plantillas de resumen; los módulos solo marcan eventos como cronologizables en sus declaraciones.

## Dependencias

ESI-004/15 y /17; ESI-005/08 y /12; docs 03-05; ETS-006 (fechas), ETS-009 (horizonte).

## Riesgos

- Tratar la cronología como fuente probatoria en disputas; mitigación: la regla §2.2 es visible en producto (la vista de auditoría formal existe aparte, con su permiso).

## Decisiones habilitadas

- Historia visible uniforme de toda entidad sin trabajo por módulo (más allá de declarar).
- Composición demostrada de servicios compartidos entre sí vía eventos.

## Decisiones bloqueadas

- Prohibido escribir entradas de cronología directamente.
- Prohibido usar la cronología como auditoría o para decisiones de negocio.
- Prohibidas cronologías propias por módulo.

## Reusable Pattern

Proyección compuesta multi-origen sobre eventos publicados + plantillas declaradas por el emisor: el patrón para toda vista agregadora transversal futura.

## Anti-Patterns

- Enriquecer entradas consultando estado actual (la cronología narra el pasado con los datos del momento del evento).
- Duplicar la cronología en tablas de los módulos "para tenerla cerca".
- Entradas técnicas (reintentos, sincronizaciones) contaminando la vista de negocio.

## Knowledge Graph

- **ETS que consume**: ETS-006 (fechas), ETS-009 (horizonte/retención).
- **ESI que consume**: ESI-004/15 y /17; ESI-005/08 y /12.
- **DGP que originará**: DGP-Cronología; el marcado "cronologizable" en las declaraciones de cada DGP-módulo.
- **ADR relacionados**: ADR cronología≠auditoría (§2.2).
- **Módulos que reutilizarán este patrón**: todos; OT y Activos son las cronologías más consultadas previstas.
