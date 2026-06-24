import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";

export const assetsTable = pgTable("assets", {
  id: serial("id").primaryKey(),
  codigo: text("codigo").notNull(),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  marca: text("marca"),
  modelo: text("modelo"),
  serie: text("serie"),
  anio: integer("anio"),
  ubicacionId: integer("ubicacion_id"),
  centroTrabajoId: integer("centro_trabajo_id"),
  estado: text("estado").notNull().default("operativo"),
  responsable: text("responsable"),
  horometro: doublePrecision("horometro"),
  kilometraje: doublePrecision("kilometraje"),
  horasAcumuladas: doublePrecision("horas_acumuladas"),
  vidaUtil: integer("vida_util"),
  imageUrl: text("image_url"),
  notas: text("notas"),
});

export type Asset = typeof assetsTable.$inferSelect;
export type InsertAsset = typeof assetsTable.$inferInsert;
