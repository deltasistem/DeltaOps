# 22_INTEGRATION_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Integraciones: lo externo entra como comandos, sale como consumidores.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Las dos direcciones (ETS-011/22)

```
SALIENTE   consumidor estándar → mapeo versionado → puerto Conector → sistema externo
ENTRANTE   receptor (adaptador de entrada) → normalización → COMANDO normal (actor = integración)
```

## 2. Reglas de implementación

1. **Nada entra al sistema si no es un comando del catálogo**: un webhook, un archivo importado o un pull programado terminan SIEMPRE construyendo comandos normales — pipeline completo, permisos del actor-integración, validación de tres capas, idempotencia, auditoría. No existe la "escritura de integración" que esquive el flujo.
2. **El actor-integración es un actor de primera clase**: identidad propia, capacidades acotadas (solo las operaciones que su contrato de integración declara), alcance organizacional configurado; sus denegaciones se auditan como las de cualquier humano.
3. **Los mapeos son configuración versionada, no código** (ETS-011/22): la traducción campo-a-campo entre DeltaOps y el sistema externo vive en definiciones versionadas por tenant (ETS-005); el conector aplica el mapeo, el implementador no escribe `if` de traducción por cliente. Cambiar un mapeo no despliega código.
4. **Idempotencia bidireccional**: entrante — la clave de idempotencia se deriva de la identidad externa del hecho (id del evento del sistema origen); saliente — cada entrega lleva clave que el receptor pueda deduplicar (09 §regla 6). El reintento es la norma en ambas direcciones.
5. **Aislamiento de ritmo** (ETS-011/22): cada integración tiene su consumidor con su cursor y su presupuesto de tasa; una integración lenta o caída acumula SU bandeja sin tocar el flujo de las demás ni el del negocio.
6. **El estado de la conversación es consultable**: entregas salientes con estado (pendiente/entregada/fallida/abandonada), recepciones con desenlace (comando confirmado/rechazado/apartado); la pantalla de salud de integraciones (ETS-004) se proyecta de estos hechos — no de logs.
7. **Errores del sistema externo no son errores de DeltaOps**: el rechazo del receptor externo se registra en el estado de entrega y su bandeja; jamás burbujea como falla del comando de negocio que originó el evento (ese ya se confirmó — regla de oro del outbox).
8. **Sin llamadas síncronas a sistemas externos dentro de comandos**: si un comando "necesita" confirmar algo afuera antes de decidir, se rediseña como proceso por eventos con estado explícito (ETS-011/09) — la disponibilidad de DeltaOps nunca depende de la de terceros.

## 3. Prueba obligatoria

Entrante: el mismo hecho externo entregado dos veces → un solo efecto; el hecho mal formado → apartado o rechazo con estado consultable, jamás pérdida silenciosa. Saliente: suite estándar de consumidores + mapeo aplicado por versión + receptor caído → reintentos con presupuesto → bandeja con estado. Todo con fakes de conector; el protocolo real, en integración.

---

## Impacto sobre la implementación
Integrar un sistema nuevo = registrar actor, declarar mapeos, configurar el conector — sin tocar dominio; la salud de cada integración es visible y su falla es local.

## ETS relacionados
ETS-011 (22, 09, 10) · ETS-005 (mapeos como configuración) · ETS-008 (contratos de recepción) · ETS-012 (09, 10).

## Riesgos
- Lógica de negocio escondida en mapeos cada vez más "inteligentes" → los mapeos traducen campos; toda decisión es del dominio vía el comando normal.
- Integraciones espejo que escriben directo a tablas "por volumen" → regla 1; el volumen se resuelve con lotes de comandos, no saltándose el gobierno.

## Decisiones habilitadas
Integraciones por configuración, salud visible por tenant, reintentos seguros, terceros sin poder de veto sobre la disponibilidad.

## Decisiones bloqueadas
Protocolos y productos concretos de mensajería/iPaaS — tras el puerto Conector, con el stack.
