# 13 — AI Platform Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de plataforma de IA: la puerta única y gobernada hacia los proveedores de modelos, para todos los módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito

ESI-005/20 fijó las reglas de la IA en módulos (asistiva, tras puertos, marcada, confinada); este servicio es **la implementación única de esos puertos**: el adaptador de proveedores, el gobierno de uso, el registro de inferencias. Ningún módulo habla con un proveedor de IA; todos hablan con este servicio.

| Concepto | Definición |
|---|---|
| **Función de IA registrada** | La instancia de un uso del catálogo permitido (sugerencia/priorización/extracción, ESI-005/20 §2): módulo dueño, contrato tipado de entrada/salida, plantilla de contexto, capacidad asociada |
| **Inferencia** | Ejecución registrada: función, versión de modelo, tenant, entrada resumida según clasificación, salida, latencia, costo |
| **Proveedor** | Adaptador sustituible (ETS-011); la asignación función→modelo/proveedor es configuración de plataforma, invisible para módulos |

## 2. Reglas

1. **Contratos tipados, no prompts libres**: los módulos envían entradas estructuradas del contrato de su función; la construcción del prompt es del servicio (plantillas versionadas). Sin "cajón de texto al modelo" desde módulos.
2. **Clasificación aplicada a la entrada** (ESI-005/15 y /20 §3.4): los campos sensibles se excluyen o enmascaran según la clasificación declarada; contexto de un solo tenant por inferencia, siempre.
3. **Registro total**: toda inferencia queda registrada con modelo/versión — el sustrato de la trazabilidad que ESI-005/20 §3.2 exige a las salidas marcadas.
4. **Presupuestos por tenant y función**: cuotas de uso y costo con corte explícito (la denegación por cuota es un error canónico distinguible, no una degradación silenciosa).
5. **Degradación limpia heredada**: proveedor caído → las funciones fallan explícito y los módulos operan sin asistencia (ESI-005/20 §3.6); el servicio publica su salud.
6. **Evaluación antes de promover**: cambiar el modelo de una función exige pasar su batería de evaluación (casos de referencia con criterios de aceptación); los cambios de modelo son releases, no configuración caliente.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: las funciones de IA se agrupan bajo capacidades **de los módulos dueños** (ESI-005/20 §3.5); el servicio publica `plataforma_ia` como capacidad administrativa del tenant (ver uso/costos).
- **Eventos**: "Inferencia Completada" (v1, interno para métricas); las señales de negocio (anomalías detectadas) las emiten los módulos dueños.
- **Contratos**: ejecutar función registrada; registro de funciones (módulo, contrato, plantilla); consulta de uso por tenant.
- **Configuración**: asignación función→proveedor/modelo (plataforma); cuotas y presupuestos por tenant; exclusiones de datos adicionales del tenant.
- **KPIs**: inferencias por función/tenant, latencia, costo, tasa de aceptación de sugerencias (reportada por los módulos dueños — el KPI de utilidad real).
- **Permisos**: `PLATAFORMA_IA.USO.CONSULTAR`, `PLATAFORMA_IA.FUNCIONES.ADMINISTRAR` (plataforma); el uso funcional lo gobiernan los permisos del módulo dueño.
- **Consumidores**: OT (diagnóstico, sugerencia de repuestos), Combustible (anomalías), SST (clasificación de incidentes); extracción/resumen como funciones transversales.

## Impacto sobre la implementación

DGP propio (adaptadores de proveedor, registro, plantillas, evaluación); los módulos registran funciones con contrato — sin SDKs de proveedores en módulos.

## Dependencias

ESI-005/15, /17 y /20; ETS-009/011; docs 17-20; ESI-002/27 (ampliaciones del catálogo de usos).

## Riesgos

- Costo de inferencia sin gobierno; mitigación: presupuestos §2.4 con denegación explícita y KPIs de costo por función.
- Evaluaciones superficiales al cambiar modelos; mitigación: baterías de evaluación §2.6 como requisito de release.

## Decisiones habilitadas

- Sustituir proveedores/modelos sin tocar módulos.
- Gobierno central de datos enviados, costos y calidad de IA.

## Decisiones bloqueadas

- Prohibidas llamadas directas de módulos a proveedores de IA.
- Prohibidos prompts libres desde módulos.
- Prohibido cambiar modelos en producción sin batería de evaluación.

## Reusable Pattern

Función registrada con contrato + plantilla versionada + registro de inferencias + batería de evaluación: el patrón de toda capacidad de IA presente y futura.

## Anti-Patterns

- El servicio "pass-through" que reenvía texto sin contratos ni registro.
- Ajustar prompts en caliente por tenant (variabilidad programática, frontera ESI-005/09 §2.3).
- Medir éxito por inferencias ejecutadas en vez de sugerencias aceptadas.

## Knowledge Graph

- **ETS que consume**: ETS-009 (gobierno de datos), ETS-011 (adaptadores).
- **ESI que consume**: ESI-005/15, /17, /20; ESI-002/27.
- **DGP que originará**: DGP-PlataformaIA; registro de funciones en los DGP-módulo que declaren IA.
- **ADR relacionados**: ADR de IA asistiva (ESI-005/20 §1); ADR de contratos-no-prompts (§2.1).
- **Módulos que reutilizarán este patrón**: OT, Combustible y SST en v1; el catálogo de usos gobierna el crecimiento.
