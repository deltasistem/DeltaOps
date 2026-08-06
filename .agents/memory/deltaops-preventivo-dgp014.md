---
name: Preventivo DGP-014
description: Lecciones del módulo de negocio preventivo compuesto sobre Planes congelado.
---

# Enterprise Preventive Maintenance (DGP-014)

- **Módulo de negocio por composición**: la Dirección definió que sobre motores genéricos congelados (Planes) se construyen módulos de NEGOCIO nuevos que consumen SOLO contratos públicos exportados del paquete (`evaluarFrecuencia` de @workspace/module-planes) — nunca imports privados ni reimplementación del motor. Dedup y orquestación propios del módulo compositor.
- **"Corpus congelado" = la lista taxativa de paquetes lib/* del prompt**; artifacts/api-server y artifacts/deltaops son superficies de integración/experiencia modificables en toda fase, y lib/db recibe adiciones (espejo Drizzle + migraciones). Aclararlo al revisor evita un falso CRÍTICO.
- Contratos canónicos de módulos congelados a verificar ANTES de integrar (no asumir): Planes publica estado `vigente` + `versionActiva` (no "publicado"); Órdenes exige tipo `preventiva` y `activoPrincipal {activoId, entityRef, rol}`.
- Ids deterministas: el helper `idDet` FNV colisiona con semillas largas — usar UUIDv5/SHA-1 para ids derivados de strings largos.
- El fix de multiplexado por clave del workflow-engine (013) permite varios procesos bajo un servicio (`programa`/`generacion` bajo modulo.preventivo.workflow) sin tocar el motor.
- Evidencia PG ante el revisor: las suites PG se omiten sin DATABASE_URL; ejecutar y citar el conteo con la variable presente (95 vs 86) es la prueba de que corrieron.
