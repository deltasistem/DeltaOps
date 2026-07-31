# 16_NOTIFICATION_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de notificaciones: de evento de dominio a mensaje entregado, sin lógica de negocio propia.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las etapas

```text
EVENTO DESPACHADO (10)
  1. SUSCRIPCIÓN   ¿qué suscripciones vigentes cubren este evento?
                   (configuración del tenant: evento × destinatarios
                   × canales × condiciones — ETS-005/06)
  2. RESOLUCIÓN    destinatarios concretos a la fecha (roles → cuentas
                   con membresía vigente en el contexto del evento;
                   respeta el alcance: nadie es notificado de lo que
                   no puede ver — 14)
  3. COMPOSICIÓN   mensaje desde plantilla versionada, en el idioma
                   del destinatario, con datos del sobre del evento
  4. ENTREGA       por canal (puerto, 06): interna/campana, correo,
                   push móvil, webhook — cada intento registrado
  5. ESTADO        hecho de envío con desenlace (entregado, fallido,
                   reintentos); las fallas persistentes alertan
```

## 2. Reglas normativas

1. **Consumidor puro** (10): el pipeline no participa en la transacción del comando; la notificación es consecuencia del evento confirmado — jamás causa un rollback ni retrasa un comando.
2. **Sin lógica de negocio**: no decide si algo es "importante" — las suscripciones y reglas configurables deciden (ETS-005); el motor de notificaciones ejecuta (ETS-003/04 §8).
3. **Idempotente por evento×suscripción×destinatario**: el redespacho no duplica mensajes (clave natural del envío, física en `notificaciones`, ETS-010/03).
4. **La notificación apunta, no contiene**: lleva la referencia (deep link al recurso por contrato ETS-008) y el mínimo contexto; los datos Restringidos jamás viajan en el cuerpo de un correo/push (ETS-006/13) — se ven al abrir, con autorización.
5. **Preferencias del destinatario**: canales y silencios por usuario dentro de lo que la política del tenant permita (las obligatorias de seguridad no se silencian).
6. **Trazable de punta a punta**: del evento origen al estado de entrega — "¿por qué me llegó esto?" y "¿por qué no me llegó?" son consultas (read model de envíos), no misterios.

---

## Impacto sobre la implementación
El pipeline se implementa como consumidor estándar del framework (10) más adaptadores por canal; las plantillas son definiciones versionadas de configuración; el read model de envíos entra al catálogo.

## ETS relacionados
ETS-005 (06 motor de notificaciones, suscripciones) · ETS-003 (04 §8) · ETS-008 (10 webhooks) · ETS-010 (03 esquema notificaciones) · ETS-011 (10 consumidores, 14 alcance).

## Riesgos
- Tormentas de notificaciones por eventos masivos (cierre de periodo, sincronización grande) → agrupación/resumen configurable por suscripción y límites de tasa por destinatario.
- Canales externos caídos acumulan reintentos → política de reintentos con vencimiento y estado fallido visible; el canal interno nunca depende de externos.

## Decisiones habilitadas
Adaptadores por canal, plantillas versionadas, read model de envíos, paneles de entrega.

## Decisiones bloqueadas
Proveedores concretos de correo/push y los formatos finos de plantilla — implementación.
