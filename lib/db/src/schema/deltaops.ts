import {
  integer,
  pgSchema,
  text,
  timestamp,
  varchar,
  json,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * DeltaOps — DGP-001 (Engineering Factory).
 * Todas las tablas de plataforma DeltaOps viven en el esquema PostgreSQL
 * `deltaops`, aisladas del esquema `public` (SGMA).
 * Sin tablas de negocio: solo autenticación base y sesiones.
 */
export const deltaopsSchema = pgSchema("deltaops");

export const deltaopsUsersTable = deltaopsSchema.table("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  rol: varchar("rol", { length: 64 }).notNull().default("admin"),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Tabla de sesiones para connect-pg-simple (gestión de sesiones oficial). */
export const deltaopsSessionsTable = deltaopsSchema.table("sessions", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire", { withTimezone: false, precision: 6 }).notNull(),
});

export const insertDeltaopsUserSchema = createInsertSchema(
  deltaopsUsersTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertDeltaopsUser = z.infer<typeof insertDeltaopsUserSchema>;
export type DeltaopsUser = typeof deltaopsUsersTable.$inferSelect;
