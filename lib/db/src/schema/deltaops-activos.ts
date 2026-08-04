/**
 * Espejo Drizzle de las tablas del Módulo Activos Empresariales.
 * Migraciones oficiales (fuente de verdad; incluyen RLS, CHECK e índices):
 *   - lib/db/migrations/deltaops/0007_activos_module.sql (DGP-008.1)
 *   - lib/db/migrations/deltaops/0008_activos_operacional.sql (DGP-008.2)
 *   - lib/db/migrations/deltaops/0009_activos_event_log.sql (DGP-008.2 fix)
 */
import { index, integer, jsonb, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

export const actActivosTable = deltaops.table(
  "act_activos",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigoEmpresarial: text("codigo_empresarial").notNull(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull(),
    tipo: text("tipo").notNull(),
    criticidad: text("criticidad"),
    ubicacionId: text("ubicacion_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_act_activos_estado_drizzle").on(t.tenantId, t.estado, t.updatedAt),
  ],
);

export const actActivosReadTable = deltaops.table(
  "act_activos_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    codigoEmpresarial: text("codigo_empresarial").notNull(),
    nombre: text("nombre").notNull(),
    estado: text("estado").notNull(),
    tipo: text("tipo").notNull(),
    criticidad: text("criticidad"),
    ubicacionId: text("ubicacion_id"),
    datos: jsonb("datos").notNull().default({}),
    version: integer("version").notNull(),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_act_activos_read_estado_drizzle").on(t.tenantId, t.estado, t.actualizadoAt),
  ],
);

/** Recibos durables de sincronización offline (misma migración 0007). */
export const actSyncReceiptsTable = deltaops.table(
  "act_sync_receipts",
  {
    tenantId: text("tenant_id").notNull(),
    opId: text("op_id").notNull(),
    clienteId: text("cliente_id"),
    comando: text("comando").notNull(),
    estado: text("estado").notNull(),
    resultado: jsonb("resultado").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.opId] })],
);

/* ----------------------------- DGP-008.2 --------------------------------- */

/** Relaciones entre activos (grafo dirigido tipado). Fuente de verdad. */
export const actRelacionesTable = deltaops.table(
  "act_relaciones",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    tipo: text("tipo").notNull(),
    origenId: text("origen_id").notNull(),
    destinoId: text("destino_id").notNull(),
    datos: jsonb("datos").notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_act_relaciones_origen_drizzle").on(t.tenantId, t.origenId, t.tipo),
  ],
);

/** Read model de árbol/relacionados/componentes (proyección payload-only). */
export const actRelacionesReadTable = deltaops.table(
  "act_relaciones_read",
  {
    tenantId: text("tenant_id").notNull(),
    id: text("id").notNull(),
    tipo: text("tipo").notNull(),
    categoria: text("categoria").notNull(),
    origenId: text("origen_id").notNull(),
    origenCodigo: text("origen_codigo"),
    origenNombre: text("origen_nombre"),
    destinoId: text("destino_id").notNull(),
    destinoCodigo: text("destino_codigo"),
    destinoNombre: text("destino_nombre"),
    lastEventId: text("last_event_id").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_act_relaciones_read_origen_drizzle").on(t.tenantId, t.origenId, t.categoria),
  ],
);

/** Historial de ubicaciones (append-only). */
export const actUbicacionesHistTable = deltaops.table(
  "act_ubicaciones_hist",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    activoId: text("activo_id").notNull(),
    ubicacionId: text("ubicacion_id"),
    etiqueta: text("etiqueta"),
    detalle: text("detalle"),
    coordenadas: jsonb("coordenadas"),
    version: integer("version").notNull(),
    actorId: text("actor_id").notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventId] }),
    index("idx_act_ubic_hist_activo_drizzle").on(t.tenantId, t.activoId, t.registradoAt),
  ],
);

/** Historial de responsables (append-only). */
export const actResponsablesHistTable = deltaops.table(
  "act_responsables_hist",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    activoId: text("activo_id").notNull(),
    responsable: text("responsable"),
    supervisor: text("supervisor"),
    version: integer("version").notNull(),
    actorId: text("actor_id").notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventId] }),
    index("idx_act_resp_hist_activo_drizzle").on(t.tenantId, t.activoId, t.registradoAt),
  ],
);

/** Línea de tiempo del módulo (Shared Timeline propio, append-only). */
export const actHistorialTable = deltaops.table(
  "act_historial",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    activoId: text("activo_id").notNull(),
    entityRef: text("entity_ref").notNull(),
    tipoEvento: text("tipo_evento").notNull(),
    estado: text("estado"),
    version: integer("version").notNull(),
    actorId: text("actor_id").notNull(),
    resumen: text("resumen").notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventId] }),
    index("idx_act_historial_activo_drizzle").on(t.tenantId, t.activoId, t.registradoAt),
  ],
);

/**
 * Bitácora de eventos durable del módulo (event log canónico). Fuente de verdad
 * del replay de reproyección, independiente del outbox y de su retención. Se
 * escribe en la misma UoW que emite cada evento del módulo.
 */
export const actEventosTable = deltaops.table(
  "act_eventos",
  {
    tenantId: text("tenant_id").notNull(),
    eventId: text("event_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventId] }),
    index("idx_act_eventos_stream_drizzle").on(t.tenantId, t.occurredAt, t.eventId),
  ],
);
