# 14 — Integration Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de integraciones: la infraestructura común que hace operables los cuatro patrones de integración de los módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y reparto

ESI-005/19 definió los cuatro patrones (ingesta, publicación, consulta saliente, exportación por lotes) y sus reglas. El reparto:

| Es del módulo | Es del Integration Service |
|---|---|
| El puerto con lenguaje del dominio y el adaptador concreto (la traducción) | El chasis común: registro de integraciones, credenciales, bandeja de rechazos, reintentos, monitoreo, pausado |
| Qué significa cada dato externo | Que el flujo llegue, se rastree y no se pierda |

El servicio evita que cada módulo reconstruya la fontanería de integración; **no** centraliza la semántica (eso violaría la neutralidad, doc 01 §2.1).

| Concepto | Definición |
|---|---|
| **Integración registrada** | Instancia operativa: sistema externo, módulo dueño, patrón, credenciales (por la plataforma de secretos), estado (activa/pausada/degradada), dueño operativo |
| **Bandeja de rechazos** | El destino de lo malformado (ESI-005/19 §3.3): elemento crudo + diagnóstico + acciones (reprocesar, descartar con motivo) |
| **Monitor** | Salud por integración: volumen, errores, latencia externa, edad de rechazos — con alertas accionables |

## 2. Reglas

1. **Toda integración externa pasa por el registro**: las credenciales, el estado y el monitoreo viven aquí; un adaptador de módulo no registrado no llega a producción (la puerta lo verifica contra la declaración, ESI-005/19 §3.1).
2. **Pausable sin despliegue**: una integración degradada se pausa operativamente; la ingesta acumula con límites declarados, la publicación retiene en bandeja (ESI-003/21); reanudar converge.
3. **Los rechazos son visibles y accionables**: la bandeja tiene dueño operativo por integración y el KPI de edad de rechazos alerta — los datos externos perdidos en silencio son el fallo clásico que este servicio existe para impedir.
4. **Reprocesar es seguro**: la idempotencia bidireccional de ESI-005/19 §3.2 hace el reproceso de rechazos un botón, no una operación de riesgo.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `integraciones` (administración por tenant cuando la integración es del tenant; muchas son de plataforma/implantación).
- **Eventos**: "Integración Pausada", "Integración Reanudada", "Rechazo Registrado" (v1) — para notificaciones operativas.
- **Contratos**: registro de integraciones (declarativo); consulta de salud y rechazos (cursor); acciones de pausa/reanudación/reproceso.
- **Configuración**: límites de acumulación, umbrales de degradación, ventanas de lotes, por integración.
- **KPIs**: volumen por integración, tasa y edad de rechazos, disponibilidad del sistema externo observada, latencia de ingesta extremo a extremo.
- **Permisos**: `INTEGRACIONES.SALUD.CONSULTAR`, `INTEGRACIONES.OPERAR` (pausa/reproceso), `INTEGRACIONES.ADMINISTRAR`.
- **Consumidores**: Compras (ERP/facturación), Combustible (telemetría de surtidores), Inventario (códigos/ERP); todo módulo con integraciones declaradas.

## Impacto sobre la implementación

DGP propio (registro, bandeja, monitor, operación); los adaptadores concretos siguen en los módulos (ESI-005/19), ahora montados sobre el chasis común.

## Dependencias

ESI-005/19; ESI-003/21-22 y /24; docs 03 y 17-20; ETS-011/012.

## Riesgos

- La tentación de mover semántica al servicio ("ya que está, que transforme"); mitigación: la frontera §1 es normativa — el servicio toca sobres, no significados.

## Decisiones habilitadas

- Operación de integraciones con visibilidad y control uniformes.
- Implantaciones con integraciones auditables desde el día uno.

## Decisiones bloqueadas

- Prohibidas integraciones en producción fuera del registro.
- Prohibida lógica de dominio (mapeos semánticos) dentro del servicio.
- Prohibido el descarte silencioso de datos externos malformados.

## Reusable Pattern

Registro + bandeja de rechazos con dueño + pausado operativo + reproceso seguro: el chasis de toda integración presente y futura; los módulos solo aportan traducción.

## Anti-Patterns

- El ESB resucitado: orquestación y transformación de negocio centralizadas.
- Rechazos como logs (invisibles, sin acción).
- Credenciales de integración administradas por cada módulo.

## Knowledge Graph

- **ETS que consume**: ETS-011 (fronteras), ETS-012 (sistemas del entorno).
- **ESI que consume**: ESI-005/19; ESI-003/21, /22, /24.
- **DGP que originará**: DGP-Integraciones (chasis); los adaptadores viven en los DGP-módulo correspondientes.
- **ADR relacionados**: ADR de chasis-sin-semántica (§1); ADR de anticorrupción (ESI-003/24).
- **Módulos que reutilizarán este patrón**: Compras, Combustible e Inventario en v1; cualquier módulo con sistemas externos después.
