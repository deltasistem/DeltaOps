# 09 — Gestión de Contexto de Ejecución

> **DeltaOps — ESI-003 · v1.0** · Quién, para qué tenant, con qué permisos y bajo qué correlación: el hilo que atraviesa todo.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Qué es el contexto de ejecución

El contexto de ejecución es el objeto inmutable que acompaña a toda unidad de trabajo (petición HTTP, mensaje de bandeja, trabajo programado) desde el borde hasta la persistencia. Su contrato vive en el Kernel (doc 04); su construcción, en la plataforma.

| Campo | Contenido | Fuente |
|---|---|---|
| **Tenant** | Identificador del tenant activo | Autenticación (doc 11); jamás del cliente sin verificar |
| **Actor** | Usuario humano, agente de integración o el propio sistema | Autenticación / origen del trabajo |
| **Permisos efectivos** | Resultado ya resuelto para el actor en el tenant | Doc 13 |
| **Correlación** | Identificador de correlación y de causa (qué evento/petición originó esto) | Borde o mensaje origen |
| **Fechas** | fechaRegistro (reloj del sistema) y fechaNegocio cuando aplica | Reloj inyectado (Kernel) |
| **Idempotencia** | `clave_idempotencia` cuando la operación la porta | Petición / mensaje (ETS-009) |

## 2. Construcción y propagación

1. **Se construye una sola vez por unidad de trabajo**, en el borde: el middleware (doc 10) para HTTP, el consumidor base (doc 19/22) para mensajes.
2. **Es inmutable**: nadie enriquece ni recorta el contexto en tránsito. Si un caso de uso necesita actuar "como sistema", se construye un contexto de sistema explícito y auditado, no se muta el existente.
3. **Se propaga por parámetro**, no por variable global ni almacenamiento mágico por hilo/tarea. El almacenamiento contextual de la librería estándar solo puede usarse dentro de la plataforma para enriquecer logs (doc 16), nunca como canal de datos de negocio.
4. **Cruza la frontera asíncrona**: al emitir un evento, la correlación y el tenant viajan en el sobre del evento (ETS-008); el consumidor reconstruye un contexto nuevo a partir del sobre.
5. **Llega a la persistencia**: la UoW (doc 20) usa el tenant del contexto para fijar la variable de sesión de RLS — la primera muralla de las dos de ETS-009. El módulo nunca escribe cláusulas de tenant a mano.

## 3. Reglas normativas

1. **Sin contexto no hay ejecución**: ninguna pieza de aplicación acepta trabajar sin contexto; los constructores lo exigen.
2. **El tenant del contexto es el único tenant**: prohibido aceptar identificadores de tenant en payloads como fuente de verdad.
3. **Contexto de sistema explícito**: los trabajos internos usan un actor-sistema con permisos definidos por catálogo, jamás "sin permisos" ni "con todos".
4. **La correlación nunca se pierde**: toda pieza que origine trabajo nuevo (evento, trabajo en background) copia la correlación al nuevo sobre.
5. **El contexto no es un cajón**: prohibido añadirle campos de conveniencia; cada campo nuevo exige revisión de arquitectura.

## Impacto sobre la implementación

El contrato del contexto entra en el DGP del Kernel; su construcción en los DGP de middleware y runtimes. Toda plantilla de caso de uso (T01) lo recibe como primer parámetro conceptual.

## Dependencias

Docs 04, 10, 11, 13, 16, 19 y 20; ETS-008 (sobre de eventos), ETS-009 (RLS e idempotencia).

## Riesgos

- Fuga de contexto entre peticiones concurrentes por capturas indebidas; mitigación: ámbito petición estricto (doc 05) y pruebas de concurrencia.
- Contextos de sistema usados como comodín para saltarse permisos; mitigación: actor-sistema auditado con permisos de catálogo y alerta de uso anómalo.

## Decisiones habilitadas

- Diseñar RLS de sesión, logging correlacionado y auditoría sobre un único objeto.
- Reconstrucción de contexto en consumidores a partir del sobre del evento.

## Decisiones bloqueadas

- Prohibidas variables globales o almacenamiento por hilo como canal de negocio.
- Prohibida la mutación del contexto en tránsito.
- Prohibido derivar el tenant de cualquier fuente distinta de la autenticación o el sobre verificado.
