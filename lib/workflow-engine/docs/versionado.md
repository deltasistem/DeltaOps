# Versionado de definiciones y compatibilidad N/N-1

> DGP-007 · Workflow Designer Runtime. Las definiciones de workflow son **datos
> persistidos** (recordType `definicion-workflow`), versionados e inmutables una
> vez publicados.

## Definiciones como datos

`registro.ts` genera comandos de diseño (permiso `…disenar`):

| Comando | Efecto |
|---|---|
| `…definicion.publicar` | Valida (estructural + vocabulario) y persiste una **nueva versión N** (por `clave`), estado `publicada`. **Inmutable**. Idempotente por `id` de cliente. |
| `…definicion.activar` | Marca una versión como `activa` y **desactiva** la activa anterior de la misma `clave` (misma UoW). |
| `…definicion.desactivar` | Pasa la activa a `inactiva`. |
| `…definicion.migrar` | Re-mapea el **estado actual** de una instancia al **estado equivalente** de una versión destino (`MapaMigracion`). |

Consultas (permiso `…leer`): `…definicion.obtener | listar | activa`.

## Versión N incremental

Cada `publicar` calcula `versionN = max(versionN de la misma clave) + 1`. La
versión es inmutable: para cambiar el workflow se publica una versión nueva.

## Compatibilidad N/N-1

- Cada **instancia** recuerda su versión en `data._versionDefinicion`.
- El **motor** resuelve la definición **por versión** para transicionar: una
  instancia en **N-1 sigue transicionando con su definición** (no se rompe por
  activar N).
- Las **instancias nuevas** usan la definición **activa** (N).

```ts
// Resolutor por defecto (inyectado en el motor):
crearResolverDefinicion(SERVICIO);
// (deps, tenantId, versionN?) => { def, version }
//   versionN definido -> versión exacta (compatibilidad N-1)
//   versionN ausente   -> definición ACTIVA del tenant
```

## Migración explícita de instancias

Cuando se quiere **mover** una instancia N-1 a N, se declara un `MapaMigracion`
`{ estadoOrigen → estadoDestino }` y se invoca `…definicion.migrar`:

```ts
await commands.execute(ctx, `${SERVICIO}.definicion.migrar`, {
  instanciaId,
  version,                    // versión optimista de la instancia
  versionDestino: 2,
  mapa: { enviada: "enRevision" },   // estado N-1 -> estado N
});
```

- El estado destino **debe existir** en la versión destino (si no, `conflict`).
- Actualiza `data._versionDefinicion` a la versión destino y emite
  `…definicion.migrada` (payload con `estadoAnterior` y `estado`).
- Estados sin entrada en el mapa se conservan (si son válidos en destino).

## Validación estructural al publicar (`validarWorkflow`)

Reutiliza el patrón de `andamiaje/validacion.ts` del Business Foundation:

- Nombres/comandos/estados **neutros** (camelCase/kebab) y **sin vocabulario de
  negocio** (`PALABRAS_RESERVADAS_NEGOCIO`).
- Exactamente **1 estado inicial**; sin estados duplicados.
- Transiciones **coherentes** (estados existentes; sin ambigüedad `de+comando`).
- Todos los estados **alcanzables** desde el inicial (BFS).
- Estados no-finales con **salida** (transición, suspensión o cancelación).
- Condiciones válidas (Zod del motor de condiciones) y aprobaciones
  referenciadas existentes.
