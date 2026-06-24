import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const sparePartsTable = pgTable("spare_parts", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull(),
  descripcion: text("descripcion").notNull(),
  categoria: text("categoria"),
  stock: integer("stock").notNull().default(0),
  stockMinimo: integer("stock_minimo").notNull().default(0),
  stockMaximo: integer("stock_maximo"),
  costoUnitario: doublePrecision("costo_unitario"),
  ubicacionId: integer("ubicacion_id"),
});

export type SparePart = typeof sparePartsTable.$inferSelect;
export type InsertSparePart = typeof sparePartsTable.$inferInsert;
