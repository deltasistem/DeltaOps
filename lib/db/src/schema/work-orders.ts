import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  timestamp,
} from "drizzle-orm/pg-core";

export const workOrdersTable = pgTable("work_orders", {
  id: serial("id").primaryKey(),
  numero: text("numero").notNull().unique(),
  equipoId: integer("equipo_id").notNull(),
  tipo: text("tipo").notNull(),
  prioridad: text("prioridad").notNull().default("media"),
  estado: text("estado").notNull().default("pendiente"),
  tecnicoId: integer("tecnico_id"),
  centroTrabajoId: integer("centro_trabajo_id"),
  descripcion: text("descripcion"),
  reporteFalla: text("reporte_falla"),
  diagnostico: text("diagnostico"),
  causaRaiz: text("causa_raiz"),
  solucion: text("solucion"),
  horasEstimadas: doublePrecision("horas_estimadas"),
  horasReales: doublePrecision("horas_reales"),
  costoManoObra: doublePrecision("costo_mano_obra"),
  costoRepuestos: doublePrecision("costo_repuestos"),
  fechaCreacion: timestamp("fecha_creacion", { withTimezone: true })
    .notNull()
    .defaultNow(),
  fechaProgramada: timestamp("fecha_programada", { withTimezone: true }),
  fechaCierre: timestamp("fecha_cierre", { withTimezone: true }),
});

export type WorkOrder = typeof workOrdersTable.$inferSelect;
export type InsertWorkOrder = typeof workOrdersTable.$inferInsert;
