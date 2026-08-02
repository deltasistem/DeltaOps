# 22 — Background Processing Runtime

> **DeltaOps — ESI-003 · v1.0** · Workers, trabajos programados y procesos por lotes: el mismo rigor que una petición.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Tipos de trabajo en segundo plano

| Tipo | Disparo | Ejemplos |
|---|---|---|
| **Consumo de eventos** | Mensajes en bandejas (doc 19) | Reacciones entre módulos, proyecciones |
| **Trabajos programados** | Calendario declarado | Poda de sesiones (doc 14), vencimientos, recordatorios, generación de órdenes preventivas (dominio, en su módulo) |
| **Procesos por lotes** | Manual u orquestado | Recalculos, migraciones de datos operativas |
| **Relevo del outbox** | Continuo | Doc 19 |

Todos corren en **procesos worker** con el mismo bootstrap (doc 02), el mismo ciclo de vida (doc 03) y la tubería equivalente al middleware (doc 10 §4). El proceso API no ejecuta trabajo de fondo de negocio: **prohibidas las tareas "fire-and-forget" dentro del proceso API**, porque mueren con el proceso y escapan al drenaje.

## 2. Diseño de los trabajos programados

1. El calendario es **declarativo por módulo** (doc 06) y se consolida en el arranque del worker; sin cron externo editado a mano.
2. **Protección de ejecución única**: ante múltiples réplicas del worker, cada disparo adquiere una exclusiva por trabajo (bloqueo de asesoramiento en PostgreSQL, ESI-001); las réplicas que no la obtienen ceden en silencio.
3. Todo disparo genera un **registro de ejecución** (inicio, fin, resultado, elementos procesados) consultable y con métricas (doc 17).
4. Un trabajo que falla no se "pierde": queda el registro con error y la política de reintento declarada decide si se relanza o espera al siguiente disparo.

## 3. Reglas normativas

1. **Contexto siempre**: todo trabajo corre con contexto explícito (doc 09) — actor-sistema y, cuando procesa por tenant, el tenant correspondiente; los barridos multi-tenant iteran tenant por tenant, jamás "sin tenant" saltándose RLS.
2. **Idempotencia y reanudación**: todo trabajo por lotes avanza con cursor persistido y UoW por lote pequeño (doc 20, regla 4); repetir un lote es seguro.
3. **Puntos seguros de interrupción**: los trabajos declaran dónde pueden detenerse para el drenaje (doc 03); ninguno exige "terminar o corromper".
4. **La lógica vive en casos de uso**: el trabajo de fondo es un disparador; la lógica es una pieza de aplicación normal, probada como tal. Prohibida la lógica de negocio en el andamiaje del worker.
5. **Presupuesto declarado**: cada trabajo declara su duración esperada; superar el presupuesto genera alerta (doc 17), no un misterio.

## Impacto sobre la implementación

El DGP de plataforma implementa el andamiaje de workers, el registro de trabajos programados, la exclusiva de ejecución y los registros de ejecución. Los módulos declaran sus trabajos en su declaración (doc 06).

## Dependencias

Docs 02, 03, 06, 09, 10, 17, 19 y 20; ETS-009 (cursores, idempotencia); ESI-001 (bloqueos de asesoramiento).

## Riesgos

- Solapamiento de disparos largos con el siguiente disparo; mitigación: la exclusiva por trabajo impide concurrencia del mismo trabajo; el solapamiento persistente es alerta de presupuesto.
- Trabajos multi-tenant que degradan a tenants grandes; mitigación: iteración por tenant con presupuesto por tenant y métricas segmentadas.

## Decisiones habilitadas

- Escalar workers por réplicas sin dobles ejecuciones.
- Operar trabajos con registros de ejecución consultables.

## Decisiones bloqueadas

- Prohibido trabajo de fondo de negocio dentro del proceso API.
- Prohibidos trabajos sin contexto, sin cursor o sin punto seguro de interrupción.
- Prohibido cron externo como fuente de verdad del calendario.
