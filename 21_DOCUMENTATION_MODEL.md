# 21 — Modelo de Documentación

> **DeltaOps — ESI-005 · v1.0** · El expediente documental de un módulo de negocio: qué mantiene, qué añade sobre el ejemplar y qué le está prohibido documentar.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Norma base

Todo módulo mantiene el expediente de ESI-004/20: presentación, ADR locales, catálogo de líneas de log, catálogo de hechos auditados, operación, capítulo de seed. Reglas de vida por evento; citar en lugar de repetir; el checklist verifica el expediente al día.

## 2. Lo que un módulo de negocio añade al expediente

| Documento adicional | Contenido | Origen |
|---|---|---|
| **Mapa de agregados** | Agregados, fronteras, máquinas de estado, con sus invariantes | Doc 11 |
| **Catálogo de KPIs** | Definiciones oficiales con fórmula, ruta y dueño | Doc 13 |
| **Catálogo de parámetros** | Configuración por tenant con defaults y dueños | Doc 14 |
| **Clasificación de datos** | Campos sensibles y su tratamiento | Doc 15 |
| **Tabla de aptitud offline** | Comandos aptos con criterios y resolución de conflictos | Doc 18 |
| **Inventario de integraciones** | Sistemas, patrones, comportamiento ante caída | Doc 19 |
| **Glosario del dominio** | El lenguaje ubicuo del contexto (ETS-003), términos y significados exactos | ETS-003 |

Los que no apliquen se declaran "ninguno" explícitamente (omisión consciente, ESI-004/02 §3).

## 3. Reglas

1. **El glosario es normativo**: los nombres de agregados, comandos, eventos y permisos salen del glosario; una pieza con nombre fuera del glosario es un hallazgo de revisión.
2. **El expediente es la vista humana de la declaración**: donde ambos hablen de lo mismo (permisos, eventos, parámetros), la declaración es la verdad y el expediente explica el porqué; jamás listas paralelas mantenidas a mano de lo que la declaración ya enumera.
3. **Documentación de cara al tenant** (manuales, ayuda) pertenece al producto, no al repositorio del módulo (ESI-004/20 §2.3); el expediente puede alimentarla, no sustituirla.

## Impacto sobre la implementación

La plantilla de expediente (T09) se amplía con las secciones §2; los DGP producen la mayoría de estos documentos como subproducto de sus formularios de diseño.

## Dependencias

ESI-004/20; ETS-003 (lenguaje); docs 11, 13-15, 18-19; ESI-002/23.

## Riesgos

- El expediente ampliado percibido como carga; mitigación: casi todo se genera desde los formularios del DGP — documentar es rellenar el diseño una vez, no escribir prosa después.

## Decisiones habilitadas

- Onboarding por módulo de negocio con dominio incluido (glosario + mapa de agregados).
- Auditorías de cliente respondibles desde el expediente (clasificación, KPIs, permisos).

## Decisiones bloqueadas

- Prohibidas listas manuales paralelas a la declaración.
- Prohibidos nombres de piezas fuera del glosario del contexto.
- Prohibido usar el expediente como manual de usuario.

## Reusable Pattern

La tabla §2 como estructura fija del expediente de módulo de negocio; los formularios del DGP son la fuente y el expediente el destino — una sola escritura.

## Anti-Patterns

- Glosarios copiados entre módulos (el lenguaje es por contexto, ETS-003).
- Expedientes de lanzamiento que mueren tras la aceptación.
- ADR locales que contradicen el estándar en silencio (eso es cambio de regla, ESI-002/27).

## Knowledge Graph

- **ETS que consume**: ETS-003 (lenguaje ubicuo por contexto).
- **ESI que consume**: ESI-004/20; ESI-002/23.
- **DGP que originará**: la tarea "expediente del módulo" de cada DGP-módulo, alimentada por sus formularios.
- **ADR relacionados**: los ADR locales de cada módulo viven precisamente en este expediente.
- **Módulos que reutilizarán este patrón**: todos; la estructura es única, el contenido por dominio.
