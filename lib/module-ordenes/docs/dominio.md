# Dominio: aggregate `OrdenTrabajo` y objetos de valor

## Aggregate raíz

`OrdenTrabajo` es la raíz del agregado. Se construye y evoluciona mediante
**funciones puras** (`crearOrden`, `editarOrden`, `actualizarAsignacion`,
`actualizarEjecucion`, `asociarFormulario`, `asociarChecklist`,
`agregarEvidencia`, `aplicarEstado`) que devuelven `Result` y un nuevo objeto
**congelado** (inmutabilidad): el estado previo nunca se muta.

Cada mutación produce un **evento de dominio autosuficiente** (`eventoDe`): el
`payload` contiene un snapshot completo (tenant, id, estado, versión, código,
timestamps) para que la proyección y la sincronización offline no dependan de
estado externo.

### Campos principales

- Identidad/clasificación: `id`, `tenantId`, `codigo` (VO), `titulo`, `tipo`,
  `prioridad`, `severidad`, `riesgoImpacto`.
- Ciclo de vida: `estado` (negocio), `workflow` (referencia a la instancia del
  motor), `version` (concurrencia optimista).
- Contexto: `activos` (referencias), `ubicacion`, `sla`, `fechas`,
  `diagnostico`, `costo`, `duracionEstimada`.
- Asignación y ejecución: `asignacion`, `ejecucion`.
- Documentación: `formulario` y `checklist` (referencias a plantillas ancladas a
  versión), `evidencias` (referencias a `platform.attachment`).

## Objetos de valor (Zod `.strict()` + `crear*`)

Todos validan con Zod en modo estricto y aplican reglas de dominio antes de
congelar el resultado:

- `CodigoOrden` — código consecutivo (prefijo, secuencia ≥ 1).
- `Sla` — respuesta ≤ resolución.
- `Duracion` — minutos ≥ 0.
- `Costo` — monto ≥ 0 con moneda no vacía.
- `RiesgoImpacto` — puntaje acotado 0–100.
- `ReferenciaActivo` — referencia a un activo (DGP-008) con rol.
- `Ubicacion` — ubicación con etiqueta.
- `ReferenciaPlantilla` — plantilla de Dynamic Forms anclada a `version`, con
  `clase` (formulario/checklist) y anclaje opcional de `respuesta { respuestaId,
  version }`.
- `ReferenciaWorkflow` — definición/instancia del Workflow Engine.
- `Evidencia` — adjunto con `hashSha256` (64 hex) y metadatos.
- `Diagnostico` — causa/acción (opcionales).
- `Fechas` — inicio ≤ finalización.

## Invariantes clave

- Título no vacío y ≤ `max-longitud-titulo` (config del tenant).
- Estados finales (`CERRADA`, `CANCELADA`) son inmutables (ver `policies.md`).
- Las transiciones **no** se calculan en el aggregate: las gobierna el Workflow
  Engine. `aplicarEstado` solo **refleja** el estado que el motor decidió y sella
  las marcas de tiempo del ciclo (inicio, finalización, cierre).
- `agregarEvidencia` es idempotente por `attachmentId`.
- El campo `estado` admite estados **canónicos** y estados **extra del tenant**
  (`EstadoOrdenEfectivo = EstadoOrden | string`), sin degradar a `BORRADOR`
  (ver `maquina-estados.md`).

## Puertos y fakes (009.1) · adaptadores en 009.2

Esta subfase entrega **solo el dominio**. La persistencia y los colaboradores
INDISPENSABLES se declaran como **puertos** (`domain/ports.ts`):
`OrdenRepository` (fuente de verdad de escritura + lectura mínima del aggregate),
`CatalogoPort` (catálogos + `extensionMaquina` para estados/transiciones extra),
`ConsecutivoPort`, `ReciboPort` (idempotencia offline) y `PlantillasPort` (hacia
Dynamic Forms). Los **adaptadores concretos** (PostgreSQL / Record Store) y la
composición de runtime de producción llegan en **DGP-009.2**.

El **read-side** (read models materializados, proyección CQRS, **bitácora
durable**, dashboard, indexación de búsqueda) NO forma parte de 009.1: es
infraestructura de lectura de **DGP-009.2**. La única lectura expuesta es
`modulo.ordenes.detalle`, que devuelve el **aggregate** del repositorio.

Para pruebas se proveen **fakes en memoria** (`infrastructure/fakes.ts`) y un
**harness de prueba** (`__tests__/harness.ts`) que monta los motores reales de
Workflow y Dynamic Forms como `extraServices`.
