/**
 * DGP-014 · Espejo Drizzle del Módulo Enterprise Preventive Maintenance.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0024_preventivo_module.sql
 *   - lib/db/migrations/deltaops/0025_preventivo_cqrs.sql
 *   - lib/db/migrations/deltaops/0026_preventivo_soporte.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: los .sql se aplican con psql (fuente de verdad); la RLS la aplican los
 * .sql oficiales.
 */
import { bigint, boolean, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------------ Aggregates ------------------------------- */

export const prvProgramasTable = deltaops.table(
  "prv_programas",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(),
    clasificacion: text("clasificacion"),
    padreId: text("padre_id"),
    estado: text("estado").notNull(),
    versionPrograma: integer("version_programa").notNull().default(1),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_prv_programas_codigo_drizzle").on(t.tenantId, t.codigo),
    index("idx_prv_programas_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

export const prvProgramaVersionesTable = deltaops.table(
  "prv_programa_versiones",
  {
    tenantId: text("tenant_id").notNull(),
    programaId: text("programa_id").notNull(),
    versionPrograma: integer("version_programa").notNull(),
    datos: jsonb("datos").notNull().default({}),
    guardadoEn: timestamp("guardado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.programaId, t.versionPrograma] })],
);

export const prvActividadesTable = deltaops.table(
  "prv_actividades",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    programaId: text("programa_id").notNull(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull().default(0),
    moneda: text("moneda").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_prv_actividades_programa_drizzle").on(t.tenantId, t.programaId)],
);

export const prvGeneracionesTable = deltaops.table(
  "prv_generaciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    programaId: text("programa_id").notNull(),
    actividadId: text("actividad_id").notNull(),
    activoId: text("activo_id").notNull(),
    ventana: text("ventana").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    origen: text("origen").notNull(),
    fechaObjetivo: timestamp("fecha_objetivo", { withTimezone: true }).notNull(),
    ordenTrabajoId: text("orden_trabajo_id"),
    estado: text("estado").notNull().default("pendiente"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    generadaPor: text("generada_por").notNull(),
    generadaEn: timestamp("generada_en", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_prv_generaciones_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_prv_generaciones_programa_drizzle").on(t.tenantId, t.programaId),
  ],
);

export const prvGeneracionMaterializacionesTable = deltaops.table(
  "prv_generacion_materializaciones",
  {
    tenantId: text("tenant_id").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    generacionId: text("generacion_id").notNull(),
    ordenTrabajoId: text("orden_trabajo_id"),
    estado: text("estado").notNull().default("pendiente"),
    datos: jsonb("datos").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.claveDedup] }), index("idx_prv_gen_mat_generacion_drizzle").on(t.tenantId, t.generacionId)],
);

export const prvHistorialTable = deltaops.table(
  "prv_historial",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    entityRef: text("entity_ref").notNull(),
    hito: text("hito").notNull(),
    version: integer("version").notNull(),
    detalle: jsonb("detalle").notNull().default({}),
    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true }).notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_prv_historial_ref_drizzle").on(t.tenantId, t.entityRef)],
);

/* ------------------- Recibos durables de sincronización ------------------ */

export const prvSyncReceiptsTable = deltaops.table(
  "prv_sync_receipts",
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

/* ---------------------------- Bitácora de eventos ------------------------ */

export const prvEventosTable = deltaops.table(
  "prv_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_prv_eventos_stream_drizzle").on(t.tenantId, t.occurredAt)],
);

/* ------------------------------- Read models ----------------------------- */

export const prvProgramasReadTable = deltaops.table(
  "prv_programas_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(),
    clasificacion: text("clasificacion"),
    padreId: text("padre_id"),
    estado: text("estado").notNull(),
    versionPrograma: integer("version_programa").notNull().default(1),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_prv_programas_read_list_drizzle").on(t.tenantId, t.estado)],
);

export const prvProgramaVersionesReadTable = deltaops.table(
  "prv_programa_versiones_read",
  {
    tenantId: text("tenant_id").notNull(),
    programaId: text("programa_id").notNull(),
    versionPrograma: integer("version_programa").notNull(),
    datos: jsonb("datos").notNull().default({}),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.programaId, t.versionPrograma] })],
);

export const prvActividadesReadTable = deltaops.table(
  "prv_actividades_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    programaId: text("programa_id").notNull(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull().default(0),
    moneda: text("moneda").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_prv_actividades_read_programa_drizzle").on(t.tenantId, t.programaId)],
);

export const prvGeneracionesReadTable = deltaops.table(
  "prv_generaciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    programaId: text("programa_id").notNull(),
    actividadId: text("actividad_id").notNull(),
    activoId: text("activo_id").notNull(),
    ventana: text("ventana").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    origen: text("origen").notNull(),
    fechaObjetivo: timestamp("fecha_objetivo", { withTimezone: true }).notNull(),
    ordenTrabajoId: text("orden_trabajo_id"),
    estado: text("estado").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_prv_generaciones_read_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_prv_generaciones_read_prog_drizzle").on(t.tenantId, t.programaId),
  ],
);

export const prvProgramacionesReadTable = deltaops.table(
  "prv_programaciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    tipo: text("tipo").notNull(),
    programaId: text("programa_id"),
    actividadId: text("actividad_id"),
    activoId: text("activo_id"),
    ventana: text("ventana"),
    motivo: text("motivo"),
    desde: timestamp("desde", { withTimezone: true }),
    hasta: timestamp("hasta", { withTimezone: true }),
    datos: jsonb("datos").notNull().default({}),
    lastEventId: text("last_event_id").notNull(),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_prv_programaciones_read_prog_drizzle").on(t.tenantId, t.programaId)],
);

export const prvHistorialReadTable = deltaops.table(
  "prv_historial_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    entityRef: text("entity_ref").notNull(),
    hito: text("hito").notNull(),
    version: integer("version").notNull(),
    detalle: jsonb("detalle").notNull().default({}),
    actorId: text("actor_id").notNull(),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_prv_historial_read_ref_drizzle").on(t.tenantId, t.entityRef)],
);

/* ------------------------------- Soporte --------------------------------- */

export const prvRecibosTable = deltaops.table(
  "prv_recibos",
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

export const prvSecuenciasTable = deltaops.table(
  "prv_secuencias",
  {
    tenantId: text("tenant_id").notNull(),
    serie: text("serie").notNull(),
    valor: bigint("valor", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.serie] })],
);

export const prvCatalogosTable = deltaops.table(
  "prv_catalogos",
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
  (t) => [primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] }), index("idx_prv_catalogos_lookup_drizzle").on(t.tenantId, t.catalogo, t.habilitado)],
);
