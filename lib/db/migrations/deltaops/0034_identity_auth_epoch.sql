-- DeltaOps · DGP-017 (ronda 1, corrección crítica) — Epoch de autorización.
--
-- `auth_epoch` es un contador monotónico por identidad que se incrementa en cada
-- login y cambio de tenant. La sesión guarda el valor vigente en `authVersion`;
-- el middleware de identidad EXIGE que coincidan. Una sesión con `authVersion`
-- obsoleta (p. ej. cookie previa a un switch-tenant, o reutilización) se rechaza
-- con 401, impidiendo que un contexto de sesión antiguo siga siendo autoritativo.
--
-- Aditivo e idempotente. No altera datos existentes (default 0).

ALTER TABLE deltaops.idn_identities
  ADD COLUMN IF NOT EXISTS auth_epoch integer NOT NULL DEFAULT 0;
