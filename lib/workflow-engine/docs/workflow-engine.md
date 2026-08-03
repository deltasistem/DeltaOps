# Workflow Engine (`@workspace/workflow-engine`)

> DGP-007 · Workflow & Dynamic Forms Engine — motor de workflow **oficial**,
> **neutro** (cero vocabulario de negocio) y reutilizable. Se apoya
> **estrictamente** en el Kernel (DGP-002), la Shared Platform (DGP-003) y el
> Business Foundation (DGP-006). No introduce patrones arquitectónicos nuevos.

## Concepto

Un **workflow** se describe **como datos** con una `DefinicionWorkflow`:
estados (inicial/finales/suspendibles), transiciones (con guardas de permiso,
capacidad, policy, precondiciones/postcondiciones y acciones declarativas),
aprobaciones y operaciones estándar (cancelar/reabrir/suspender/reanudar).

El motor genera, a partir de esa definición, los **comandos** y **consultas**
de un `PlatformServiceDefinition` que se monta vía `extraServices` de
`createPlatformRuntime`. Todo pasa por el pipeline del Kernel (autorización con
`AuthorizationRuntime`, validación Zod, UoW, outbox, auditoría) y por
`RecordStorePort` (multitenancy + RLS). No hay SQL propio.

### Piezas

| Archivo | Responsabilidad |
|---|---|
| `definicion.ts` | `DefinicionWorkflow` declarativa; proyección a la máquina de estados neutra del Business Foundation (`maquinaDeWorkflow`). |
| `condiciones.ts` | Motor de condiciones JSON tipado y combinable (`y`/`o`/`no`), validado con Zod. Reutilizable con Dynamic Forms. |
| `instancia.ts` | Runtime **puro** de la instancia (resolución y aplicación de transiciones, pre/postcondiciones, metadatos estándar). |
| `motor.ts` | Transition Engine: fábrica de comandos `instancia.*` (iniciar, transicionar, estándar, aprobar/rechazar/delegar, expirarAprobaciones). |
| `registro.ts` | Workflow Designer Runtime: definiciones **como datos** (publicar/activar/desactivar/migrar) + resolutor por versión. |
| `aprobaciones.ts` | Approval Runtime: modos, delegación, vencimiento, escalamiento, política `alVencer`. La aprobación GOBIERNA la transición (gate). |
| `sincronizacion.ts` | Offline + Sync Runtime: **orquestación** `procesarCola` (una UoW por operación); conflictos, replay. **No** es comando del Kernel. |
| `validacion.ts` | Validación estructural completa (alcanzabilidad, coherencia, vocabulario prohibido). |
| `modulo.ts` | `crearMotorWorkflow(opciones)` → `PlatformServiceDefinition` con contrato completo. |
| `runtime.ts` | `createWorkflowRuntime` (Fake u PostgreSQL, como `module-reference`). |

## API pública principal

```ts
import {
  crearMotorWorkflow,     // OpcionesMotorWorkflow -> PlatformServiceDefinition
  createWorkflowRuntime,  // monta Kernel + Plataforma + motor
  nombresInstancia,       // nombres canónicos de comandos/eventos de instancia
  validarWorkflow,        // validación estructural
  evaluarCondicion,       // motor de condiciones
} from "@workspace/workflow-engine";
```

### Nombres de comandos generados (servicio `flujo.demo`)

- Diseño: `flujo.demo.definicion.publicar | activar | desactivar | migrar`
- Diseño (consultas): `flujo.demo.definicion.obtener | listar | activa`
- Instancia: `flujo.demo.instancia.iniciar | transicionar | cancelar | reabrir | suspender | reanudar`
- Aprobación: `flujo.demo.instancia.aprobar | rechazar | delegar | expirarAprobaciones`
- Instancia (consultas): `flujo.demo.instancia.obtener | listar`
- Sync: **no** hay comando; se usa `runtime.sincronizar(ctx, operaciones)` /
  `procesarCola(runtime, ctx, operaciones)` (orquestación, una UoW por op).

Eventos emitidos: `…instancia.iniciada | transicionada | aprobacion-solicitada
| aprobacion-resuelta | aprobacion-escalada`, `…definicion.publicada | activada
| migrada`. Todos con **payload autosuficiente** (proyección solo-desde-payload,
dedupe por `eventId`).

## Ejemplo neutro completo — "proceso de solicitud genérica"

```ts
import { createWorkflowRuntime, nombresInstancia } from "@workspace/workflow-engine";

const SERVICIO = "flujo.demo";
const rt = createWorkflowRuntime({ servicio: SERVICIO });
const n = nombresInstancia(SERVICIO);

const definicion = {
  clave: "solicitud-generica",
  etiqueta: "Proceso de solicitud genérica",
  estados: [
    { nombre: "borrador", inicial: true },
    { nombre: "enviada" },
    { nombre: "enRevision", suspendible: true },
    { nombre: "aprobada", final: true },
    { nombre: "rechazada", final: true },
  ],
  transiciones: [
    { de: "borrador", a: "enviada", comando: "enviar",
      precondiciones: [{ campo: "titulo", operador: "existe" }],
      acciones: [{ tipo: "asignar", a: "solicitante" }] },
    { de: "enviada", a: "enRevision", comando: "tomar", permiso: "flujo.demo.revisar" },
    // La aprobación inline GOBIERNA esta transición (gate): "resolver" NO cambia
    // estado hasta que "aprobar" resuelve el modo; "rechazar" mueve a rechazoA.
    { de: "enRevision", a: "aprobada", comando: "resolver", permiso: "flujo.demo.revisar",
      rechazoA: "rechazada",
      aprobacion: { nombre: "revisionFinal", modo: "individual",
        permiso: "flujo.demo.revisar", aprobadores: ["revisor"] } },
  ],
};

// 1) Publicar y activar la definición (versión 1).
const defId = crypto.randomUUID();
await rt.platform.kernel.commands.execute(ctx, `${SERVICIO}.definicion.publicar`, { id: defId, definicion });
await rt.platform.kernel.commands.execute(ctx, `${SERVICIO}.definicion.activar`, { id: defId, version: 1 });

// 2) Iniciar una instancia (crear exige id de cliente — Offline First).
const inst = crypto.randomUUID();
await rt.platform.kernel.commands.execute(ctx, n.iniciar, { id: inst, data: { titulo: "Solicitud demo" } });

// 3) Transicionar.
await rt.platform.kernel.commands.execute(ctx, n.transicionar, { id: inst, version: 1, comando: "enviar" });
```

Ver además: `aprobaciones.md`, `versionado.md`, `sincronizacion.md`.

## Reglas duras respetadas (DGP-006/007)

- **Cero vocabulario de negocio**: ejemplos y validación lo garantizan
  (`validarWorkflow` reutiliza `PALABRAS_RESERVADAS_NEGOCIO`).
- **Todo por el Kernel**: autorización, Zod, UoW, outbox y auditoría. Sin SQL
  propio; solo `RecordStorePort` (multitenancy + RLS).
- **Proyecciones idempotentes** solo-desde-payload; **mutaciones multi-registro
  en una UoW** (p. ej. la acción `notificar` inserta la notificación en la misma
  UoW; nunca hay comandos anidados).
- **Offline First**: `opId` en todo comando, crear exige `id` de cliente,
  recibos durables tenant-scoped.
