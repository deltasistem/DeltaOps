# 09_EVENT_CONTRACTS.md

> **DeltaOps — ETS-008 · v1.0** · Contratos de eventos públicos: sobre, payload conceptual, versionado, compatibilidad, replay, outbox, orden e idempotencia.
> El catálogo de nombres es el de ETS-003/03 (extendido por módulo en ETS-008/03); la mecánica interna, ETS-007/04 §5.
> Documento de diseño. No implementa nada.

---

## 1. Qué es un evento público

Todo evento del catálogo (nombres en español, en pasado: `ActivoAsignado`, `OTCerrada`, `CombustibleRegistrado`…) es **contrato de primera clase**: lo consumen por igual las proyecciones internas, las reglas del tenant, los webhooks (`10`) y las integraciones — con el mismo sobre y las mismas garantías. El bus interno y el exterior comparten contrato; solo cambia el transporte (ETS-007/01).

## 2. Sobre del evento (estructura conceptual)

```text
EVENTO
├── Identidad
│   ├── idEvento              único, global, opaco
│   ├── tipo                  nombre del catálogo (OTCerrada)
│   └── versionEsquema        versión del payload de este tipo
├── Origen
│   ├── agregado              tipo + identificador (OT-2026-00431)
│   ├── secuenciaAgregado     posición en la historia del agregado
│   └── modulo                módulo emisor
├── Contexto
│   ├── tenant                siempre (los consumidores externos solo reciben el suyo)
│   ├── contextoOrganizacional  el contexto del hecho
│   ├── actor                 quién (humano/cuenta de servicio/dispositivo; delegación visible)
│   ├── canal                 web · móvil · API · IoT · regla
│   └── marcaIA               si el hecho fue asistido por IA (U-40)
├── Tiempo
│   ├── fechaNegocio          cuándo ocurrió
│   └── fechaRegistro         cuándo lo supo el sistema
├── Causalidad
│   ├── idCorrelacion         hilo extremo a extremo
│   ├── idComando             el comando que lo produjo
│   └── idEventoCausa         si lo causó otro evento (vía regla) — cadena completa
└── Payload                   los datos del hecho (§3)
```

## 3. Payload conceptual

- **Autocontenido:** lo necesario para reaccionar sin re-consultar (`04_MODULE_INTERACTIONS` ETS-007): identificadores, valores del hecho, estado resultante relevante, versiones de configuración usadas (qué plantilla/workflow gobernaba).
- **No es la entidad completa:** es el **hecho** (qué cambió y con qué datos); la representación actual se consulta por la API si hace falta.
- **En lenguaje ubicuo:** los campos del payload usan el diccionario ETS-003/08.
- Sin datos Restringido innecesarios: el payload lleva referencias cuando el dato es sensible; el consumidor autorizado lo resuelve por contrato (minimización, ETS-006/13).

## 4. Versionado y compatibilidad

1. **Versión de esquema por tipo de evento**, aditiva: agregar campos opcionales no cambia versión; cambios incompatibles = versión nueva del esquema **conviviendo** (los consumidores migran a su ritmo, N/N-1 mínimo).
2. **Tolerancia del lector obligatoria:** ignorar campos desconocidos; jamás depender de lo no documentado.
3. **Los eventos ya almacenados no se migran jamás** (append-only): los consumidores entienden versiones históricas o consumen a través de traductores de versión (upcasting conceptual) que la plataforma provee al leer.
4. Renombrar un tipo de evento está prohibido; un concepto nuevo es un tipo nuevo.

## 5. Replay

- Todo consumidor (proyección, mart, índice, webhook re-suscrito) puede **reproducir desde cualquier punto**: los eventos son la fuente replayable (ETS-006/11).
- El replay es operación normal y gobernada: se anuncia la frescura degradada durante la reconstrucción; la proyección nueva se construye en paralelo y se conmuta al alcanzar el presente (ETS-007/15 §3).
- Para consumidores externos (webhooks), la re-entrega histórica se solicita por rango y respeta el ámbito de la suscripción.

## 6. Outbox (garantía de publicación)

- Hecho y evento se persisten **en la misma transacción** (patrón de bandeja de salida): jamás un hecho sin evento ni un evento sin hecho (ETS-007/04 §5).
- El despachador publica al bus durable con reintentos hasta confirmar; la duplicación posible se resuelve por idempotencia del consumidor (§8).
- Lo que Audit conserva es este mismo flujo: el contrato de eventos ES la auditoría (ETS-006/06).

## 7. Orden

- **Garantizado por agregado** (`secuenciaAgregado`): los eventos de una OT llegan en su orden de historia.
- **No garantizado entre agregados:** los consumidores no asumen orden global; correlacionan por causalidad (idEventoCausa) y tiempo de negocio cuando importa.
- Los consumidores paralelos particionan por clave de agregado para preservar el orden que sí está garantizado (ETS-007/13 §2).

## 8. Idempotencia del consumo

- Entrega **al-menos-una-vez**: todo consumidor debe ser idempotente por `idEvento` (procesar dos veces = procesar una).
- Cada consumidor lleva **cursor propio** y bandeja de errores propia: un evento inprocesable se aparta con alerta, jamás se descarta ni bloquea el flujo en silencio (ETS-006/10).
- Los webhooks trasladan esta regla al suscriptor: el receptor debe deduplicar por `idEvento` (`10` §5).
