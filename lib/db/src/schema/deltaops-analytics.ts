/**
 * DGP-016 · Espejo Drizzle del Módulo Enterprise Analytics & KPI Platform.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0030_analytics_module.sql
 *   - lib/db/migrations/deltaops/0031_analytics_cqrs.sql
 *   - lib/db/migrations/deltaops/0032_analytics_soporte.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: los .sql se aplican con psql (fuente de verdad); la RLS la aplican los
 * .sql oficiales.
 */
import { boolean, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------------ Aggregates ------------------------------- */

export const anDefinicionesTable = deltaops.table(
  "an_definiciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    categoria: text("categoria").notNull(),
    fuenteModulo: text("fuente_modulo").notNull(),
    fuenteDataset: text("fuente_dataset").notNull(),
    unidad: text("unidad").notNull(),
    formato: text("formato").notNull(),
    habilitado: boolean("habilitado").notNull().default(true),
    delSistema: boolean("del_sistema").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_an_definiciones_clave_drizzle").on(t.tenantId, t.clave),
    index("idx_an_definiciones_categoria_drizzle").on(t.tenantId, t.categoria),
    index("idx_an_definiciones_sistema_drizzle").on(t.tenantId, t.delSistema, t.habilitado),
  ],
);

export const anDashboardsTable = deltaops.table(
  "an_dashboards",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    delSistema: boolean("del_sistema").notNull().default(false),
    propietarioId: text("propietario_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_an_dashboards_clave_drizzle").on(t.tenantId, t.clave),
    index("idx_an_dashboards_sistema_drizzle").on(t.tenantId, t.delSistema),
    index("idx_an_dashboards_propietario_drizzle").on(t.tenantId, t.propietarioId),
  ],
);

export const anSnapshotsTable = deltaops.table(
  "an_snapshots",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    claveSnapshot: text("clave_snapshot").notNull(),
    target: text("target").notNull(),
    targetClave: text("target_clave").notNull(),
    valor: numeric("valor"),
    muestras: integer("muestras"),
    datos: jsonb("datos").notNull().default({}),
    evaluadoEn: timestamp("evaluado_en", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_an_snapshots_clave_drizzle").on(t.tenantId, t.claveSnapshot),
    index("idx_an_snapshots_target_drizzle").on(t.tenantId, t.target, t.targetClave, t.evaluadoEn),
  ],
);

/* -------------------------- Sync receipts (offline) ---------------------- */

export const anSyncReceiptsTable = deltaops.table(
  "an_sync_receipts",
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

/* ---------------------------- Event log durable -------------------------- */

export const anEventosTable = deltaops.table(
  "an_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventId] }),
    index("idx_an_eventos_stream_drizzle").on(t.tenantId, t.occurredAt, t.eventId),
  ],
);

/* ------------------------------ Read models ------------------------------ */

export const anDefinicionesReadTable = deltaops.table(
  "an_definiciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    categoria: text("categoria").notNull(),
    fuenteModulo: text("fuente_modulo").notNull(),
    fuenteDataset: text("fuente_dataset").notNull(),
    habilitado: boolean("habilitado").notNull().default(true),
    delSistema: boolean("del_sistema").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(0),
    lastEventId: text("last_event_id").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_an_definiciones_read_clave_drizzle").on(t.tenantId, t.clave),
    index("idx_an_definiciones_read_categoria_drizzle").on(t.tenantId, t.categoria),
    index("idx_an_definiciones_read_sistema_drizzle").on(t.tenantId, t.delSistema, t.habilitado),
  ],
);

export const anDashboardsReadTable = deltaops.table(
  "an_dashboards_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    clave: text("clave").notNull(),
    nombre: text("nombre").notNull(),
    delSistema: boolean("del_sistema").notNull().default(false),
    propietarioId: text("propietario_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(0),
    lastEventId: text("last_event_id").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_an_dashboards_read_clave_drizzle").on(t.tenantId, t.clave),
    index("idx_an_dashboards_read_sistema_drizzle").on(t.tenantId, t.delSistema),
    index("idx_an_dashboards_read_propietario_drizzle").on(t.tenantId, t.propietarioId),
  ],
);

export const anSnapshotsReadTable = deltaops.table(
  "an_snapshots_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    claveSnapshot: text("clave_snapshot").notNull(),
    target: text("target").notNull(),
    targetClave: text("target_clave").notNull(),
    valor: numeric("valor"),
    muestras: integer("muestras"),
    datos: jsonb("datos").notNull().default({}),
    evaluadoEn: timestamp("evaluado_en", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_an_snapshots_read_clave_drizzle").on(t.tenantId, t.claveSnapshot),
    index("idx_an_snapshots_read_target_drizzle").on(t.tenantId, t.target, t.targetClave, t.evaluadoEn),
  ],
);

/* ------------------------------- Soporte --------------------------------- */

export const anCatalogosTable = deltaops.table(
  "an_catalogos",
  {
    tenantId: text("tenant_id").notNull(),
    catalogo: text("catalogo").notNull(),
    clave: text("clave").notNull(),
    etiqueta: text("etiqueta").notNull(),
    posicion: integer("posicion").notNull().default(0),
    padre: text("padre"),
    habilitado: boolean("habilitado").notNull().default(true),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] }),
    index("idx_an_catalogos_lista_drizzle").on(t.tenantId, t.catalogo, t.habilitado, t.posicion),
  ],
);

export const anRecibosTable = deltaops.table(
  "an_recibos",
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
