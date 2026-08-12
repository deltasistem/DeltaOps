---
name: Contrato de identidad en asignación DGP-020.1
description: Lecciones de resolver G-1 — asignación de OTs por identityId canónico: puerto de identidad, modelo aditivo, idempotencia en todos los comandos, proyecciones cruzadas.
---

## Referencias de identidad entre módulos: puerto + servicio público, modelo aditivo
Órdenes valida asignaciones con un `IdentidadPort` fail-safe (fake vacío rechaza personas por defecto) respaldado por el servicio público de Identidad — nunca acceso a tablas `idn_*` desde el módulo. El vínculo fuerte es `asignado_identity_id` ADITIVO (Opción C): `asignado_id` texto se conserva para no-persona, compatibilidad e históricos; los ambiguos quedan "requiere regularización" sin heurísticas por nombre/email.
**Why:** reemplazar la columna rompía consumidores y las heurísticas de mapeo inventan identidades; el puerto evita acoplamiento a internas de Identidad.
**How to apply:** para futuros vínculos de identidad (supervisor, cuadrillas, sesiones de trabajo DGP-020.2), replicar puerto + columna aditiva + validación existe/activa/membresía/mismo-tenant con tenant derivado SOLO del contexto autenticado.

## El claim durable de opId debe cubrir TODOS los comandos mutantes, no solo /sync
Órdenes solo protegía la ruta /sync; los 12 comandos con UoW propia expuestos a POST directo podían duplicar hechos bajo concurrencia (dos POST con el mismo opId veían ausencia de recibo y ambos persistían). Fix: `reclamar` (INSERT ON CONFLICT DO NOTHING RETURNING xmax=0) dentro de la UoW ANTES de cualquier efecto; recibos con estado pendiente/sellado; el ROLLBACK del kernel limpia claims de comandos fallidos.
**Why:** los tests de idempotencia secuenciales no detectan la carrera; la revisión la detectó por lectura del orden efectos→sellar.
**How to apply:** en todo comando mutante nuevo, claim antes de efectos + test de concurrencia real PG (Promise.all mismo opId ⇒ exactamente un hecho). Los orquestadores sin UoW única garantizan exactly-once vía sub-opIds.

## Un evento nuevo debe proyectarse en TODOS los read models que representan el mismo hecho
`ASIGNACION_REGISTRADA` solo escribía el read model de asignaciones; responsables y listado/detalle seguían mostrando null aunque el comando devolvía 200. Los e2e de UI lo destapan; los tests del read model aislado no.
**How to apply:** al introducir un evento/dominio nuevo, inventariar qué read models exponen ese concepto (detalle, listado, agregados) y proyectarlos todos desde el payload, idempotente por (tenant, eventId); test de integración comando→outbox→proyección→query pública.

## Todo cambio de estado accionable necesita su camino de vuelta en la UI
La asignación inicial tenía modal, pero no existía camino de UI para reasignar (el backend lo soportaba con reemplazaVigentes). Patrón: mismo modal con `modo`, precarga de la identidad actual y submit habilitado solo ante cambio real, opId nuevo por invocación.

## RBAC de presentación: superficies antiguas heredan la deuda
El Centro de Operaciones mostraba transiciones (Cancelar/Iniciar…) sin gate a CONSULTA desde antes del programa de capacidades. Cada fase que toca una superficie debe pasar el barrido "CONSULTA sin escrituras visibles" sobre esa superficie completa con `capacidadesOrdenes` (transicionar exige `modulo.ordenes.operar` ⇒ capacidad `ejecutar`).
