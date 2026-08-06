/**
 * DGP-013.2 · Espejo Drizzle del Módulo Enterprise Procurement & Supply Chain.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0021_abastecimiento_module.sql
 *   - lib/db/migrations/deltaops/0022_abastecimiento_cqrs.sql
 *   - lib/db/migrations/deltaops/0023_abastecimiento_soporte.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: los .sql se aplican con psql (fuente de verdad); la RLS la aplican los
 * .sql oficiales.
 */
import { bigint, boolean, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------------ Aggregates ------------------------------- */

export const absArticulosTable = deltaops.table(
  "abs_articulos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(),
    unidad: text("unidad").notNull(),
    familia: text("familia"),
    metodoValoracion: text("metodo_valoracion").notNull(),
    moneda: text("moneda").notNull(),
    activo: boolean("activo").notNull().default(true),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_abs_articulos_codigo_drizzle").on(t.tenantId, t.codigo),
    index("idx_abs_articulos_tipo_drizzle").on(t.tenantId, t.tipo),
  ],
);

export const absProveedoresTable = deltaops.table(
  "abs_proveedores",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    razonSocial: text("razon_social").notNull(),
    tipo: text("tipo").notNull(),
    calificacionPromedio: numeric("calificacion_promedio", { precision: 6, scale: 3 }).notNull().default("0"),
    activo: boolean("activo").notNull().default(true),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), uniqueIndex("uq_abs_proveedores_codigo_drizzle").on(t.tenantId, t.codigo)],
);

export const absSolicitudesTable = deltaops.table(
  "abs_solicitudes",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    titulo: text("titulo").notNull(),
    estado: text("estado").notNull(),
    prioridad: text("prioridad").notNull(),
    origenTipo: text("origen_tipo").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_abs_solicitudes_codigo_drizzle").on(t.tenantId, t.codigo),
    index("idx_abs_solicitudes_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

export const absCotizacionesTable = deltaops.table(
  "abs_cotizaciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    proveedorId: text("proveedor_id").notNull(),
    moneda: text("moneda").notNull(),
    total: numeric("total", { precision: 18, scale: 4 }).notNull().default("0"),
    plazoEntregaDias: integer("plazo_entrega_dias").notNull().default(0),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_cotizaciones_solicitud_drizzle").on(t.tenantId, t.solicitudId)],
);

export const absOrdenesCompraTable = deltaops.table(
  "abs_ordenes_compra",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    proveedorId: text("proveedor_id").notNull(),
    solicitudId: text("solicitud_id"),
    cotizacionId: text("cotizacion_id"),
    moneda: text("moneda").notNull(),
    estado: text("estado").notNull(),
    total: numeric("total", { precision: 18, scale: 4 }).notNull().default("0"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_abs_ordenes_compra_codigo_drizzle").on(t.tenantId, t.codigo),
    index("idx_abs_ordenes_compra_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

export const absRecepcionesTable = deltaops.table(
  "abs_recepciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    ordenCompraId: text("orden_compra_id").notNull(),
    consecutivo: integer("consecutivo").notNull(),
    completaOrden: boolean("completa_orden").notNull().default(false),
    conNovedades: boolean("con_novedades").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    recibidoPor: text("recibido_por").notNull(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_abs_recepciones_consecutivo_drizzle").on(t.tenantId, t.ordenCompraId, t.consecutivo),
    index("idx_abs_recepciones_orden_drizzle").on(t.tenantId, t.ordenCompraId),
  ],
);

export const absRecepcionMaterializacionesTable = deltaops.table(
  "abs_recepcion_materializaciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    recepcionId: text("recepcion_id").notNull(),
    ordenCompraId: text("orden_compra_id").notNull(),
    numeroLineaOc: integer("numero_linea_oc").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    articuloId: text("articulo_id"),
    inventarioItemId: text("inventario_item_id"),
    cantidad: numeric("cantidad", { precision: 18, scale: 6 }).notNull().default("0"),
    movimientoId: text("movimiento_id"),
    estado: text("estado").notNull().default("pendiente"),
    datos: jsonb("datos").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_abs_recepcion_mat_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_abs_recepcion_mat_recepcion_drizzle").on(t.tenantId, t.recepcionId),
  ],
);

export const absHistorialTable = deltaops.table(
  "abs_historial",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    entityRef: text("entity_ref").notNull(),
    hito: text("hito").notNull(),
    version: integer("version").notNull(),
    detalle: jsonb("detalle").notNull().default({}),
    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_historial_ref_drizzle").on(t.tenantId, t.entityRef)],
);

/* ---------------------------- Soporte / sync ----------------------------- */

export const absSyncReceiptsTable = deltaops.table(
  "abs_sync_receipts",
  {
    tenantId: text("tenant_id").notNull(),
    opId: text("op_id").notNull(),
    clienteId: text("cliente_id"),
    comando: text("comando").notNull(),
    estado: text("estado").notNull().default("aplicada"),
    resultado: jsonb("resultado").notNull().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);

export const absEventosTable = deltaops.table(
  "abs_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_abs_eventos_stream_drizzle").on(t.tenantId, t.occurredAt)],
);

export const absRecibosTable = deltaops.table(
  "abs_recibos",
  {
    tenantId: text("tenant_id").notNull(),
    comando: text("comando").notNull(),
    opId: text("op_id").notNull(),
    resultado: jsonb("resultado").notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.comando, t.opId] })],
);

