/**
 * DeltaOps · Espejo Drizzle de las tablas de la Plataforma (DGP-003).
 * Fuente de verdad: lib/db/migrations/deltaops/0004_platform_services.sql
 */
import {
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

export const platformRecordsTable = deltaops.table(
  "platform_records",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    service: text("service").notNull(),
    recordType: text("record_type").notNull(),
    status: text("status").notNull(),
    data: jsonb("data").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_platform_records_lookup_drizzle").on(t.tenantId, t.service, t.recordType, t.status),
  ],
);

export const platformAuditTable = deltaops.table(
  "platform_audit",
  {
    id: uuid("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    service: text("service").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id").notNull(),
    subjectId: text("subject_id"),
    detail: jsonb("detail").notNull().default({}),
    correlationId: text("correlation_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_platform_audit_lookup_drizzle").on(t.tenantId, t.service, t.occurredAt)],
);
