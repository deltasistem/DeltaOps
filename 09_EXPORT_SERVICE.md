# 09 — Export Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de exportaciones: archivos descargables generados en segundo plano, con corte declarado y acceso gobernado.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

Materializa la regla de ESI-005/07 §2.5: los listados grandes no se paginan hasta el infinito, se exportan. El servicio convierte una **solicitud de exportación** (consulta declarada del módulo + filtros + formato) en un archivo descargable, generado como trabajo (ESI-003/22).

| Concepto | Definición |
|---|---|
| **Exportación declarada** | El módulo declara qué consultas suyas son exportables, con qué columnas y formatos (CSV, XLSX) |
| **Solicitud** | Instancia: quién, qué consulta, qué filtros, cuándo; con estados (solicitada → generando → lista → expirada / fallida) |
| **Entrega** | Archivo vía servicio de adjuntos (doc 04, categoría "exportación") con URL temporal y expiración |

## 2. Reglas

1. **Los datos los produce el módulo dueño**: el servicio orquesta (cola, estados, entrega); la extracción ejecuta la consulta declarada del módulo con los permisos y RLS **del solicitante** — el servicio no tiene acceso privilegiado a datos.
2. **Corte declarado**: el archivo indica su momento de corte y los filtros aplicados; una exportación es una fotografía honesta, no una vista viva.
3. **Presupuestos y límites**: tamaño máximo y concurrencia por tenant; exportaciones masivas van a ventanas de menor carga si el tenant lo configura.
4. **Trazabilidad completa**: quién exportó qué, cuándo y con qué filtros queda auditado (los exportes son el canal clásico de fuga de datos — doc 15 de ESI-005 los lista entre los cuatro canales).
5. **Expiración**: los archivos expiran por configuración; re-exportar es barato y honesto, atesorar archivos viejos no.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `exportaciones` (por tenant).
- **Eventos**: "Exportación Lista", "Exportación Fallida" (v1) — notificación al solicitante vía doc 03.
- **Contratos**: solicitar exportación (consulta declarada + filtros + formato); consultar estado propio (cursor); declaración de consultas exportables por módulo.
- **Configuración**: formatos habilitados, tamaño máximo, expiración, ventanas de generación, por tenant.
- **KPIs**: exportaciones por módulo/tenant, tiempo de generación, tasa de fallo, volumen descargado.
- **Permisos**: `EXPORTACIONES.SOLICITAR` + el permiso de la consulta subyacente (doble llave: sin acceso a la consulta no hay exporte).
- **Consumidores**: todos los módulos como declarantes; usuarios de análisis y administradores como solicitantes intensivos.

## Impacto sobre la implementación

DGP propio (orquestación, estados, entrega); los módulos declaran sus consultas exportables — reutilizando las consultas del plano de lectura, sin rutas nuevas.

## Dependencias

ESI-003/22; ESI-005/07 y /15; docs 03-04; ETS-008 (contratos de columnas), ETS-009.

## Riesgos

- El exporte como API de sincronización encubierta (sistemas externos descargando CSVs cada hora); mitigación: la telemetría de patrones §KPIs lo delata y la respuesta es una integración formal (doc 14), no bloquear al usuario.

## Decisiones habilitadas

- Listados con tope de página estricto en todo el producto (el exporte absorbe el caso masivo).
- Cumplimiento demostrable sobre extracción de datos (auditoría de exportes).

## Decisiones bloqueadas

- Prohibidas exportaciones fuera del servicio (endpoints ad-hoc que serializan miles de filas).
- Prohibido el acceso privilegiado del servicio a datos de módulos.
- Prohibidos exportes sin corte declarado ni auditoría.

## Reusable Pattern

Solicitud → trabajo → entrega por adjunto con doble llave de permisos: el patrón de todo material generado pesado (lo reutiliza el servicio de reportes, doc 11).

## Anti-Patterns

- "Exportar todo" sin filtros como default de producto.
- Generar en línea (request síncrono) archivos grandes.
- Archivos de exporte compartidos por enlaces eternos.

## Knowledge Graph

- **ETS que consume**: ETS-008 (contratos), ETS-009 (gobierno de datos).
- **ESI que consume**: ESI-003/22; ESI-005/07 y /15; docs 03-04 de esta serie.
- **DGP que originará**: DGP-Exportaciones; tablas de consultas exportables en cada DGP-módulo.
- **ADR relacionados**: ADR de doble llave (§3 permisos); ADR de generación como trabajo (ESI-003/22).
- **Módulos que reutilizarán este patrón**: todos; Inventario y Activos los más exportados; el patrón lo hereda Reportes (doc 11).
