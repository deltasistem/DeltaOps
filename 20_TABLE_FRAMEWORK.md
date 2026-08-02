# 20 — Table Framework

> **DeltaOps — ESI-008 · v1.0** · El marco de tablas: la superficie de trabajo de las colecciones — columnas declaradas, filtros visibles, acciones gobernadas y rendimiento por contrato.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

La tabla es el corazón del layout L1 (doc 07). Su definición es **declarativa**: cada instancia declara columnas (con tipo, orden, visibilidad por defecto), filtros disponibles, acciones (por fila y masivas) y su consulta fuente — el marco aporta el comportamiento completo una sola vez.

## 2. Reglas

1. **Filtros visibles y honestos**: los filtros activos se muestran como chips removibles siempre (la causa nº1 de "no me aparece", doc 14 §2.4); el estado de filtros+orden viaja en la ruta (compartible, doc 03 §2.3) y se recuerda por pantalla y cuenta.
2. **El servidor manda**: orden, filtro y paginación son de la consulta declarada (proyecciones, ESI-005/12), jamás recortes en cliente sobre datos parciales — la tabla que ordena "lo que ve" miente. Los totales y agregados vienen de la consulta, con la misma regla anti-cálculo del doc 18 §2.1.
3. **Acciones por las verdades**: las acciones por fila y masivas declaran sus comandos (doc 05); la masiva enuncia su alcance real ("cancelar 12 OT — 3 no elegibles por estado, ver cuáles") y reporta resultado por elemento — el todo-o-nada silencioso y el éxito parcial mudo están ambos prohibidos.
4. **Columnas con tipo, celdas normadas**: cada tipo (estado con su token semántico, fecha, número con unidad, referencia con enlace profundo, persona) se presenta igual en todas las tablas del producto; la personalización de columnas del usuario es visibilidad/orden dentro de lo declarado.
5. **Densidad por postura** (doc 09): oficina densa con teclado; planta legible; en campo la tabla colapsa a tarjetas por la priorización declarada (esencial visible, doc 09 §2.3) — el mismo contrato, tres presentaciones heredadas.
6. **Exportar es del servicio**: el exporte de la tabla (con filtros aplicados) delega en ESI-006/09 con sus permisos y marcas de auditoría; la tabla no genera archivos por su cuenta. El exporte masivo de datos I/P sigue su clasificación (ESI-007/16).

## 3. Declaración (los ocho rubros)

- **Commands**: las acciones declaradas (fila/masivas) con sus permisos; ninguna acción implícita.
- **Queries**: la consulta fuente con filtros/orden soportados y frescura.
- **Capacidades**: la de la pantalla que la aloja.
- **Servicios**: exportes (ESI-006/09), búsqueda si la tabla la integra (doc 21).
- **Permisos**: lectura por la consulta; acción por comando; columnas restringidas declaradas (la columna de costos sin permiso no existe para ese usuario, no está "oculta").
- **Offline**: la tabla de campo opera sobre lo sincronizado con frescura visible (doc 11); acciones encolables marcadas.
- **KPIs**: uso de filtros/columnas (poda), latencia contra presupuesto (doc 12), acciones masivas con fallos parciales.
- **IA**: opcional en filtrado por lenguaje natural traducido a filtros visibles (doc 22) — la IA produce chips inspeccionables, no resultados opacos.

## Impacto sobre la implementación

El marco de tabla (comportamiento completo + tipos de celda + colapso por postura) es la pieza mayor del DGP de experiencia; cada tabla concreta es una declaración en su DGP de módulo.

## Dependencias

Docs 03, 05, 07, 09, 11-12, 14, 18, 21-22; ESI-005/12; ESI-006/09; ESI-007/16.

## Riesgos

- Tablas artesanales "porque esta es especial" fragmentando el comportamiento; mitigación: el marco cubre la variación por declaración; la tabla fuera del marco es hallazgo de bloqueo (doc 25).

## Decisiones habilitadas

- Toda colección del producto operable con los mismos gestos.
- Vistas filtradas compartibles como enlaces (colaboración real).

## Decisiones bloqueadas

- Prohibido ordenar/filtrar/agregar en cliente sobre datos parciales.
- Prohibidas acciones masivas sin reporte por elemento.
- Prohibidas tablas fuera del marco.

## Reusable Pattern

Tabla por declaración (columnas+filtros+acciones+consulta) sobre un marco único: la colección como contrato — mil tablas, un comportamiento.

## Anti-Patterns

- La tabla que carga diez mil filas "para que el filtro sea rápido".
- Iconos de acción sin nombre que cada tabla inventa.
- El exporte que ignora los filtros y sorprende con todo.

## Knowledge Graph

- **ETS que consume**: ETS-011 (trabajo real sobre colecciones).
- **ESI que consume**: ESI-005/12 (proyecciones); ESI-006/09; ESI-007/16.
- **DGP que originará**: el marco de tabla en el DGP de experiencia; declaraciones por DGP de módulo.
- **ADR relacionados**: ADR de servidor-manda; ADR de reporte por elemento en masivas.
- **Módulos que reutilizarán este patrón**: todos los L1; ninguna tabla artesanal.
