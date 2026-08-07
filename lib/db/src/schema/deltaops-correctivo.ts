/**
 * DGP-015 · Espejo Drizzle del Módulo Enterprise Corrective Maintenance.
 * Migraciones oficiales (fuente de verdad; incluyen RLS e índices):
 *   - lib/db/migrations/deltaops/0027_correctivo_module.sql
 *   - lib/db/migrations/deltaops/0028_correctivo_cqrs.sql
 *   - lib/db/migrations/deltaops/0029_correctivo_soporte.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: los .sql se aplican con psql (fuente de verdad); la RLS la aplican los
 * .sql oficiales.
 */
import { bigint, boolean, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------------ Aggregates ------------------------------- */

export const corSolicitudesTable = deltaops.table(
  "cor_solicitudes",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    titulo: text("titulo").notNull(),
    origen: text("origen").notNull(),
    activoId: text("activo_id"),
    prioridad: text("prioridad").notNull(),
    criticidad: text("criticidad"),
    estado: text("estado").notNull(),
    diagnosticoId: text("diagnostico_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_cor_solicitudes_codigo_drizzle").on(t.tenantId, t.codigo),
    index("idx_cor_solicitudes_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

export const corDiagnosticosTable = deltaops.table(
  "cor_diagnosticos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    plantillaId: text("plantilla_id").notNull(),
    plantillaVersion: integer("plantilla_version").notNull(),
    causaRaiz: text("causa_raiz"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    registradoPor: text("registrado_por").notNull(),
    registradoEn: timestamp("registrado_en", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_diagnosticos_solicitud_drizzle").on(t.tenantId, t.solicitudId)],
);

export const corIntervencionesTable = deltaops.table(
  "cor_intervenciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    ordenTrabajoId: text("orden_trabajo_id").notNull(),
    activoId: text("activo_id").notNull(),
    mayor: boolean("mayor").notNull().default(false),
    estado: text("estado").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_cor_intervenciones_solicitud_drizzle").on(t.tenantId, t.solicitudId),
    index("idx_cor_intervenciones_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

export const corGeneracionesTable = deltaops.table(
  "cor_generaciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    activoId: text("activo_id").notNull(),
    claveDedup: text("clave_dedup").notNull(),
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
    uniqueIndex("uq_cor_generaciones_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_cor_generaciones_solicitud_drizzle").on(t.tenantId, t.solicitudId),
  ],
);

export const corGeneracionMaterializacionesTable = deltaops.table(
  "cor_generacion_materializaciones",
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
  (t) => [primaryKey({ columns: [t.tenantId, t.claveDedup] }), index("idx_cor_gen_mat_generacion_drizzle").on(t.tenantId, t.generacionId)],
);

export const corEventosActivoTable = deltaops.table(
  "cor_eventos_activo",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    activoId: text("activo_id").notNull(),
    solicitudId: text("solicitud_id"),
    ordenTrabajoId: text("orden_trabajo_id"),
    tipo: text("tipo").notNull(),
    modoFalla: text("modo_falla"),
    ocurridoEn: timestamp("ocurrido_en", { withTimezone: true }).notNull(),
    datos: jsonb("datos").notNull().default({}),
    registradoPor: text("registrado_por").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_eventos_activo_ref_drizzle").on(t.tenantId, t.activoId)],
);

export const corHistorialTable = deltaops.table(
  "cor_historial",
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
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_historial_ref_drizzle").on(t.tenantId, t.entityRef)],
);

/* ------------------- Recibos durables de sincronización ------------------ */

export const corSyncReceiptsTable = deltaops.table(
  "cor_sync_receipts",
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

export const corEventosTable = deltaops.table(
  "cor_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.eventId] }), index("idx_cor_eventos_stream_drizzle").on(t.tenantId, t.occurredAt)],
);

/* ------------------------------- Read models ----------------------------- */

export const corSolicitudesReadTable = deltaops.table(
  "cor_solicitudes_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigo: text("codigo").notNull(),
    titulo: text("titulo").notNull(),
    origen: text("origen").notNull(),
    activoId: text("activo_id"),
    prioridad: text("prioridad").notNull(),
    criticidad: text("criticidad"),
    estado: text("estado").notNull(),
    diagnosticoId: text("diagnostico_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_solicitudes_read_list_drizzle").on(t.tenantId, t.estado)],
);

export const corDiagnosticosReadTable = deltaops.table(
  "cor_diagnosticos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    plantillaId: text("plantilla_id").notNull(),
    plantillaVersion: integer("plantilla_version").notNull(),
    causaRaiz: text("causa_raiz"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_diagnosticos_read_solicitud_drizzle").on(t.tenantId, t.solicitudId)],
);

export const corIntervencionesReadTable = deltaops.table(
  "cor_intervenciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    ordenTrabajoId: text("orden_trabajo_id").notNull(),
    activoId: text("activo_id").notNull(),
    mayor: boolean("mayor").notNull().default(false),
    estado: text("estado").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_cor_intervenciones_read_solicitud_drizzle").on(t.tenantId, t.solicitudId),
    index("idx_cor_intervenciones_read_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

export const corGeneracionesReadTable = deltaops.table(
  "cor_generaciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    solicitudId: text("solicitud_id").notNull(),
    activoId: text("activo_id").notNull(),
    claveDedup: text("clave_dedup").notNull(),
    ordenTrabajoId: text("orden_trabajo_id"),
    estado: text("estado").notNull(),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    uniqueIndex("uq_cor_generaciones_read_dedup_drizzle").on(t.tenantId, t.claveDedup),
    index("idx_cor_generaciones_read_solicitud_drizzle").on(t.tenantId, t.solicitudId),
  ],
);

export const corEventosActivoReadTable = deltaops.table(
  "cor_eventos_activo_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    activoId: text("activo_id").notNull(),
    solicitudId: text("solicitud_id"),
    ordenTrabajoId: text("orden_trabajo_id"),
    tipo: text("tipo").notNull(),
    modoFalla: text("modo_falla"),
    reincidente: boolean("reincidente").notNull().default(false),
    datos: jsonb("datos").notNull().default({}),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_eventos_activo_read_ref_drizzle").on(t.tenantId, t.activoId)],
);

export const corConsumosReadTable = deltaops.table(
  "cor_consumos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    intervencionId: text("intervencion_id"),
    ordenTrabajoId: text("orden_trabajo_id"),
    tipo: text("tipo").notNull(),
    inventarioId: text("inventario_id"),
    articuloId: text("articulo_id"),
    cantidad: numeric("cantidad"),
    unidad: text("unidad"),
    datos: jsonb("datos").notNull().default({}),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    lastEventId: text("last_event_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_consumos_read_int_drizzle").on(t.tenantId, t.intervencionId)],
);

export const corHistorialReadTable = deltaops.table(
  "cor_historial_read",
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
  (t) => [primaryKey({ columns: [t.tenantId, t.id] }), index("idx_cor_historial_read_ref_drizzle").on(t.tenantId, t.entityRef)],
);

/* ------------------------------- Soporte --------------------------------- */

export const corRecibosTable = deltaops.table(
  "cor_recibos",
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

export const corSecuenciasTable = deltaops.table(
  "cor_secuencias",
  {
    tenantId: text("tenant_id").notNull(),
    serie: text("serie").notNull(),
    valor: bigint("valor", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.serie] })],
);

export const corCatalogosTable = deltaops.table(
  "cor_catalogos",
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
  (t) => [primaryKey({ columns: [t.tenantId, t.catalogo, t.clave] }), index("idx_cor_catalogos_lookup_drizzle").on(t.tenantId, t.catalogo, t.habilitado)],
);
