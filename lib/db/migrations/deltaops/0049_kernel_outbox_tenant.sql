-- DeltaOps · DGP-023.5 · Migración 0049 — tenant_id aditivo en el outbox del Kernel
--
-- N-2 (DGP-023.4 §I4): los eventos del outbox deben ser AUTOSUFICIENTES bajo RLS
-- efectiva. Se añade una columna aditiva `tenant_id` que el Kernel puebla desde el
-- `payload->>'tenantId'` (fuente autoritativa server-side; nunca desde el cliente).
--
-- Aditiva y reversible: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Las 163 filas
-- históricas del tipo `modulo.manodeobra.valoracion-registrada` conservan
-- tenant_id = NULL (quedan identificadas como HISTÓRICAS; NO se falsifican). Un
-- backfill retroactivo requeriría aprobación explícita de Dirección (fuera de alcance).
--
-- drizzle-kit push NO detecta con fiabilidad este cambio ⇒ aplicar con psql.

ALTER TABLE deltaops.kernel_outbox
  ADD COLUMN IF NOT EXISTS tenant_id varchar(255);

ALTER TABLE deltaops.kernel_dead_letter
  ADD COLUMN IF NOT EXISTS tenant_id varchar(255);

-- Índice parcial para handlers que resuelvan tenant desde el outbox.
CREATE INDEX IF NOT EXISTS idx_kernel_outbox_tenant
  ON deltaops.kernel_outbox (tenant_id)
  WHERE tenant_id IS NOT NULL;
