/**
 * Espejo Drizzle de las tablas del Módulo Activos Empresariales (DGP-008.1).
 * Migración oficial: lib/db/migrations/deltaops/0007_activos_module.sql
 * (fuente de verdad; incluye RLS, CHECK e índices funcionales).
 */
import { index, integer, jsonb, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

export const actActivosTable = deltaops.table(
  "act_activos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigoEmpresarial: text("codigo_empresarial").notNull(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull(),
    tipo: text("tipo").notNull(),
    criticidad: text("criticidad"),
    ubicacionId: text("ubicacion_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_act_activos_estado_drizzle").on(t.tenantId, t.estado, t.updatedAt),
  ],
);

export const actActivosReadTable = deltaops.table(
  "act_activos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigoEmpresarial: text("codigo_empresarial").notNull(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull(),
    tipo: text("tipo").notNull(),
    criticidad: text("criticidad"),
    ubicacionId: text("ubicacion_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull(),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_act_activos_read_estado_drizzle").on(t.tenantId, t.estado, t.actualizadoAt),
  ],
);

/** Recibos durables de sincronización offline (misma migración 0007). */
export const actSyncReceiptsTable = deltaops.table(
  "act_sync_receipts",
  {
    tenantId: text("tenant_id").notNull(),
    opId: text("op_id").notNull(),
    clienteId: text("cliente_id"),
    comando: text("comando").notNull(),
    estado: text("estado").notNull(),
    resultado: jsonb("resultado").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);
