import {
  pgTable,
  serial,
  text,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  contacto: text("contacto"),
  telefono: text("telefono"),
  email: text("email"),
  calificacion: doublePrecision("calificacion"),
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type InsertSupplier = typeof suppliersTable.$inferInsert;
