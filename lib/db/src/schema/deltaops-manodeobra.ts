/**
 * DGP-020.3 · Espejo Drizzle de la Fundación de Mano de Obra.
 * Migración oficial (fuente de verdad; incluye RLS e índices):
 *   - lib/db/migrations/deltaops/0043_manodeobra_module.sql
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: el .sql se aplica con psql (fuente de verdad); la RLS la aplica el
 * .sql oficial. Las CATEGORÍAS viven en el Record Store (platform_records).
 */
import { bigint, boolean, index, jsonb, numeric, pgSchema, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ------------------------------- Recursos -------------------------------- */
export const mdoRecursosTable = deltaops.table(
  "mdo_recursos",
  {
    tenantId: text("tenant_id").notNull(),
    identityId: text("identity_id").notNull(),
    categoriaClave: text("categoria_clave").notNull(),
    estado: text("estado").notNull().default("ACTIVO"),
    creadoAt: timestamp("creado_at", { withTimezone: true }).notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
    creadoPor: text("creado_por").notNull(),
    actualizadoPor: text("actualizado_por").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.identityId] }),
    index("idx_mdo_recursos_categoria_drizzle").on(t.tenantId, t.categoriaClave),
  ],
);

/* -------------------------------- Tarifas -------------------------------- */
export const mdoTarifasTable = deltaops.table(
  "mdo_tarifas",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id").notNull(),
    sujetoTipo: text("sujeto_tipo").notNull(),
    sujetoId: text("sujeto_id").notNull(),
    valor: numeric("valor", { precision: 18, scale: 6 }).notNull(),
    moneda: text("moneda").notNull(),
    unidad: text("unidad").notNull().default("HORA"),
    vigenciaDesde: timestamp("vigencia_desde", { withTimezone: true }).notNull(),
    vigenciaHasta: timestamp("vigencia_hasta", { withTimezone: true }),
    estado: text("estado").notNull(),
    valorAnterior: numeric("valor_anterior", { precision: 18, scale: 6 }),
    motivo: text("motivo"),
    creadoAt: timestamp("creado_at", { withTimezone: true }).notNull(),
    creadoPor: text("creado_por").notNull(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull(),
    actualizadoPor: text("actualizado_por").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.id] }),
    index("idx_mdo_tarifas_sujeto_drizzle").on(t.tenantId, t.sujetoTipo, t.sujetoId, t.vigenciaDesde),
  ],
);

/* ------------------------------ Valoraciones ----------------------------- */
export const mdoValoracionesTable = deltaops.table(
  "mdo_valoraciones",
  {
    tenantId: text("tenant_id").notNull(),
    sesionId: text("sesion_id").notNull(),
    ordenId: text("orden_id").notNull(),
    activoId: text("activo_id"),
    identityId: text("identity_id").notNull(),
    categoriaClave: text("categoria_clave"),
    tarifaId: text("tarifa_id"),
    tarifaValor: numeric("tarifa_valor", { precision: 18, scale: 6 }),
    moneda: text("moneda"),
    unidad: text("unidad"),
    efectivoMs: bigint("efectivo_ms", { mode: "number" }).notNull(),
    costo: numeric("costo", { precision: 18, scale: 6 }),
    estado: text("estado").notNull(),
    vigenciaDesde: timestamp("vigencia_desde", { withTimezone: true }),
    vigenciaHasta: timestamp("vigencia_hasta", { withTimezone: true }),
    cruzaPeriodos: boolean("cruza_periodos").notNull().default(false),
    iniciadoAt: timestamp("iniciado_at", { withTimezone: true }).notNull(),
    cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
    valoradoAt: timestamp("valorado_at", { withTimezone: true }).notNull(),
    valoradoPor: text("valorado_por").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.sesionId] }),
    index("idx_mdo_valoraciones_orden_drizzle").on(t.tenantId, t.ordenId),
    index("idx_mdo_valoraciones_activo_drizzle").on(t.tenantId, t.activoId),
    index("idx_mdo_valoraciones_identity_drizzle").on(t.tenantId, t.identityId),
    index("idx_mdo_valoraciones_estado_drizzle").on(t.tenantId, t.estado),
  ],
);

/* -------------------------------- Recibos -------------------------------- */
export const mdoRecibosTable = deltaops.table(
  "mdo_recibos",
  {
    tenantId: text("tenant_id").notNull(),
    comando: text("comando").notNull(),
    opId: text("op_id").notNull(),
    resultado: jsonb("resultado").notNull().default({}),
    estado: text("estado").notNull().default("pendiente"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.comando, t.opId] })],
);

/* ------------------------------- Bitácora -------------------------------- */
export const mdoEventosTable = deltaops.table(
  "mdo_eventos",
  {
    eventId: text("event_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_mdo_eventos_tenant_drizzle").on(t.tenantId, t.occurredAt)],
);
