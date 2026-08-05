# Ciclo de vida declarativo (máquina de estados)

## Principio: el Workflow Engine es la fuente de verdad

El mandato exige que **toda** transición se ejecute mediante el Workflow Engine
(DGP-007) y **nunca** con lógica de transición propia. Por eso el ciclo de vida
se declara como **datos** (`DEFINICION_WORKFLOW_ORDEN: DefinicionWorkflow`) y se
ejecuta a través de los comandos de instancia del motor. No hay `switch`/`if` de
transición en el dominio.

## Estados de negocio (públicos del módulo)

```
BORRADOR → ABIERTA → PLANIFICADA → ASIGNADA → EN_EJECUCION ⇄ PAUSADA
EN_EJECUCION → EN_VALIDACION → CERRADA (final)
(cualquier estado no final) → CANCELADA (final)
```

- Inicial: `BORRADOR`. Finales: `CERRADA`, `CANCELADA`.

## Neutralidad del motor y mapeo

El motor de workflow es **neutro** (DGP-006): rechaza vocabulario de negocio
(`orden`, `activo`, …) y exige `camelCase` en estados/comandos y `kebab-case` en
la clave. Por ello la definición usa identificadores **neutros** y el módulo los
traduce a los estados de negocio:

| Estado motor (neutro) | Estado negocio |
|-----------------------|----------------|
| `borrador`            | `BORRADOR`     |
| `abierto`             | `ABIERTA`      |
| `planificado`         | `PLANIFICADA`  |
| `asignado`            | `ASIGNADA`     |
| `enEjecucion`         | `EN_EJECUCION` |
| `pausado`             | `PAUSADA`      |
| `enValidacion`        | `EN_VALIDACION`|
| `cerrado`             | `CERRADA`      |
| `cancelado`           | `CANCELADA`    |

Clave de la definición: `ciclo-item` (neutra). Traducción: `estadoDeNegocio()`.

### Mapeo dinámico y SIN fallback silencioso

`estadoDeNegocio(estadoMotor, estadosTenant)` devuelve un `Result`:

- Estado **canónico** ⇒ nombre de negocio del mapa base (tabla anterior).
- Estado **extra del tenant** (declarado en el catálogo `estados`, nombres
  neutros del motor) ⇒ nombre derivado en `SCREAMING_SNAKE_CASE`
  (`enEspera → EN_ESPERA`).
- Estado **no declarado** ⇒ **error explícito** (`KernelErrors.validation`).
  **Nunca** se degrada a `BORRADOR`. Esto evita que un estado real del tenant
  (p. ej. `enEspera`) se refleje erróneamente como `BORRADOR` en el aggregate.

El conjunto de estados extra se resuelve en tiempo de ejecución desde el puerto
de catálogos (`CatalogoPort.estadosDeclarados`), que lee el catálogo `estados`
**vigente** del tenant. El mapeo motor→negocio se construye, por tanto, a partir
de la definición vigente, no de una tabla fija en código.

## Comandos de transición

`abrir`, `planificar`, `asignar`, `iniciar`, `pausar`, `reanudarEjecucion`,
`enviarValidacion`, `devolver`, `cerrar`, y la operación estándar `cancelar` del
motor, **más** los comandos que el tenant declare en su extensión (ver abajo). La
validación `validarWorkflow()` del motor acepta la definición base y la compuesta.

## Extensión por tenant (OPERABLE, no solo traducible)

Un tenant puede **ampliar** el ciclo con estados y transiciones propios de forma
**DECLARATIVA** (datos, cero código) y que sean **realmente alcanzables** por
instancias del motor.

### Contrato configuración → definición activa

1. **Declaración (datos).** El tenant declara:
   - el/los estado(s) extra en el catálogo `estados` (nombres NEUTROS del motor,
     p. ej. `enEspera`), y
   - la **extensión de la máquina** vía el puerto `CatalogoPort.extensionMaquina`:
     `{ estados: [{nombre, etiqueta?, final?}], transiciones: [{de, comando, hacia, permiso?}] }`.

2. **Composición + validación.** `componerDefinicion(extension)` fusiona el
   ciclo **base** con la extensión y valida la definición resultante con el motor
   (`validarWorkflow`): estados alcanzables, comandos/estados neutros camelCase,
   sin colisión con comandos base, sin redeclaración de estados base.

3. **Publicación/activación idempotente.** `asegurarWorkflow` deriva el `id` de
   definición incluyendo la **firma** de la extensión (`firmaExtension`): misma
   extensión ⇒ mismo `id` ⇒ publicar es idempotente; extensión distinta ⇒ `id`
   nuevo ⇒ se publica una **nueva versión N** y se **activa**. El motor versiona
   (N/N-1) y valida en cada publicación. La activación usa la versión OPTIMISTA
   del registro de definición (leída con `definicion.obtener`), no la versión N,
   para no chocar con la concurrencia cuando N > 1.

   **`firmaExtension` es un hash (FNV-1a) de una serialización CANÓNICA y
   COMPLETA de `ExtensionMaquina`**: incluye TODOS los campos semánticos de cada
   estado (`nombre`, `etiqueta`, `final`) y de cada transición (`de`, `comando`,
   `hacia` y, crítico, **`permiso`**). La serialización ordena las claves de cada
   objeto y ORDENA ambas listas por su forma canónica, de modo que la firma es
   independiente del orden de inserción de propiedades y de elementos. Como
   consecuencia, cambiar el **permiso** (o la etiqueta, o `final`) de una
   transición/estado extendido **produce una firma distinta** ⇒ nueva definición
   publicada y **activada** ⇒ el motor aplica el permiso NUEVO en las instancias
   creadas a partir de entonces (nunca retiene la autorización anterior). Pruebas:
   `firmaExtension · serialización canónica COMPLETA` (dominio) y "cambiar el
   PERMISO de una transición extendida republica/activa y el motor aplica el
   permiso nuevo" (integración, con enforcement verificado: operador sin el
   permiso nuevo rechazado, con él aceptado).

4. **Transiciones extendidas operables.** El comando `modulo.ordenes.transicionar`
   acepta cualquier comando **declarado** (incluidos los extendidos) autorizado
   por las policies del módulo (`modulo.ordenes.operar`). Así una instancia real
   ALCANZA `enEspera` con `transicionar {comando:"ponerEnEspera"}` y el aggregate
   refleja `EN_ESPERA`.

### Coherencia catálogo ↔ definición (error explícito)

`asegurarWorkflow` verifica que el conjunto de estados extra del catálogo
`estados` y el de la definición **compuesta activa** COINCIDAN exactamente:

- Estado en el catálogo **sin** transiciones en la definición (inalcanzable) ⇒
  **error explícito**.
- Estado en la definición **no declarado** en el catálogo ⇒ **error explícito**.

Pruebas: "una OT ALCANZA un estado extendido de tenant y se refleja EN_ESPERA en
el aggregate", "divergencia catálogo/definición ⇒ error" (ambas direcciones).
