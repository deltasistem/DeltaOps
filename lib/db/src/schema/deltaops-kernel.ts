import {
  integer,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { deltaopsSchema } from "./deltaops";

/**
 * DeltaOps · DGP-002 — Espejo Drizzle de la infraestructura del Kernel.
 * Migración oficial: lib/db/migrations/deltaops/0002_kernel_outbox.sql.
 * El Kernel accede a estas tablas vía sus adaptadores PostgreSQL propios
 * (lib/kernel/src/adapters/pg.ts); este espejo existe para tooling/typecheck.
 */
export const kernelOutboxTable = deltaopsSchema.table("kernel_outbox", {
  id: uuid("id").primaryKey(),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull(),
  correlationId: varchar("correlation_id", { length: 255 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  claimedUntil: timestamp("claimed_until", { withTimezone: true }),
});

export const kernelDeadLetterTable = deltaopsSchema.table("kernel_dead_letter", {
  id: uuid("id").primaryKey(),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  payload: jsonb("payload").notNull(),
  correlationId: varchar("correlation_id", { length: 255 }).notNull(),
  failureReason: text("failure_reason").notNull(),
  attempts: integer("attempts").notNull(),
  deadAt: timestamp("dead_at", { withTimezone: true }).notNull().defaultNow(),
});
