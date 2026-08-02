# 14 — Evento Publicado de Referencia

> **DeltaOps — ESI-004 · v1.0** · "Elemento de Referencia Activado": el evento canónico, del agregado al sobre.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El evento

| Atributo | Valor |
|---|---|
| Tipo | Elemento de Referencia Activado — pasado, en español (ETS-003/008, ESI-002/24) |
| Emisor | El agregado, al ejecutar la transición; el caso de uso no fabrica eventos |
| Carga útil | Identificador del elemento, código natural, versión resultante, fechaNegocio de la activación. **Mínima**: lo que un consumidor necesita para reaccionar o para decidir si le interesa; nada de volcar el agregado entero |
| Sobre | El de plataforma (ETS-008): tipo, versión del tipo, tenant, correlación, causa, fechaRegistro — el módulo no lo construye, lo aporta el runtime (ESI-003/19) |
| Versión del tipo | v1; los cambios siguen compatibilidad N/N-1 (ESI-002/21) |
| Publicación | Outbox en la transacción del comando (doc 13) |

## 2. Qué demuestra

1. **El evento es un hecho, no una orden**: anuncia lo ocurrido; no sabe quién lo consume ni para qué. La prueba de diseño: el módulo compila y funciona con cero consumidores.
2. **Carga útil mínima y estable**: los consumidores que necesiten más datos consultan por el plano de lectura con el identificador; así el contrato del evento casi nunca cambia.
3. **Distinción fechaNegocio / fechaRegistro** en un caso concreto: cuándo ocurrió la activación para el negocio vs cuándo la registró el sistema (ETS-003).
4. **Trazabilidad**: la correlación del comando viaja en el sobre; la prueba E2E la sigue hasta la proyección (doc 07 §3.2).

## 3. Reglas normativas

1. Todo evento se emite **dentro del agregado** como parte de la transición; los eventos "decorativos" añadidos por el caso de uso están prohibidos.
2. El nombre describe el hecho de negocio, no la operación técnica ("Activado", no "Fila Actualizada").
3. Un comando puede emitir varios eventos si ocurren varios hechos; el ejemplar emite uno para mantener el patrón nítido.
4. Los eventos son **contratos internos versionados**: el contrato público (webhooks, ESI-003/24) es una proyección de ETS-008, jamás el sobre interno.

## Impacto sobre la implementación

Instancia canónica de la parte de eventos de la plantilla T03 (agregado). El catálogo de tipos de evento (ESI-003/04) recibe su primera entrada real.

## Dependencias

Docs 05, 13, 15; ESI-003/19 (dispatcher) y /04 (catálogo); ETS-003 (hechos de dominio), ETS-008 (sobre y contratos).

## Riesgos

- Cargas útiles crecientes a demanda de consumidores; mitigación: regla de carga mínima + "consultá con el identificador" como respuesta por defecto; ampliar la carga exige revisión de contrato.

## Decisiones habilitadas

- Catálogo de eventos con su primer ejemplar completo y probado.
- Patrón de enriquecimiento por consulta en lugar de eventos gordos.

## Decisiones bloqueadas

- Prohibido emitir eventos fuera del agregado.
- Prohibido volcar agregados completos en cargas útiles.
- Prohibido exponer el sobre interno como contrato público.

## Reusable Pattern

Los DGP futuros copian el formulario §1 para cada evento nuevo y las reglas §3 tal cual; la prueba "funciona con cero consumidores" es el criterio de desacoplamiento de todo evento.

## Anti-Patterns

- Eventos-orden ("Enviar Correo De Activación") que encubren llamadas dirigidas.
- Eventos técnicos de CRUD sin significado de negocio.
- Consumidores que dependen de campos no contractuales de la carga útil.
