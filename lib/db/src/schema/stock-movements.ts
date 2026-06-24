import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const stockMovementsTable = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  repuestoId: integer("repuesto_id").notNull(),
  tipo: text("tipo").notNull(),
  cantidad: integer("cantidad").notNull(),
  motivo: text("motivo"),
  fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
});

export type StockMovement = typeof stockMovementsTable.$inferSelect;
export type InsertStockMovement = typeof stockMovementsTable.$inferInsert;
