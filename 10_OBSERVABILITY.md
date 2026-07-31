# 10_OBSERVABILITY.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura de observabilidad: logs, métricas, tracing, health checks, auditoría, alertas y diagnóstico.
> Documento de diseño. No implementa nada.

---

## 1. Principio

La plataforma debe poder responder en minutos: *¿qué está pasando, desde cuándo, a quién afecta y por qué?* La observabilidad se diseña con el producto (cada módulo nace instrumentado) y distingue dos planos que no se mezclan:

- **Plano técnico** (este documento): logs, métricas, trazas — para operar la plataforma; retención corta/media; sin datos de negocio sensibles.
- **Plano de negocio** (Audit, ETS-006/06): los hechos y su historia — para el negocio y el cumplimiento; retención larga; es producto, no telemetría.

## 2. Logs

1. **Estructurados siempre** (campos, no prosa), con: marca de tiempo, módulo, severidad, tenant, identificador de correlación (§4), contexto mínimo del error.
2. **Sin datos sensibles:** ni datos personales, ni secretos, ni contenido de negocio Restringido — los logs referencian identidades técnicas; el detalle vive en Audit con su control de acceso (ETS-006/13).
3. **Niveles con propósito:** error = alguien debe actuar; advertencia = patrón a vigilar; info = hito operativo. El ruido se poda: un log que nadie leería no se emite.
4. **Centralizados y consultables** por módulo/tenant/correlación, con retención por nivel (errores más tiempo que info).

## 3. Métricas

| Familia | Ejemplos |
|---|---|
| **De plataforma** | Latencia y tasa de error por contrato público, profundidad de colas (entrada, outbox, sincronización), atraso de consumidores de eventos (frescura real de cada read model), uso de recursos |
| **De SaaS multi-tenant** | Consumo por tenant (peticiones, ingesta, almacenamiento, notificaciones), cuotas y vecindad (`05`) |
| **De contratos UX (ETS-004/11)** | Tiempos reales por flujo (U-01…U-10) medidos en producción: una regresión de presupuesto es un defecto |
| **De dominio operacional** | Sincronizaciones fallidas, elementos en bandejas de error (reglas, integraciones, ingesta), entregas de notificación fallidas, sugerencias IA (aceptación/latencia/costo) |
| **De arquitectura** | Acoplamiento por módulo (fan-in/out, síncrono vs. eventos), violaciones de frontera detectadas (`02`) |

Todas etiquetadas por tenant y módulo; los dashboards de operación priorizan **síntomas del usuario** (latencia de flujo, atraso de proyecciones) sobre causas internas (CPU).

## 4. Tracing (trazabilidad técnica)

1. **Identificador de correlación extremo a extremo:** nace en el borde (petición web/móvil/API/ingesta) y viaja por comandos, eventos (junto a la cadena causal de ETS-006/10), reglas disparadas, notificaciones y webhooks — una pregunta ("¿por qué tardó este cierre de OT?") se responde siguiendo un solo hilo.
2. **Trazas muestreadas** con sesgo hacia lo lento y lo fallido (lo sano se muestrea; lo anómalo se conserva).
3. **La cadena causal de negocio** (evento→regla→comando→evento) pertenece a Audit y es permanente; la traza técnica (tiempos por paso) es telemetría de retención corta. Se enlazan por el identificador de correlación.

## 5. Health checks

- **De vida** (¿el proceso responde?) y **de disposición** (¿puede atender? dependencias mínimas: base de datos, almacén de archivos, bus) para el balanceador y el despliegue (`15`).
- **De profundidad por módulo:** cada módulo reporta su salud específica (atraso de sus consumidores, su bandeja de errores, sus dependencias externas — proveedor de correo, modelo de IA) en un panel de salud interno.
- **Sondas sintéticas:** transacciones de prueba periódicas por flujo crítico (autenticar, capturar un hecho de prueba en tenant sintético, sincronizar) — detectan antes que el primer usuario.

## 6. Alertas

1. **Por síntoma, accionables, con dueño:** cada alerta dice qué se degradó para quién y enlaza su guía de diagnóstico; alerta sin acción posible = ruido que se elimina.
2. **Presupuestos de error y umbrales de atraso** (frescura de proyecciones, profundidad de colas, fallos de sincronización) como disparadores principales.
3. **Escalamiento operativo** con niveles (igual filosofía que el Workflow Engine, aplicada a la operación de la plataforma).
4. **Alertas de seguridad** (patrones anómalos de acceso, exportaciones masivas, fugas de cuota) van también al plano de auditoría (ETS-006/13).

## 7. Diagnóstico

- **Guías por síntoma** mantenidas junto al módulo (síntoma → hipótesis ordenadas → verificaciones → remedio), alimentadas por cada incidente real.
- **Herramientas de primera clase:** consulta de correlación extremo a extremo, inspección de bandejas de error con reproceso gobernado, comparación de frescura declarada vs. real, replay de consumidores como remedio estándar (ETS-006/11).
- **Post-incidente sin culpas, con evidencia:** cronología desde trazas y auditoría; las acciones correctivas entran al backlog del producto (una alerta ruidosa o una guía inexistente son defectos).
- **El administrador del tenant tiene su propio panel** (salud de sus integraciones, sus reglas, su sincronización móvil — ETS-005): la observabilidad del SaaS no es solo para el fabricante.
