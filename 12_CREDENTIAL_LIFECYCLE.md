# 12 — Credential Lifecycle

> **DeltaOps — ESI-007 · v1.0** · El ciclo de vida de credenciales: emisión, uso, rotación, revocación y retiro — uniforme para humanos, sistemas y plataforma.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El ciclo único

Toda credencial (contraseña, factor MFA, credencial de API de cuenta de servicio, llave de firma, credencial de integración) recorre el mismo ciclo con parámetros por tipo:

| Fase | Norma |
|---|---|
| **Emisión** | Por el canal del tipo (alta de identidad, registro de cuenta de servicio, alta en el almacén); con fuerza mínima por política; entrega de un solo uso (el valor se muestra/entrega una vez, doc 11 §2.2) |
| **Uso** | Registrado (última utilización visible); la credencial sin uso prolongado es candidata a retiro por inactividad |
| **Rotación** | Periódica por tipo (las de sistema y firma, calendarizada; las humanas, por política del tenant sobre mínimos) y **extraordinaria** ante sospecha — diseñada para ser rutinaria: solapamiento N/N-1 de credenciales durante la ventana de rotación para no interrumpir sistemas |
| **Revocación** | Inmediata, central, con efecto en la siguiente petición (margen del doc 05 §2.1); revocar no espera a nadie |
| **Retiro** | La credencial muerta no se retiene (docs 11); su historial de ciclo sí |

## 2. Reglas

1. **El solapamiento hace la rotación barata**: dos credenciales válidas durante la ventana (nueva emitida, vieja por caducar) es el mecanismo estándar para sistemas — la rotación que exige parada coordinada no se hace, y la que no se hace es el riesgo.
2. **Caducidad por defecto en todo lo no humano**: credenciales de API y llaves nacen con caducidad; la eterna exige decisión registrada con dueño (y aparece en el score, doc 20).
3. **La sospecha dispara rotación, no debate**: credencial posiblemente expuesta (hallazgo en código, dispositivo perdido, anomalía de comportamiento) → rotación extraordinaria como acto reflejo del runbook; investigar después.
4. **Inventario de edades como evidencia viva**: la edad de toda credencial es consultable (docs 10-11); las vencidas-en-gracia y las eternas-con-waiver son visibles, no enterradas.
5. **Los mínimos son de plataforma**: fuerza, caducidades máximas y ventanas de gracia tienen suelo de plataforma; las políticas de tenant endurecen, nunca relajan (patrón doc 03 §1).

## 3. Declaración (los seis rubros)

- **Clasificación**: credenciales = secreto (S); metadatos de ciclo = interno (I).
- **Riesgo**: crítico (R1).
- **Permisos**: los de administración de cada tipo (docs 02, 10-11); la rotación extraordinaria de plataforma exige `PLATAFORMA.SECRETOS.ADMINISTRAR`.
- **Auditoría**: toda transición de fase, con actor y motivo (la extraordinaria referencia su disparador).
- **Retención**: historial de ciclo por el plazo de eventos de seguridad.
- **Evidencias**: inventario de edades, calendario de rotaciones cumplidas, tiempos de revocación en simulacros (doc 22).

## Impacto sobre la implementación

Parte de los DGP de identidad y plataforma de seguridad; el solapamiento N/N-1 entra al contrato de credenciales de API desde el diseño (los clientes de integración lo conocen de entrada).

## Dependencias

Docs 02-03, 05, 10-11, 13, 20; ESI-006/14.

## Riesgos

- Rotaciones de llaves de firma rompiendo verificadores externos (webhooks); mitigación: el solapamiento aplica también a firmas — los sobres declaran qué llave firmó y los receptores validan contra el conjunto vigente publicado.

## Decisiones habilitadas

- Rotación rutinaria sin ventanas de mantenimiento coordinadas.
- Respuesta a exposición en minutos (rotar primero, investigar después).

## Decisiones bloqueadas

- Prohibidas credenciales no humanas sin caducidad salvo decisión registrada.
- Prohibidas rotaciones que exijan parada coordinada.
- Prohibido relajar mínimos de plataforma por política de tenant.

## Reusable Pattern

Emisión única + solapamiento N/N-1 + revocación central + inventario de edades: el ciclo citable para todo tipo de credencial, presente y futuro.

## Anti-Patterns

- "Rotaremos cuando haya tiempo" (la deuda que solo se paga en el incidente).
- Revocación en cascada manual pieza por pieza.
- Credenciales de emergencia pre-compartidas "por si acaso" fuera del almacén.

## Knowledge Graph

- **ETS que consume**: ETS-009 (protección), ETS-011 (credenciales de frontera).
- **ESI que consume**: ESI-006/14; docs 05, 10-11 de esta serie.
- **DGP que originará**: ciclo en DGP-Identidad y DGP de plataforma de seguridad.
- **ADR relacionados**: ADR de solapamiento N/N-1 de credenciales (doc 26).
- **Módulos que reutilizarán este patrón**: ninguno gestiona credenciales; todos se benefician de rotaciones sin parada.
