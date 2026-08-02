# 24 — Integraciones Externas en Runtime

> **DeltaOps — ESI-003 · v1.0** · Hablar con el mundo exterior sin dejar que el mundo exterior dicte el diseño.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Direcciones de integración

| Dirección | Mecanismo | Diseño |
|---|---|---|
| **Entrante (ellos nos llaman)** | La API pública versionada de ETS-008, con credencial de integración (doc 11) | No existe una "API de integraciones" aparte: es la misma API con las mismas reglas |
| **Saliente (nosotros llamamos)** | Adaptadores de salida detrás de puertos del Kernel | Este documento |
| **Notificaciones salientes (webhooks)** | Consumidores de eventos (doc 19) que entregan a destinos externos | Un consumidor más, con reintentos y bandeja muerta |

## 2. Adaptadores de salida

1. **Todo servicio externo queda detrás de un puerto** con nombre de negocio (notificador de correo, pasarela de firma, servicio de mapas…): el módulo depende del puerto; el adaptador conoce el proveedor. Cambiar de proveedor = cambiar el adaptador (ESI-002/13: ADR).
2. **Anticorrupción**: los tipos del proveedor no cruzan el puerto; el adaptador traduce a tipos del Kernel o del módulo. Prohibido que un DTO de proveedor viaje por el dominio.
3. **Defensas obligatorias en todo adaptador**: plazo máximo por llamada, reintentos con retroceso solo en operaciones idempotentes, y corte por umbral de fallos (circuit breaker) con estado visible en salud como dependencia no crítica (doc 18) y métricas (doc 17).
4. **Fuera de la transacción**: las llamadas salientes ocurren antes o después de la UoW, jamás dentro (doc 20, regla 2). El patrón normal para efectos externos es **por evento**: el caso de uso confirma, el consumidor llama afuera con reintentos.
5. **Credenciales de proveedores** por gestión de secretos (ESI-002/08); rotables sin despliegue de código (son plano despliegue, doc 08).

## 3. Webhooks salientes

1. Suscripciones administradas por tenant (qué eventos, a qué URL, con qué secreto de firma).
2. Entrega firmada, con reintentos, tope y bandeja muerta visibles al administrador del tenant.
3. El cuerpo del webhook es el contrato público del evento (ETS-008), versionado; jamás el sobre interno crudo.

## 4. Reglas normativas

1. **DeltaOps no espera en línea al exterior**: ninguna petición de usuario queda bloqueada por un tercero; lo externo es asíncrono o con plazo corto y degradación explícita (doc 15, regla 2).
2. **Credencial de integración entrante** con alcance limitado por permisos de catálogo (doc 12) y rotación administrada; una credencial por sistema integrado, jamás compartida.
3. **Todo intercambio externo se registra** (doc 16) con correlación, sin volcar cuerpos con datos sensibles.
4. **Sandbox de proveedores en DEV/QA** (ESI-002/09): jamás credenciales reales de terceros fuera de PROD; los fakes de puertos cubren las pruebas locales.
5. **Sin integraciones "temporales" fuera del patrón**: todo lo externo pasa por puerto + adaptador desde el primer día.

## Impacto sobre la implementación

El DGP de plataforma implementa la base de adaptador (plazos, reintentos, corte) y el runtime de webhooks; cada integración concreta es un adaptador con su ADR.

## Dependencias

Docs 08, 11, 12, 15-20; ETS-008 (API pública y contratos de evento); ESI-002/08, /09 y /13.

## Riesgos

- Terceros lentos degradando el sistema; mitigación: plazos, corte por umbral y asincronía por defecto (regla 1).
- Contratos de proveedor colándose en el dominio; mitigación: anticorrupción verificada en revisión.

## Decisiones habilitadas

- Añadir integraciones concretas como adaptadores con ADR, sin tocar módulos.
- Ofrecer webhooks salientes a tenants con garantías conocidas.

## Decisiones bloqueadas

- Prohibidas llamadas externas dentro de transacciones o bloqueando peticiones de usuario.
- Prohibidos tipos de proveedor cruzando puertos.
- Prohibida una segunda API "para integraciones".
