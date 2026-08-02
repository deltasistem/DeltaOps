# 01 — Backend Foundation: Arquitectura General

> **DeltaOps — ESI-003 · v1.0** · La plataforma backend reutilizable sobre la que se montan todos los módulos.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Qué es el Backend Foundation

El Backend Foundation es la capa de plataforma del backend: todo lo que **no** es un módulo de negocio pero que **todo** módulo de negocio necesita para ejecutarse. Materializa en runtime lo diseñado en ETS-011 (núcleo de aplicación), ETS-012 (blueprint) y ESI-002/03 (estructura del repositorio), sobre el stack congelado en ESI-001 (Python + FastAPI + SQLAlchemy + PostgreSQL).

No contiene Activos, Inventario, Compras ni ningún otro dominio. Contiene el Kernel en ejecución, la plataforma de aplicación y el arranque.

## 2. Los tres anillos

| Anillo | Contenido | Regla de dependencia |
|---|---|---|
| **Kernel** | Contratos, tipos base, puertos, Policies, errores canónicos, contexto de ejecución | No depende de nada externo al lenguaje |
| **Plataforma** | Implementaciones de runtime: DI, UoW, repositorios, dispatcher, middleware, observabilidad | Depende solo del Kernel y de librerías aprobadas (ESI-001) |
| **Arranque** | Composición: lee configuración, construye el grafo de dependencias, registra módulos, expone la aplicación | Único lugar que conoce todo |

Los módulos de negocio dependen del Kernel (contratos) y son cableados por el Arranque. Jamás dependen de la Plataforma directamente ni entre sí, salvo por eventos (ETS-003).

## 3. Principios normativos

1. **El módulo no sabe que existe FastAPI.** El framework HTTP vive en el borde; los casos de uso reciben contexto y comandos, no requests.
2. **Todo pasa por el contexto de ejecución.** Tenant, usuario, permisos, correlación: nada viaja por variables globales (doc 09).
3. **Una sola transacción por caso de uso**, gestionada por la UoW de plataforma (doc 20), con outbox en la misma transacción.
4. **Las dos murallas de RLS** (ETS-009) son responsabilidad de la plataforma, no del módulo: el módulo no puede olvidarse del tenant porque nunca lo maneja a mano.
5. **Errores por catálogo** (ETS-011): la plataforma traduce; el módulo solo lanza errores canónicos.
6. **Todo observable por defecto**: logging, métricas y trazas se inyectan; el módulo no configura observabilidad.

## 4. Mapa de la serie ESI-003

Los documentos 02-09 cubren arranque, ciclo de vida, Kernel, DI, registro de módulos/capacidades, configuración y contexto. Los 10-18 cubren el borde HTTP y los servicios transversales (middleware, autenticación, autorización, permisos, sesiones, errores, logging, observabilidad, salud). Los 19-24 cubren los runtimes de ejecución (eventos, UoW, repositorios, background, archivos, integraciones). Los 25-28 cierran con estructura física, convenciones, readiness y evolución.

## 5. Jerarquía normativa

Charter → ETS-001…012 → ESI-001 → ESI-002 → **ESI-003** → DGP. Ante conflicto, gana el documento superior; este ESI solo instrumenta, no redefine.

## Impacto sobre la implementación

Define el perímetro exacto de lo que los DGP de plataforma deben construir antes del primer módulo de negocio. Los tres anillos se traducen en las carpetas `kernel/`, `plataforma/` y `arranque/` de ESI-002/03.

## Dependencias

ETS-011 (núcleo de aplicación), ETS-012 (blueprint), ESI-001 (stack), ESI-002/03 (estructura), ENGINEERING_CHARTER §arquitectura.

## Riesgos

- Que lógica de negocio se filtre a la plataforma "por comodidad"; mitigación: revisión con checklist ESI-002/25 y regla de dependencias verificable.
- Sobreingeniería del Foundation antes del primer módulo; mitigación: readiness (doc 27) exige un módulo de referencia, no perfección.

## Decisiones habilitadas

- Iniciar los DGP de Kernel y plataforma en el orden previsto en ESI-002/20.
- Diseñar cada runtime (docs 02-24) sabiendo su anillo y sus reglas de dependencia.

## Decisiones bloqueadas

- Prohibido que módulos dependan de la Plataforma o entre sí (salvo eventos).
- Prohibido introducir frameworks no aprobados en ESI-001.
- Prohibido mover reglas de negocio al Foundation.
