# DGP-007 · Validation Runtime (`validacion.ts`)

Valida los datos capturados contra la `DefinicionFormulario` y su
`ContratoValidacion`. Es determinista y **offline-safe** en su parte síncrona;
la parte asincrónica se resuelve por contrato vía el **QueryBus del Kernel**.

## Clases de validación

- **Obligatoriedad efectiva** — considera la obligatoriedad estática del campo y
  la condicional (`obligatorioCuando`); un campo no visible no es obligatorio.
- **Formato / longitud / rango** — derivados del esquema Zod del campo
  (`email`, `uri`, patrón regex, `longitudMin/Max`, `minimo/maximo`, decimales).
- **Dependencias entre campos** — mediante reglas condicionales por campo.
- **Validaciones cruzadas** (`ValidacionCruzada`) — a nivel de formulario: si
  `cuando` se cumple, se emite un hallazgo.
- **Validaciones asincrónicas** (`ValidadorAsincrono`) — por contrato: ejecutan
  una Query registrada en el Kernel (`query`) con `{ campo, valor, datos }`, que
  debe devolver `{ valido: boolean, mensaje? }` (p. ej. unicidad).

## Severidades

| Severidad | Efecto |
|---|---|
| `advertencia` | No bloquea; se registra (queda en el payload del evento de envío). |
| `error` | Bloquea el **envío** del formulario. |
| `bloqueo` | Impide incluso **guardar el borrador**. |

El resultado es estructurado: `{ campo, severidad, mensaje, regla }`.

```ts
import { validarSincrono, validarCompleto, soloBloqueos } from "@workspace/dynamic-forms";

// Guardar borrador: solo se comprueban los bloqueos.
const borr = soloBloqueos(validarSincrono(def, datos, contrato));

// Enviar: validación completa (síncrona + asincrónica) server-side.
const envio = await validarCompleto(def, datos, contrato, ctx, deps.runtime.queries);
if (!envio.valido) { /* envio.hallazgos */ }
```

## Contrato de validación asincrónica

```ts
const contrato = {
  asincronas: [
    { nombre: "unicidad-codigo", campo: "codigo", query: "modulo.demo.codigo.unico",
      mensaje: "El código ya existe", severidad: "error" },
  ],
};
```

La Query se ejecuta dentro del contexto del comando (mismo tenant/correlación).
Si la Query falla, se reporta como hallazgo (no rompe la transacción). Esto
integra validaciones "contra el sistema" (p. ej. unicidad) sin acoplar el motor
a ningún dominio: el motor solo conoce el **nombre** de la query.
