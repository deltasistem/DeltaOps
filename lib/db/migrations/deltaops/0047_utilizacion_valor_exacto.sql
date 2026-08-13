-- DGP-021.4-A · Extensión ADITIVA del read model público de Utilización (DGP-019).
-- Aprobada por Dirección 2026-08-13 (Opción A del Descubrimiento DGP-021.4).
--
-- Objetivo: exponer en el read model público de lecturas dos campos ADITIVOS que
-- habilitan el cálculo EXACTO de costo/hora y costo/km (denominador determinista),
-- SIN recalcular ni alterar la semántica ni la forma de ningún campo existente:
--
--   · valor_exacto  text  → la CADENA decimal tal cual el `numeric` ya persistido
--                            en `valor` (Postgres devuelve numeric como texto sin
--                            pérdida). NO se recalcula: es `valor::text`.
--   · es_reinicio   boolean → marcador de ANCLA de tramo (reinicio de medidor),
--                            consumible con permiso de LECTURA normal (sin
--                            CAP_REGULARIZAR). Permite segmentar Δ por tramos sin
--                            cruzar reinicios.
--
-- ESTRICTAMENTE ADITIVA: columnas nuevas nullable/con DEFAULT; nada existente
-- cambia de forma. 100% idempotente. RLS ya activa en la tabla (no se re-crea).

ALTER TABLE deltaops.utl_lecturas_read
  ADD COLUMN IF NOT EXISTS valor_exacto text,
  ADD COLUMN IF NOT EXISTS es_reinicio boolean NOT NULL DEFAULT false;

-- Backfill idempotente del valor exacto desde el numeric YA persistido (sin
-- recalcular: sólo su representación textual canónica de Postgres).
UPDATE deltaops.utl_lecturas_read
   SET valor_exacto = valor::text
 WHERE valor_exacto IS NULL;

-- Backfill best-effort del marcador de reinicio para filas históricas, derivado
-- del snapshot ya persistido (`datos`): el comando `reinicio-medidor` sella
-- origen 'manual' + observación con el prefijo canónico. Es un backfill de DATOS
-- (una sola vez), no un contrato en runtime; el runtime marca es_reinicio desde
-- el TIPO de evento (REINICIO_MEDIDOR), no por parseo de texto.
UPDATE deltaops.utl_lecturas_read
   SET es_reinicio = true
 WHERE es_reinicio = false
   AND datos->>'origen' = 'manual'
   AND datos->>'observacion' LIKE 'Reinicio de medidor:%';

-- Índice para segmentar tramos por activo/medidor/tiempo respetando reinicios.
CREATE INDEX IF NOT EXISTS idx_utl_lecturas_read_tramo
  ON deltaops.utl_lecturas_read (tenant_id, activo_id, tipo_medidor, fecha_hora, es_reinicio);
