-- ===========================================================================
-- DGP-021.2 · Integración Inventario → Costos de Mantenimiento.
--
-- Conecta el MOVIMIENTO físico de inventario (consumo/salida atribuido a una OT)
-- con el HECHO ECONÓMICO exacto de `modulo.costos`. La orquestación vive en el
-- api-server (patrón DGP-020.3): NO handlers suscritos a eventos ajenos, NO SQL
-- contra tablas internas de inventario. Esta migración añade:
--
--   1) Trazabilidad de ORIGEN FÍSICO en cos_hechos: columnas movimiento_id y
--      articulo_id (read models §22: «por movimiento» / «por artículo»). Ambas
--      NULLABLE (los hechos OTROS manuales no provienen de un movimiento).
--   2) cos_pendientes_material: REGISTRO DURABLE de recuperación (fail-safe). Si
--      el costo exacto falla / no existe / es multimoneda, el movimiento físico
--      NO se rompe: queda un pendiente VISIBLE y RECUPERABLE vía reproceso
--      idempotente (opId determinista `inv:<movimientoId>` ⇒ 1 solo hecho). Es
--      la tabla PROPIA de la orquestación del api-server (no de otro módulo);
--      cos_recibos es idempotencia de comando, NO registro de recuperación:
--      responsabilidades separadas.
--
-- ADITIVA, idempotente y NO destructiva. RLS por tenant (app.tenant_id). Se
-- aplica con psql (drizzle push no ve estas tablas/columnas nuevas).
--
-- IDENTIDAD DETERMINISTA (§15): un mismo movimiento (aunque el `mover` use otro
-- opId de entrada) produce SIEMPRE el mismo `op_id = 'inv:' || movimiento_id` en
-- cos_hechos ⇒ una sola fila por movimiento gracias a uq_cos_hechos_opid (0044).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Trazabilidad de origen físico en el HECHO económico.
-- ---------------------------------------------------------------------------
ALTER TABLE deltaops.cos_hechos
  ADD COLUMN IF NOT EXISTS movimiento_id text,
  ADD COLUMN IF NOT EXISTS articulo_id text;

CREATE INDEX IF NOT EXISTS idx_cos_hechos_movimiento
  ON deltaops.cos_hechos (tenant_id, movimiento_id);
CREATE INDEX IF NOT EXISTS idx_cos_hechos_articulo
  ON deltaops.cos_hechos (tenant_id, articulo_id);

-- ---------------------------------------------------------------------------
-- 2) REGISTRO DURABLE de pendientes de materialización (fail-safe/recuperable).
--    Cada intento de materializar MATERIAL desde un movimiento queda registrado
--    con su estado; el reproceso idempotente reintenta los no resueltos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deltaops.cos_pendientes_material (
  tenant_id text NOT NULL,
  movimiento_id text NOT NULL,            -- identidad del origen físico
  op_id text NOT NULL,                    -- opId determinista 'inv:<movimiento_id>'
  estado text NOT NULL DEFAULT 'PENDIENTE', -- 'PENDIENTE'|'MATERIALIZADO'|'SIN_COSTO'|'MULTIMONEDA'|'ERROR'|'DESCARTADO'
  -- ---- snapshot MÍNIMO del movimiento (para reproceso sin releer inventario) ----
  ot_id text NOT NULL,
  articulo_id text NOT NULL,              -- itemId del movimiento (== articuloId de Abastecimiento)
  cantidad numeric(18,6) NOT NULL,        -- cantidad canónica escala 6 (frontera string-safe api-server)
  unidad text NOT NULL,                   -- unidad base del ítem
  moneda text,                            -- moneda esperada (del artículo); NULL si aún no resuelta
  ref_tipo text,                          -- referencia.tipo del movimiento (p.ej. 'ot')
  ocurrido_at timestamptz NOT NULL,       -- registradoAt del movimiento
  familia text NOT NULL,                  -- familia contable ('consumo'|'salida'|'devolucion'...)
  -- ---- resolución / auditoría ----
  costo_id text,                          -- hecho materializado (cuando estado='MATERIALIZADO')
  motivo text,                            -- causa del pendiente/fallo (auditable, nunca "0")
  intentos integer NOT NULL DEFAULT 0,
  actor_id text NOT NULL,                 -- principal de servicio que registró el intento
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, movimiento_id),
  CONSTRAINT chk_cos_pend_estado CHECK (
    estado IN ('PENDIENTE','MATERIALIZADO','SIN_COSTO','MULTIMONEDA','ERROR','DESCARTADO')
  ),
  CONSTRAINT chk_cos_pend_cantidad CHECK (cantidad >= 0),
  CONSTRAINT chk_cos_pend_materializado CHECK (
    estado <> 'MATERIALIZADO' OR costo_id IS NOT NULL
  )
);

-- opId determinista único por tenant (defensa en profundidad: 1 pendiente/opId).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cos_pend_opid
  ON deltaops.cos_pendientes_material (tenant_id, op_id);

-- Índice de reproceso: pendientes NO resueltos por tenant, más antiguos primero.
CREATE INDEX IF NOT EXISTS idx_cos_pend_estado
  ON deltaops.cos_pendientes_material (tenant_id, estado, creado_at);
CREATE INDEX IF NOT EXISTS idx_cos_pend_ot
  ON deltaops.cos_pendientes_material (tenant_id, ot_id);
CREATE INDEX IF NOT EXISTS idx_cos_pend_articulo
  ON deltaops.cos_pendientes_material (tenant_id, articulo_id);

-- ===========================================================================
-- RLS por tenant (patrón 0044).
-- ===========================================================================
ALTER TABLE deltaops.cos_pendientes_material ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cos_pendientes_material_iso ON deltaops.cos_pendientes_material;
CREATE POLICY cos_pendientes_material_iso ON deltaops.cos_pendientes_material
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
