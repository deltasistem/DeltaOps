import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";

export const techniciansTable = pgTable("technicians", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  rol: text("rol").notNull(),
  especialidad: text("especialidad"),
  certificaciones: text("certificaciones"),
  telefono: text("telefono"),
  email: text("email"),
  centroTrabajoId: integer("centro_trabajo_id"),
});

export type Technician = typeof techniciansTable.$inferSelect;
export type InsertTechnician = typeof techniciansTable.$inferInsert;
