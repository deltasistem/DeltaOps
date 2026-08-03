/**
 * Espejo Drizzle de las tablas del Reference Module (DGP-004).
 * Migración oficial: lib/db/migrations/deltaops/0005_reference_module.sql
 * (fuente de verdad; incluye RLS, CHECK e índices funcionales).
 */
import { index, integer, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

export const refElementosTable = deltaops.table(
  "ref_elementos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    estado: text("estado").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_ref_elementos_estado_drizzle").on(t.tenantId, t.estado, t.updatedAt),
  ],
);

export const refElementosReadTable = deltaops.table(
  "ref_elementos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    estado: text("estado").notNull(),
    version: integer("version").notNull(),
    createdBy: text("created_by").notNull().default(""),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_ref_elementos_read_estado_drizzle").on(t.tenantId, t.estado, t.actualizadoAt),
  ],
);

/** Recibos durables de sincronización offline (migración 0006). */
export const refSyncReceiptsTable = deltaops.table(
  "ref_sync_receipts",
  {
    tenantId: text("tenant_id").notNull(),
    opId: text("op_id").notNull(),
    comando: text("comando").notNull(),
    resultado: text("resultado").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);
