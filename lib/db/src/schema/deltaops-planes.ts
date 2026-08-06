/**
 * DGP-012.2 · Espejo Drizzle del Módulo Enterprise Maintenance Plans.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0018_planes_module.sql
 *   - lib/db/migrations/deltaops/0019_planes_cqrs.sql
 *   - lib/db/migrations/deltaops/0020_planes_soporte.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: los .sql se aplican con psql (fuente de verdad); la RLS la aplican los
 * .sql oficiales.
 */
import { bigint, boolean, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------------ Aggregates ------------------------------- */

export const plnPlanesTable = deltaops.table(
  "pln_planes",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull(),
    tipoPlan: text("tipo_plan").notNull(),
    estrategia: text("estrategia").notNull(),
    prioridad: text("prioridad").notNull(),
    versionActiva: integer("version_activa").notNull().default(0),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_pln_planes_estado_drizzle").on(t.tenantId, t.estado)],
);

export const plnCalendariosTable = deltaops.table(
  "pln_calendarios",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    tipo: text("tipo").notNull(),
    ambito: text("ambito").notNull(),
    nombre: text("nombre").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);

export const plnGeneracionesTable = deltaops.table(
  "pln_generaciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    planId: text("plan_id").notNull(),
    version: integer("version").notNull(),
    activoId: text("activo_id").notNull(),
    ocurrencia: text("ocurrencia").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    origen: text("origen").notNull(),
    fechaObjetivo: timestamp("fecha_objetivo", { withTimezone: true }).notNull(),
    ordenTrabajoId: text("orden_trabajo_id"),
    datos: jsonb("datos").notNull().default({}),
    generadaPor: text("generada_por").notNull(),
    generadaEn: timestamp("generada_en", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_pln_generaciones_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_pln_generaciones_plan_drizzle").on(t.tenantId, t.planId),
  ],
);

export const plnHistorialTable = deltaops.table(
  "pln_historial",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    planId: text("plan_id").notNull(),
    hito: text("hito").notNull(),
    version: integer("version").notNull(),
    detalle: jsonb("detalle").notNull().default({}),
    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_pln_historial_plan_drizzle").on(t.tenantId, t.planId)],
);

/* ---------------------------- Soporte / sync ----------------------------- */

export const plnSyncReceiptsTable = deltaops.table(
  "pln_sync_receipts",
  {
    tenantId: text("tenant_id").notNull(),
    opId: text("op_id").notNull(),
    clienteId: text("cliente_id"),
    comando: text("comando").notNull(),
    estado: text("estado").notNull().default("aplicada"),
    resultado: jsonb("resultado").notNull().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);

export const plnEventosTable = deltaops.table(
  "pln_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_pln_eventos_stream_drizzle").on(t.tenantId, t.occurredAt)],
);

export const plnRecibosTable = deltaops.table(
  "pln_recibos",
  {
    tenantId: text("tenant_id").notNull(),
    comando: text("comando").notNull(),
    opId: text("op_id").notNull(),
    resultado: jsonb("resultado").notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.comando, t.opId] })],
);

export const plnSecuenciasTable = deltaops.table(
  "pln_secuencias",
  {
    tenantId: text("tenant_id").notNull(),
    serie: text("serie").notNull(),
    valor: bigint("valor", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.serie] })],
);

export const plnCatalogosTable = deltaops.table(
  "pln_catalogos",
  {
    tenantId: text("tenant_id").notNull(),
    catalogo: text("catalogo").notNull(),
    clave: text("clave").notNull(),
    etiqueta: text("etiqueta").notNull(),
    posicion: integer("posicion"),
    padre: text("padre"),
    habilitado: boolean("habilitado").notNull().default(true),
    datos: jsonb("datos").notNull().default({}),
    createdBy: text("created_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] }), index("idx_pln_catalogos_lookup_drizzle").on(t.tenantId, t.catalogo, t.habilitado)],
);

/* ------------------------------ Read models ------------------------------ */

export const plnPlanesReadTable = deltaops.table(
  "pln_planes_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    estado: text("estado").notNull(),
    tipoPlan: text("tipo_plan").notNull(),
    estrategia: text("estrategia").notNull(),
    prioridad: text("prioridad").notNull(),
    versionActiva: integer("version_activa").notNull().default(0),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull(),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_pln_planes_read_estado_drizzle").on(t.tenantId, t.estado)],
);

export const plnCalendariosReadTable = deltaops.table(
  "pln_calendarios_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    tipo: text("tipo").notNull(),
    ambito: text("ambito").notNull(),
    nombre: text("nombre").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull(),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] })],
);

export const plnGeneracionesReadTable = deltaops.table(
  "pln_generaciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    planId: text("plan_id").notNull(),
    version: integer("version").notNull(),
    activoId: text("activo_id").notNull(),
    ocurrencia: text("ocurrencia").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    origen: text("origen").notNull(),
    ordenTrabajoId: text("orden_trabajo_id"),
    fechaObjetivo: timestamp("fecha_objetivo", { withTimezone: true }).notNull(),
    datos: jsonb("datos").notNull().default({}),
    lastEventId: text("last_event_id").notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_pln_generaciones_read_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_pln_generaciones_read_plan_drizzle").on(t.tenantId, t.planId),
  ],
);

export const plnHistorialReadTable = deltaops.table(
  "pln_historial_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    planId: text("plan_id").notNull(),
    hito: text("hito").notNull(),
    version: integer("version").notNull(),
    detalle: jsonb("detalle").notNull().default({}),
    actorId: text("actor_id").notNull(),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_pln_historial_read_plan_drizzle").on(t.tenantId, t.planId)],
);
