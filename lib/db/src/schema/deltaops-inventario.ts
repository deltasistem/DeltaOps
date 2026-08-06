/**
 * DGP-011.2 · Espejo Drizzle del Módulo Enterprise Inventory.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0014_inventario_module.sql
 *   - lib/db/migrations/deltaops/0015_inventario_cqrs.sql
 *   - lib/db/migrations/deltaops/0016_inventario_soporte.sql
 * Este espejo existe para tooling/typecheck (drizzle-kit push crea las tablas;
 * la RLS la aplican los .sql oficiales).
 */
import { boolean, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

const aggBase = {
  tenantId: text("tenant_id").notNull(),
  id: text("id").notNull(),
  datos: jsonb("datos").notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const readBase = {
  tenantId: text("tenant_id").notNull(),
  id: text("id").notNull(),
  datos: jsonb("datos").notNull().default({}),
  version: integer("version").notNull(),
  lastEventId: text("last_event_id").notNull(),
  actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
};

/* ------------------------------ Aggregates ------------------------------- */

export const invItemsTable = deltaops.table(
  "inv_items",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    sku: text("sku").notNull(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull(),
    tipoItem: text("tipo_item").notNull(),
    categoria: text("categoria"),
    modoTrazabilidad: text("modo_trazabilidad").notNull(),
    eliminado: boolean("eliminado").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_inv_items_estado_drizzle").on(t.tenantId, t.estado)],
);

export const invExistenciasTable = deltaops.table(
  "inv_existencias",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    itemId: text("item_id").notNull(),
    bodegaId: text("bodega_id").notNull(),
    ubicacionId: text("ubicacion_id").notNull(),
    loteCodigo: text("lote_codigo"),
    serieNumero: text("serie_numero"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_inv_existencias_item_drizzle").on(t.tenantId, t.itemId)],
);

export const invMovimientosTable = deltaops.table(
  "inv_movimientos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    inventarioId: text("inventario_id").notNull(),
    itemId: text("item_id"),
    tipo: text("tipo").notNull(),
    familia: text("familia"),
    datos: jsonb("datos").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_inv_movimientos_inv_drizzle").on(t.tenantId, t.inventarioId)],
);

export const invBodegasTable = deltaops.table("inv_bodegas", aggBase, (t) => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const invUbicacionesTable = deltaops.table(
  "inv_ubicaciones",
  { ...aggBase, bodegaId: text("bodega_id") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invLotesTable = deltaops.table(
  "inv_lotes",
  {
    tenantId: text("tenant_id").notNull(),
    itemId: text("item_id").notNull(),
    codigo: text("codigo").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.itemId, t.codigo] })],
);
export const invSeriesTable = deltaops.table(
  "inv_series",
  {
    tenantId: text("tenant_id").notNull(),
    itemId: text("item_id").notNull(),
    numero: text("numero").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.itemId, t.numero] })],
);
export const invReservasTable = deltaops.table("inv_reservas", aggBase, (t) => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const invTransferenciasTable = deltaops.table("inv_transferencias", aggBase, (t) => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const invAjustesTable = deltaops.table("inv_ajustes", aggBase, (t) => [primaryKey({ columns: [t.tenantId, t.id] })]);
export const invConteosTable = deltaops.table("inv_conteos", aggBase, (t) => [primaryKey({ columns: [t.tenantId, t.id] })]);

/* ------------------------- Sync receipts + event log --------------------- */

export const invSyncReceiptsTable = deltaops.table(
  "inv_sync_receipts",
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

export const invEventosTable = deltaops.table(
  "inv_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_inv_eventos_stream_drizzle").on(t.tenantId, t.occurredAt, t.eventId)],
);

/* ------------------------------ Read models ------------------------------ */

export const invItemsReadTable = deltaops.table(
  "inv_items_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    sku: text("sku").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    estado: text("estado").notNull(),
    tipoItem: text("tipo_item").notNull(),
    categoria: text("categoria"),
    modoTrazabilidad: text("modo_trazabilidad").notNull(),
    eliminado: boolean("eliminado").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull(),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_inv_items_read_estado_drizzle").on(t.tenantId, t.estado)],
);

export const invExistenciasReadTable = deltaops.table(
  "inv_existencias_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    itemId: text("item_id").notNull(),
    bodegaId: text("bodega_id").notNull(),
    ubicacionId: text("ubicacion_id").notNull(),
    loteCodigo: text("lote_codigo"),
    serieNumero: text("serie_numero"),
    disponible: numeric("disponible").notNull().default("0"),
    reservado: numeric("reservado").notNull().default("0"),
    comprometido: numeric("comprometido").notNull().default("0"),
    enTransito: numeric("en_transito").notNull().default("0"),
    enInspeccion: numeric("en_inspeccion").notNull().default("0"),
    bloqueado: numeric("bloqueado").notNull().default("0"),
    vencido: numeric("vencido").notNull().default("0"),
    total: numeric("total").notNull().default("0"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull(),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_inv_existencias_read_item_drizzle").on(t.tenantId, t.itemId)],
);

export const invMovimientosReadTable = deltaops.table(
  "inv_movimientos_read",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    inventarioId: text("inventario_id").notNull(),
    itemId: text("item_id"),
    tipo: text("tipo").notNull(),
    familia: text("familia"),
    datos: jsonb("datos").notNull().default({}),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_inv_movimientos_read_inv_drizzle").on(t.tenantId, t.inventarioId)],
);

export const invReservasReadTable = deltaops.table(
  "inv_reservas_read",
  { ...readBase, itemId: text("item_id"), estado: text("estado").notNull(), tipo: text("tipo"), demandaId: text("demanda_id") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invTransferenciasReadTable = deltaops.table(
  "inv_transferencias_read",
  { ...readBase, estado: text("estado").notNull() },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invConteosReadTable = deltaops.table(
  "inv_conteos_read",
  { ...readBase, estado: text("estado").notNull(), tipo: text("tipo") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invAjustesReadTable = deltaops.table(
  "inv_ajustes_read",
  { ...readBase, estado: text("estado").notNull(), tipo: text("tipo") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invLotesReadTable = deltaops.table(
  "inv_lotes_read",
  { ...readBase, itemId: text("item_id").notNull(), codigo: text("codigo").notNull(), vencimientoAt: timestamp("vencimiento_at", { withTimezone: true }) },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invSeriesReadTable = deltaops.table(
  "inv_series_read",
  { ...readBase, itemId: text("item_id").notNull(), numero: text("numero").notNull(), estado: text("estado") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invBodegasReadTable = deltaops.table(
  "inv_bodegas_read",
  { ...readBase, nombre: text("nombre"), tipo: text("tipo") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);
export const invUbicacionesReadTable = deltaops.table(
  "inv_ubicaciones_read",
  { ...readBase, bodegaId: text("bodega_id"), nivel: text("nivel") },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);

/* ------------------------------- Soporte --------------------------------- */

export const invRecibosTable = deltaops.table(
  "inv_recibos",
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

export const invSecuenciasTable = deltaops.table(
  "inv_secuencias",
  {
    tenantId: text("tenant_id").notNull(),
    serie: text("serie").notNull(),
    valor: integer("valor").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.serie] })],
);

export const invCatalogosTable = deltaops.table(
  "inv_catalogos",
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
  (t) => [primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] })],
);
