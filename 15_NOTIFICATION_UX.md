# 15 — Notification UX

> **DeltaOps — ESI-008 · v1.0** · La experiencia de notificaciones: atención como recurso escaso — severidades con contrato, bandeja única y silencio configurable sin perder lo crítico.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Base congelada y superficie

El servicio de notificaciones existe (ESI-006/06: bandejas por cuenta, canales, preferencias). Este documento norma la **superficie**: cómo interrumpe, agrupa y se gobierna la atención.

| Severidad | Comportamiento en superficie | Ejemplo conceptual |
|---|---|---|
| **Crítica** | Interrumpe: banner persistente hasta atender; única clase que puede interrumpir | Parada de seguridad, revocación de acceso |
| **Requiere acción** | Bandeja + contador destacado; entra a "mi trabajo pendiente" | Aprobación esperándome |
| **Informativa** | Bandeja sin interrupción | La OT que sigo cambió de estado |
| **De sistema** | Zona de estado, no bandeja | Sincronización completada |

## 2. Reglas

1. **Una bandeja, todas las fuentes** (doc 02): los módulos no crean campanas propias; todo llega a la bandeja del shell vía el servicio; los contadores del shell son la suma gobernada.
2. **La severidad la declara el emisor y la audita el estándar**: el catálogo de notificaciones de cada módulo (su DGP) declara severidad por tipo; la crítica exige justificación y es revisada (doc 25) — la inflación de severidad es el impuesto a la atención de todos.
3. **Toda notificación lleva a su lugar**: cada una enlaza profundo (doc 03 §2.3) al recurso o tarea; la notificación que solo informa sin destino es sospechosa por diseño.
4. **Agrupación por defecto**: eventos repetidos del mismo tipo/recurso se agrupan ("5 OT vencieron hoy") con expansión; el goteo notificación-por-evento está prohibido como comportamiento por defecto.
5. **El silencio es configurable, lo crítico no**: preferencias por tipo y canal (ESI-006/06) permiten silenciar lo informativo; la severidad crítica no es silenciable — y por eso su alta está tan gobernada (§2.2).
6. **La bandeja respeta contexto**: multi-tenant muestra la bandeja del tenant activo; los contadores de otros tenants no se filtran a la vista (la muralla también es de atención).

## 3. Declaración (los ocho rubros)

- **Commands**: marcar atendida/leída, silenciar tipo (preferencia), actuar desde la notificación (el comando es del destino).
- **Queries**: bandeja del tenant activo, contadores por severidad, preferencias.
- **Capacidades**: los tipos de notificación siguen las capacidades de sus módulos emisores.
- **Servicios**: notificaciones (ESI-006/06) — este documento es su superficie.
- **Permisos**: recibir sigue la suscripción/alcance del emisor; sin permisos propios de bandeja.
- **Offline**: la bandeja muestra lo sincronizado; las críticas pendientes se presentan al recuperar conexión sin perderse.
- **KPIs**: tiempo a atención de críticas, ratio silenciado por tipo (detector de spam), notificaciones con clic al destino.
- **IA**: opcional en resumen de bandeja ("qué pasó hoy"), marcado; jamás decide severidades.

## Impacto sobre la implementación

La bandeja y el contrato de severidades entran al DGP de experiencia; cada DGP de módulo declara su catálogo de tipos con severidad justificada.

## Dependencias

Docs 02-03, 06, 11, 22, 25; ESI-006/06.

## Riesgos

- Inflación de severidad ("todo es crítico") que entrena a ignorar; mitigación: alta de críticas revisada §2.2, el ratio de silenciado como detector (KPI) y la poda periódica del catálogo en la revisión de experiencia.

## Decisiones habilitadas

- Atención operativa protegida: lo crítico llega, lo demás espera.
- Módulos nuevos notificando sin infraestructura propia.

## Decisiones bloqueadas

- Prohibidas campanas o bandejas por módulo.
- Prohibida la interrupción fuera de la severidad crítica.
- Prohibidas notificaciones sin destino navegable.

## Reusable Pattern

Cuatro severidades con contrato de superficie + bandeja única + agrupación por defecto: la economía de la atención como estándar, no como cortesía.

## Anti-Patterns

- El toast que tapa la acción que el usuario iba a pulsar.
- Notificar al autor lo que él mismo acaba de hacer.
- Usar notificaciones como registro histórico (para eso está la auditoría).

## Knowledge Graph

- **ETS que consume**: ETS-011 (atención operativa escasa).
- **ESI que consume**: ESI-006/06 (servicio congelado).
- **DGP que originará**: bandeja y contrato de severidades en el DGP de experiencia; catálogos por DGP de módulo.
- **ADR relacionados**: ADR de severidades con contrato de interrupción.
- **Módulos que reutilizarán este patrón**: todos declaran tipos; ninguno interrumpe por su cuenta.