export const absSecuenciasTable = deltaops.table(
  "abs_secuencias",
  {
    tenantId: text("tenant_id").notNull(),
    serie: text("serie").notNull(),
    valor: bigint("valor", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.serie] })],
);

export const absCatalogosTable = deltaops.table(
  "abs_catalogos",
  {
    tenantId: text("tenant_id").notNull(),
    catalogo: text("catalogo").notNull(),
    clave: text("clave").notNull(),
    etiqueta: text("etiqueta").notNull(),
    posicion: integer("posicion"),
    padre: text("padre"),
    habilitado: boolean("habilitado").notNull().default(true),
    datos: jsonb("datos").notNull().default({}),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] }), index("idx_abs_catalogos_lookup_drizzle").on(t.tenantId, t.catalogo, t.habilitado)],
);

/* ------------------------------ Read models ------------------------------ */

export const absArticulosReadTable = deltaops.table(
  "abs_articulos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(),
    unidad: text("unidad").notNull(),
    familia: text("familia"),
    metodoValoracion: text("metodo_valoracion").notNull(),
    moneda: text("moneda").notNull(),
    activo: boolean("activo").notNull().default(true),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_articulos_read_list_drizzle").on(t.tenantId, t.tipo)],
);

export const absProveedoresReadTable = deltaops.table(
  "abs_proveedores_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    razonSocial: text("razon_social").notNull(),
    tipo: text("tipo").notNull(),
    calificacionPromedio: numeric("calificacion_promedio", { precision: 6, scale: 3 }).notNull().default("0"),
    activo: boolean("activo").notNull().default(true),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_proveedores_read_list_drizzle").on(t.tenantId, t.tipo)],
);

export const absSolicitudesReadTable = deltaops.table(
  "abs_solicitudes_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    titulo: text("titulo").notNull(),
    estado: text("estado").notNull(),
    prioridad: text("prioridad").notNull(),
    origenTipo: text("origen_tipo").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_solicitudes_read_list_drizzle").on(t.tenantId, t.estado)],
);

export const absCotizacionesReadTable = deltaops.table(
  "abs_cotizaciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    proveedorId: text("proveedor_id").notNull(),
    moneda: text("moneda").notNull(),
    total: numeric("total", { precision: 18, scale: 4 }).notNull().default("0"),
    plazoEntregaDias: integer("plazo_entrega_dias").notNull().default(0),
    seleccionada: boolean("seleccionada").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_cotizaciones_read_solicitud_drizzle").on(t.tenantId, t.solicitudId)],
);

export const absOrdenesCompraReadTable = deltaops.table(
  "abs_ordenes_compra_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    proveedorId: text("proveedor_id").notNull(),
    solicitudId: text("solicitud_id"),
    cotizacionId: text("cotizacion_id"),
    moneda: text("moneda").notNull(),
    estado: text("estado").notNull(),
    total: numeric("total", { precision: 18, scale: 4 }).notNull().default("0"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_ordenes_compra_read_list_drizzle").on(t.tenantId, t.estado)],
);

export const absRecepcionesReadTable = deltaops.table(
  "abs_recepciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    ordenCompraId: text("orden_compra_id").notNull(),
    consecutivo: integer("consecutivo").notNull(),
    completaOrden: boolean("completa_orden").notNull().default(false),
    conNovedades: boolean("con_novedades").notNull().default(false),
    estadoOrden: text("estado_orden"),
    datos: jsonb("datos").notNull().default({}),
    recibidoPor: text("recibido_por").notNull(),
    recibidoEn: timestamp("recibido_en", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_recepciones_read_orden_drizzle").on(t.tenantId, t.ordenCompraId)],
);

export const absHistorialReadTable = deltaops.table(
  "abs_historial_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    entityRef: text("entity_ref").notNull(),
    hito: text("hito").notNull(),
    version: integer("version").notNull(),
    detalle: jsonb("detalle").notNull().default({}),
    actorId: text("actor_id").notNull(),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_abs_historial_read_ref_drizzle").on(t.tenantId, t.entityRef)],
);

export const absCostosReadTable = deltaops.table(
  "abs_costos_read",
  {
    tenantId: text("tenant_id").notNull(),
    articuloId: text("articulo_id").notNull(),
    moneda: text("moneda").notNull(),
    metodoValoracion: text("metodo_valoracion").notNull(),
    costoUnitario: numeric("costo_unitario", { precision: 18, scale: 6 }).notNull().default("0"),
    cantidadAcumulada: numeric("cantidad_acumulada", { precision: 18, scale: 6 }).notNull().default("0"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.articuloId, t.moneda] }), index("idx_abs_costos_read_articulo_drizzle").on(t.tenantId, t.articuloId)],
);
