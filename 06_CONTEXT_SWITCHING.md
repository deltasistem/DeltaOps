# 06 — Context Switching

> **DeltaOps — ESI-008 · v1.0** · El cambio de contexto: tenant, sede, workspace y rol activo — cambiar sin perderse y sin mezclar jamás.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Los contextos

El shell (doc 02) gobierna cuatro contextos ortogonales que la sesión porta (ESI-007/05):

| Contexto | Qué determina | Quién lo tiene |
|---|---|---|
| **Tenant activo** | La muralla: qué datos existen | Usuarios multi-tenant (contratistas, soporte) |
| **Sede/alcance** | El filtro operativo dentro del tenant (ESI-007/08) | Usuarios con restricción o preferencia de alcance |
| **Workspace** | El espacio de trabajo (doc 04) | Todos |
| **Actuación** | Por quién actúo: propia o en-nombre-de (ESI-007/06) | Delegados y soporte |

## 2. Reglas

1. **El contexto es visible siempre**: la barra de identidad muestra tenant (cuando hay más de uno posible), sede activa, workspace y actuación en-nombre-de con marca inconfundible — nadie opera sin saber dónde ni como quién.
2. **Cambiar tenant es frontera dura**: el cambio de tenant limpia todo estado de pantalla, borradores en curso y selecciones; jamás persiste dato alguno a través de la muralla (ESI-003/09). El cambio con trabajo sin guardar se confirma explícitamente (doc 16).
3. **Cambiar sede o workspace es frontera blanda**: se preserva lo razonable (la pantalla equivalente del nuevo contexto se abre en estado limpio; los borradores quedan guardados donde nacieron y son alcanzables al volver).
4. **La actuación en-nombre-de colorea todo**: mientras dura, toda la experiencia lo marca de forma persistente y saliente (no un icono discreto); iniciar y terminar son actos explícitos con rastro doble (ESI-007/06).
5. **Los enlaces profundos resuelven contexto**: un enlace lleva implícito su tenant/recurso; abrirlo con otro tenant activo propone el cambio explícito (jamás lo hace en silencio) y aplica las cuatro verdades al aterrizar (doc 03 §2.3).
6. **El contexto sobrevive a la sesión donde es seguro**: workspace y sede preferida se recuerdan por cuenta (configuración, ESI-006/20); el tenant activo de usuarios multi-tenant se elige al entrar — la memoria de contexto nunca cruza la muralla.

## 3. Declaración (los ocho rubros)

- **Commands**: cambiar tenant/sede/workspace, iniciar/terminar actuación en-nombre-de (con sus eventos de seguridad, ESI-007/13).
- **Queries**: contextos disponibles para la cuenta (tenants con cuenta activa, sedes alcanzables, delegaciones vigentes).
- **Capacidades**: sin requisito propio; refleja las del contexto destino.
- **Servicios**: configuración (memoria de preferencias).
- **Permisos**: cambiar contexto no requiere permiso; actuar en el destino exige los del destino.
- **Offline**: el cambio de tenant exige conexión (re-evaluación de verdades); sede y workspace cambian offline dentro de lo sincronizado.
- **KPIs**: frecuencia de cambios (fricción de multi-contexto), errores post-cambio.
- **IA**: ninguna; el contexto jamás lo decide una sugerencia.

## Impacto sobre la implementación

El selector de contexto es pieza del shell en el DGP de experiencia; las reglas de limpieza por frontera entran al contrato de toda pantalla (doc 05 §2.4).

## Dependencias

Docs 02-05, 16; ESI-003/09; ESI-006/20; ESI-007/05-06, /08, /13.

## Riesgos

- Mezcla visual de tenants en usuarios multi-tenant (el error catastrófico de confianza); mitigación: frontera dura §2.2, identidad visual del tenant activo prominente y batería de no-mezcla en el checklist (doc 25).

## Decisiones habilitadas

- Contratistas y soporte operando multi-tenant con seguridad y claridad.
- Enlaces profundos que funcionan entre contextos sin sorpresas.

## Decisiones bloqueadas

- Prohibido el cambio de tenant silencioso o implícito.
- Prohibida la persistencia de estado a través de la muralla.
- Prohibida la actuación en-nombre-de sin marca persistente.

## Reusable Pattern

Cuatro contextos ortogonales + fronteras duras/blandas + visibilidad permanente: la gramática de contexto que toda pantalla hereda sin diseñarla.

## Anti-Patterns

- El selector de tenant escondido en ajustes.
- "Recordar" el último recurso visto a través de un cambio de tenant.
- Marcar la delegación solo en la pantalla donde empezó.

## Knowledge Graph

- **ETS que consume**: ETS-001 (contratistas multi-sede), ETS-011 (realidad operativa).
- **ESI que consume**: ESI-003/09; ESI-006/20; ESI-007/05-06, /08.
- **DGP que originará**: selector y reglas de frontera en el DGP de experiencia.
- **ADR relacionados**: ADR de fronteras duras/blandas de contexto.
- **Módulos que reutilizarán este patrón**: todos heredan la gramática; ninguno gestiona contexto propio.
