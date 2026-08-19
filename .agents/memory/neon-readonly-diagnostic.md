---
name: Diagnóstico Neon read-only
description: Compatibilidad observada al imponer sesiones de solo lectura en el endpoint PostgreSQL administrado por Neon.
---

# Diagnóstico Neon read-only

No usar el parámetro de inicio PostgreSQL `options` para imponer
`default_transaction_read_only=on` en el diagnóstico contra el endpoint Neon
actual. Usar una transacción explícita `BEGIN READ ONLY`, ejecutar únicamente
las consultas de inspección y finalizar siempre con `ROLLBACK`.

**Why:** el endpoint aceptó TLS y autenticación, pero respondió `08P01`
(*protocol violation*) al recibir `options`; al retirar ese parámetro y usar la
transacción explícita, el mismo diagnóstico completó correctamente contra
PostgreSQL 18.4.

**How to apply:** en probes de infraestructura de solo lectura, abrir un cliente
temporal, iniciar `BEGIN READ ONLY`, ejecutar solo `SELECT`, hacer `ROLLBACK` en
`finally`, liberar el cliente y cerrar el pool. No extrapolar esta limitación a
todos los endpoints Neon sin volver a verificar.