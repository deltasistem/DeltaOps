/**
 * DGP-021.1 / DGP-021.2 · Espejo Drizzle de la Fundación del Módulo de Costos.
 * Migraciones oficiales (fuente de verdad; incluyen RLS, checks e índices):
 *   - lib/db/migrations/deltaops/0044_costos_module.sql       (fundación)
 *   - lib/db/migrations/deltaops/0045_costos_inventario.sql   (integración inventario)
 *   - lib/db/migrations/deltaops/0046_costos_naturaleza.sql   (naturaleza CARGO/ABONO, R1)
 * Este espejo existe para tooling/typecheck. drizzle-kit push NO detecta tablas
 * nuevas: el .sql se aplica con psql (fuente de verdad); la RLS la aplica el
 * .sql oficial.
 */
import { index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const deltaops = pgSchema("deltaops");

/* ---------------------------- Hechos económicos -------------------------- */
export const cosHechosTable = deltaops.table(
  "cos_hechos",
  {
    tenantId: text("tenant_id").notNull(),
    costoId: text("costo_id").notNull(),
    tipo: text("tipo").notNull(),
    originType: text("origin_type").notNull(),
    originId: text("origin_id").notNull(),
    otId: text("ot_id").notNull(),
    activoId: text("activo_id"),
    identityId: text("identity_id"),
    // DGP-021.2 · trazabilidad de origen físico (read models por movimiento/artículo).
    movimientoId: text("movimiento_id"),
    articuloId: text("articulo_id"),
    // DGP-021.2 (R1, 0046) · NATURALEZA económica del ledger inmutable: CARGO
    // (costo, consumo/salida) | ABONO (crédito compensatorio, devolución). El signo
    // es semántico; los importes siguen siendo NO negativos.
    naturaleza: text("naturaleza").notNull().default("CARGO"),
    opId: text("op_id").notNull(),
    estado: text("estado").notNull().default("ACTIVO"),
    cantidad: numeric("cantidad", { precision: 18, scale: 6 }).notNull(),
    unidad: text("unidad").notNull(),
    costoUnitario: numeric("costo_unitario", { precision: 18, scale: 6 }).notNull(),
    costoTotal: numeric("costo_total", { precision: 18, scale: 6 }).notNull(),
    moneda: text("moneda").notNull(),
    fuente: jsonb("fuente").notNull().default({}),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull(),
    registradoPor: text("registrado_por").notNull(),
    anuladoAt: timestamp("anulado_at", { withTimezone: true }),
    anuladoPor: text("anulado_por"),
    motivoAnulacion: text("motivo_anulacion"),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.costoId] }),
    uniqueIndex("uq_cos_hechos_opid_drizzle").on(t.tenantId, t.opId),
    index("idx_cos_hechos_ot_drizzle").on(t.tenantId, t.otId),
    index("idx_cos_hechos_activo_drizzle").on(t.tenantId, t.activoId),
    index("idx_cos_hechos_tipo_drizzle").on(t.tenantId, t.tipo),
    index("idx_cos_hechos_moneda_drizzle").on(t.tenantId, t.moneda),
    index("idx_cos_hechos_periodo_drizzle").on(t.tenantId, t.ocurridoAt),
    index("idx_cos_hechos_estado_drizzle").on(t.tenantId, t.estado),
    index("idx_cos_hechos_movimiento_drizzle").on(t.tenantId, t.movimientoId),
    index("idx_cos_hechos_articulo_drizzle").on(t.tenantId, t.articuloId),
    index("idx_cos_hechos_naturaleza_drizzle").on(t.tenantId, t.naturaleza),
  ],
);

/* ------------------ Pendientes de materialización (DGP-021.2) ------------ */
// Registro DURABLE de recuperación de la ORQUESTACIÓN inventario→costos del
// api-server (fail-safe/recuperable). Separado de cos_recibos (idempotencia).
export const cosPendientesMaterialTable = deltaops.table(
  "cos_pendientes_material",
  {
    tenantId: text("tenant_id").notNull(),
    movimientoId: text("movimiento_id").notNull(),
    opId: text("op_id").notNull(),
    estado: text("estado").notNull().default("PENDIENTE"),
    otId: text("ot_id").notNull(),
    articuloId: text("articulo_id").notNull(),
    cantidad: numeric("cantidad", { precision: 18, scale: 6 }).notNull(),
    unidad: text("unidad").notNull(),
    moneda: text("moneda"),
    refTipo: text("ref_tipo"),
    ocurridoAt: timestamp("ocurrido_at", { withTimezone: true }).notNull(),
    familia: text("familia").notNull(),
    costoId: text("costo_id"),
    motivo: text("motivo"),
    intentos: integer("intentos").notNull().default(0),
    actorId: text("actor_id").notNull(),
    creadoAt: timestamp("creado_at", { withTimezone: true }).notNull().defaultNow(),
    actualizadoAt: timestamp("actualizado_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.movimientoId] }),
    uniqueIndex("uq_cos_pend_opid_drizzle").on(t.tenantId, t.opId),
    index("idx_cos_pend_estado_drizzle").on(t.tenantId, t.estado, t.creadoAt),
    index("idx_cos_pend_ot_drizzle").on(t.tenantId, t.otId),
    index("idx_cos_pend_articulo_drizzle").on(t.tenantId, t.articuloId),
  ],
);

/* -------------------------------- Recibos -------------------------------- */
export const cosRecibosTable = deltaops.table(
  "cos_recibos",
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
export const cosEventosTable = deltaops.table(
  "cos_eventos",
  {
    eventId: text("event_id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    tipo: text("tipo").notNull(),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    registradoAt: timestamp("registrado_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_cos_eventos_tenant_drizzle").on(t.tenantId, t.occurredAt)],
);
