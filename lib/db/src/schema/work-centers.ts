import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const workCentersTable = pgTable("work_centers", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  descripcion: text("descripcion"),
  responsable: text("responsable"),
});

export type WorkCenter = typeof workCentersTable.$inferSelect;
export type InsertWorkCenter = typeof workCentersTable.$inferInsert;
