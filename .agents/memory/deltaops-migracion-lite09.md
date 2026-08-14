---
name: Migración histórica LITE-09
description: Lecciones de importar Excel reales (Forms) a DeltaOps Lite por composición pura
---

- **Queries sobre record store con filtro en memoria son una bomba de volumen**: `store.list({limit:N})` + `.filter()` devuelve las primeras N filas del tenant por created_at; con datos históricos masivos el objetivo cae fuera de la ventana y el resultado es vacío "aleatorio". Todo filtro de alta cardinalidad (entityRef, activoId) debe empujarse al almacén (`RecordFilter.dataEquals`, JSONB parametrizado). **Cómo aplicar:** ante una lista vacía inexplicable con datos confirmados en SQL, buscar list+filter en memoria.
- **Cronologías por entidad necesitan paginación estable, no topes silenciosos**: cursor determinista (occurredAt+id DESC) expuesto aditivamente hasta la UI ("Cargar más"). Un tope fijo oculta precisamente los registros más antiguos (los históricos).
- **Proyecciones a timeline deben preferir la fecha operacional del hecho** (fechaHora del snapshot), no actualizadoAt — si no, todo lo importado "ocurre" el día de la importación.
- **Unidades: convertir al canónico del contrato en la frontera** (galones→litros ×3.785411784) y conservar cantidad+unidad originales en la procedencia; corregir datos ya escritos vía anulación + re-registro con nueva clave determinista versionada (tanqueo-v2), jamás UPDATE directo.
- **Encabezados de Excel reales traen NBSP/Unicode**: normalizar NFKC + colapso de espacios antes de mapear columnas; dos archivos "iguales" difieren en singular/plural de columnas.
- **Subidas grandes**: no reenviar base64 por express.json (límite 100KB); persistir server-side y referenciar por uploadId.
- **E2E de conteos con paginación produce falsos negativos**: el tester DOM cuenta li no-dato y no pagina; reconciliar siempre contra SQL + sweep curl con dedup por id antes de "corregir".
- **Identidad de flota**: alias tipo "C11 SIGAR" se resuelven como UN activo (alias en atributos, título compuesto); unificaciones y exclusiones (terceros) son decisiones de Dirección data-driven, nunca `if codigo==...`.
- **Plantillas Dynamic Forms para históricos**: el guard de vocabulario neutro obliga a neutralizar etiquetas; el texto verbatim del Excel se conserva como dato en el contexto sellado (fidelidad sin violar DGP-007).
