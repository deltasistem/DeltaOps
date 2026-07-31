# 22_INTEGRATION_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de integración: cómo el Core habla con sistemas externos en ambas direcciones sin dejarlos entrar.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las dos direcciones

```text
SALIENTE (consumidor, 10)
  evento despachado → ¿suscripción de integración vigente?
  → TRANSFORMACIÓN por mapeo versionado del tenant (ETS-008/13)
  → puerto Conector (06) → entrega con reintentos y firma
  → hecho entrega_webhook / intercambio con desenlace (ETS-010/03)

ENTRANTE (adaptador de entrada, 07)
  webhook/archivo/consulta externa → receptor del conector
  → validación de origen (firma, credencial del conector)
  → TRANSFORMACIÓN por mapeo versionado → COMANDOS NORMALES por el
  pipeline 11 (actor = la integración, canal = integracion)
  → resultado devuelto/registrado según el patrón del conector
```

## 2. Reglas normativas

1. **Lo externo entra como comandos, nunca como escrituras**: una integración jamás toca persistencia — sus datos recorren autorización, validación, Policies y UoW como cualquier canal (la igualdad de canales incluye a las máquinas; 11 §2.5).
2. **Mapeos como configuración versionada** (ETS-005): campo↔campo, transformaciones y valores por defecto son definiciones del tenant, versionadas y congeladas en el hecho de intercambio — "qué mapeo produjo esto" siempre tiene respuesta.
3. **El conector es un puerto por sistema externo** (06): el Core conoce "conector de ERP X" por contrato, no su SDK; credenciales en la plataforma de secretos (ETS-007/12), jamás en configuración de negocio.
4. **Idempotencia bidireccional**: lo entrante trae clave (o el receptor la deriva del identificador externo — reintentos del sistema externo no duplican); lo saliente registra entrega por evento×suscripción (redespachos no re-entregan).
5. **Fallas con bandeja, no con silencio**: entregas fallidas reintentadas con retroceso y vencimiento → estado fallido visible + alerta (16); entrantes inválidos quedan en bandeja de intercambio con diagnóstico para reproceso tras corregir el mapeo.
6. **Aislamiento de ritmo**: un sistema externo lento o caído jamás frena comandos ni proyecciones — todo lo saliente es post-commit; todo lo entrante tiene límites de tasa por conector.
7. **Auditoría plena**: cada intercambio es un hecho (dirección, conector, mapeo+versión, correlación con los comandos/eventos internos) — la conversación con cada sistema externo es reconstruible.

---

## Impacto sobre la implementación
El módulo de integración implementa receptores, transformador por mapeos y el consumidor saliente; cada conector nuevo es un adaptador + su contrato de puerto + mapeos de configuración — sin tocar el Core.

## ETS relacionados
ETS-008 (10 webhooks, 13 API de integración) · ETS-005 (10 motor de integración) · ETS-007 (08) · ETS-010 (03 integracion, 18 idempotencia) · ETS-011 (07, 10, 11).

## Riesgos
- Lógica de negocio escondida en mapeos ("si el monto > X entonces…") → los mapeos transforman forma; las decisiones son Policies/dominio — revisión de mapeos con esa vara.
- Conectores que exigen respuestas síncronas de negocio → el patrón del conector lo declara; cuando el comando es asíncrono, la respuesta es aceptación con correlación (ETS-008).

## Decisiones habilitadas
Catálogo de conectores, editor de mapeos (producto), bandejas de intercambio, correlación externa↔interna.

## Decisiones bloqueadas
Conectores concretos de lanzamiento y sus SDKs — implementación por demanda de clientes.
