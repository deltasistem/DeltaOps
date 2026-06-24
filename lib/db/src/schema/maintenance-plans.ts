import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const maintenancePlansTable = pgTable("maintenance_plans", {
  id: serial("id").primaryKey(),
  nombre: text("nombre").notNull(),
  equipoId: integer("equipo_id").notNull(),
  tipoFrecuencia: text("tipo_frecuencia").notNull(),
  intervalo: integer("intervalo").notNull(),
  unidad: text("unidad"),
  descripcion: text("descripcion"),
  proximaFecha: timestamp("proxima_fecha", { withTimezone: true }),
  proximoHorometro: doublePrecision("proximo_horometro"),
  activo: boolean("activo").notNull().default(true),
});

export type MaintenancePlan = typeof maintenancePlansTable.$inferSelect;
export type InsertMaintenancePlan = typeof maintenancePlansTable.$inferInsert;
