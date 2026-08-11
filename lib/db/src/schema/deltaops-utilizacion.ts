/**
 * DGP-019.1 · Espejo Drizzle del Módulo de Utilización, Medidores y Combustible.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0035_utilizacion_module.sql
 *   - lib/db/migrations/deltaops/0036_utilizacion_cqrs.sql
 *   - lib/db/migrations/deltaops/0037_utilizacion_soporte.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: los .sql se aplican con psql (fuente de verdad); la RLS la aplican los
 * .sql oficiales.
 */
import { boolean, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------- Hechos append-only ---------------------------- */

export const utlLecturasTable = deltaops.table(
  "utl_lecturas",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    activoId: text("activo_id").notNull(),
    tipoMedidor: text("tipo_medidor").notNull(),
    valor: numeric("valor").notNull(),
    unidad: text("unidad").notNull(),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    identityId: text("identity_id").notNull(),
    origen: text("origen").notNull(),
    estado: text("estado").notNull().default("vigente"),
    inconsistente: boolean("inconsistente").notNull().default(false),
    sincronizacionActivo: text("sincronizacion_activo").notNull().default("pendiente"),
    opId: text("op_id"),
    datos: jsonb("datos").notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_utl_lecturas_medidor_drizzle").on(t.tenantId, t.activoId, t.tipoMedidor),
  ],
);

export const utlTanqueosTable = deltaops.table(
  "utl_tanqueos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    activoId: text("activo_id").notNull(),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    litros: numeric("litros").notNull(),
    tipoCombustible: text("tipo_combustible").notNull(),
    precioUnitario: numeric("precio_unitario"),
    costoTotal: numeric("costo_total"),
    moneda: text("moneda"),
    lecturaMedidorRef: text("lectura_medidor_ref"),
    identityId: text("identity_id").notNull(),
    proveedorId: text("proveedor_id"),
    estado: text("estado").notNull().default("vigente"),
    opId: text("op_id"),
    datos: jsonb("datos").notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_utl_tanqueos_activo_drizzle").on(t.tenantId, t.activoId),
  ],
);

/* -------------------- Recibos / eventos durables ------------------------- */

export const utlSyncReceiptsTable = deltaops.table(
  "utl_sync_receipts",
  {
    tenantId: text("tenant_id").notNull(),
    opId: text("op_id").notNull(),
    clienteId: text("cliente_id"),
    comando: text("comando").notNull(),
    estado: text("estado").notNull().default("pendiente"),
    resultado: jsonb("resultado").notNull().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);

export const utlEventosTable = deltaops.table(
  "utl_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_utl_eventos_stream_drizzle").on(t.tenantId, t.occurredAt)],
);

/* --------------------------- Read models (CQRS) -------------------------- */

export const utlLecturasReadTable = deltaops.table(
  "utl_lecturas_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    activoId: text("activo_id").notNull(),
    tipoMedidor: text("tipo_medidor").notNull(),
    valor: numeric("valor").notNull(),
    unidad: text("unidad").notNull(),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    identityId: text("identity_id").notNull(),
    origen: text("origen").notNull(),
    estado: text("estado").notNull().default("vigente"),
    inconsistente: boolean("inconsistente").notNull().default(false),
    sincronizacionActivo: text("sincronizacion_activo").notNull().default("pendiente"),
    datos: jsonb("datos").notNull().default({}),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_utl_lecturas_read_list_drizzle").on(t.tenantId, t.activoId, t.tipoMedidor),
  ],
);

export const utlTanqueosReadTable = deltaops.table(
  "utl_tanqueos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    activoId: text("activo_id").notNull(),
    fechaHora: timestamp("fecha_hora", { withTimezone: true }).notNull(),
    litros: numeric("litros").notNull(),
    tipoCombustible: text("tipo_combustible").notNull(),
    costoTotal: numeric("costo_total"),
    moneda: text("moneda"),
    estado: text("estado").notNull().default("vigente"),
    datos: jsonb("datos").notNull().default({}),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_utl_tanqueos_read_list_drizzle").on(t.tenantId, t.activoId),
  ],
);

/* ------------------------------- Soporte --------------------------------- */

export const utlRecibosTable = deltaops.table(
  "utl_recibos",
  {
    tenantId: text("tenant_id").notNull(),
    comando: text("comando").notNull(),
    opId: text("op_id").notNull(),
    resultado: jsonb("resultado").notNull().default({}),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.comando, t.opId] })],
);

export const utlCatalogosTable = deltaops.table(
  "utl_catalogos",
  {
    tenantId: text("tenant_id").notNull(),
    catalogo: text("catalogo").notNull(),
    clave: text("clave").notNull(),
    etiqueta: text("etiqueta").notNull(),
    posicion: integer("posicion").notNull().default(0),
    padre: text("padre"),
    estado: text("estado").notNull().default("habilitado"),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] }),
    index("idx_utl_catalogos_lookup_drizzle").on(t.tenantId, t.catalogo, t.estado),
  ],
);
