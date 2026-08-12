---
name: Mano de obra DGP-020.3
description: Lecciones de la fundación de mano de obra — integración cross-módulo por orquestación, dinero string-only de extremo a extremo, ownership backend del técnico, y el gap harness-vs-cableado real.
---

## No existe suscripción cross-módulo por outbox: integrar por orquestación en api-server
Cada módulo compone su propio `createPlatformRuntime`; el outbox PG es una tabla única y quien drena marca procesado GLOBALMENTE (un runtime ajeno pierde la carrera de claim o corrompe at-least-once). El patrón real del corpus para reaccionar a hechos de otro módulo es: (a) PULL vía queries públicas, o (b) orquestación en la capa de integración del api-server (invocar el comando del módulo destino tras el drain del origen, fail-safe: el hecho origen nunca se rompe por un fallo del derivado, que queda recuperable por comando idempotente + query de pendientes).
**Why:** DGP-020.3 intentó "eventHandlers sobre eventos de ordenes" y era inviable sin tocar el kernel congelado.
**How to apply:** ante "módulo B reacciona a evento de módulo A", NO registrar handlers de B para eventos de A; orquestar en api-server con comando idempotente por hecho (p.ej. por sesionId) + guarda durable.

## Dinero: string decimal canónica de extremo a extremo, la frontera es lo difícil
No basta calcular con BigInt: si el zod acepta `z.number()` o existe una rama `number`+`toFixed` en la normalización, un caller puede enviar un float que YA perdió precisión y se persiste "exacto pero equivocado". Regla: inputs públicos de dinero = `z.string().regex(RE_DINERO)` (sin signo/espacios/notación científica, escala acotada a la columna numeric), aritmética interna en enteros escalados BigInt (micros), SQL lee/escribe numeric como string, contrato API string con pattern alineado al zod, frontend formatea desde la cadena sin parseFloat. El tiempo jamás se redondea; solo el resultado final (half-up, 4 decimales).

## Ownership del técnico se impone en el backend, incluyendo consultas indirectas
"TECNICO solo ve lo suyo" debe cubrir también consultas por ordenId/activoId/sesionId (filtrar a filas propias o rechazar), no solo `identityId` explícito. Distinguir el principal restringido del contexto de servicio/admin por permisos (tiene `mias` sin permisos administrativos), no por rol textual. Fail-closed sin identidad canónica en el ctx.

## Los fakes de puertos ocultan mismatches de shape: testear el cableado real
Un contrato público puede devolver shapes distintos por criterio (objeto por id, arreglo por filtro). El Fake del puerto en tests devolvía el objeto de dominio directamente y el adaptador real solo aceptaba el arreglo ⇒ 42/42 verdes con la feature rota en producción (404 sistemático). Todo puerto de producción necesita al menos un test de integración contra la composición REAL del api-server (runtime + adaptador + query pública), y verificar que el test falla sin el fix.

## Suites paralelas contra la BD dev: nunca asumir estado de tenants semilla
`vitest` corre archivos en paralelo contra la misma BD; el seed demo reescribe los módulos del tenant plataforma compartido ⇒ un test que asuma entitlements del semilla flakea. Cada archivo de integración crea SU tenant/identidades únicos por corrida y los purga en afterAll.

## Otras decisiones de la fase (para consistencia futura)
Tarifa por CATEGORÍA con `sujetoTipo` evolutivo a IDENTIDAD sin romper snapshots; vigencia aplicada = tarifa vigente en `iniciadoAt` de la sesión (cruce de períodos = flag + GAP, sin prorrateo inventado); valoración VALORADA inmutable (revalorar solo SIN_TARIFA/SIN_RECURSO); SIN TARIFA ⇒ costo NULL, jamás $0.
