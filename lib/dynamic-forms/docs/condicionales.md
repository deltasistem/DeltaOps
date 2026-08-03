# DGP-007 · Conditional Engine (`condiciones.ts`)

Motor de condiciones **declarativo y seguro**: sin `eval`, sin scripts, sin
código embebido. Todo se describe con datos y es evaluable **offline**.

> **Unificado con el Workflow Engine.** El motor de condiciones BASE
> (expresiones JSON tipadas, operadores cerrados y combinadores `y/o/no`) vive
> en `@workspace/workflow-engine` y se **reutiliza** aquí — no se duplica la
> evaluación. `condiciones.ts` re-exporta ese motor y añade ENCIMA solo las
> extensiones propias del Dynamic Forms Engine: cálculo declarativo por campo
> (`ExpresionCalculo`) y reglas condicionales por campo (`ReglasCampo`).

## Expresión de condición (`ExpresionCondicion`)

Una condición es un árbol JSON componible, provisto por el Workflow Engine:

- **Comparación de campo**: `{ campo, operador, valor? }` (admite rutas con
  punto: `"a.b.c"`).
- **Composición**: `{ y: [...] }`, `{ o: [...] }`, `{ no: <condicion> }`.

`Condicion` es un alias local de `ExpresionCondicion`.

### Operadores (cerrados, del motor compartido)

`igual`, `distinto`, `mayor`, `mayorIgual`, `menor`, `menorIgual`, `contiene`,
`empiezaCon`, `terminaCon`, `en`, `existe`, `vacio`.

```ts
import { evaluarCondicion, validarExpresion } from "@workspace/dynamic-forms";

const critico = {
  y: [
    { campo: "clasificacion", operador: "igual", valor: "alta" },
    { campo: "cantidad", operador: "mayorIgual", valor: 5 },
  ],
};
evaluarCondicion(critico, { clasificacion: "alta", cantidad: 7 }); // true

// La propia expresión se valida con Zod (rechazo de condiciones malformadas):
validarExpresion(critico).success; // true
```

`evaluarCondicion`, `evaluarTodas`, `validarExpresion`, `ExpresionCondicionSchema`
y `OPERADORES` se re-exportan directamente desde el motor compartido.

## Reglas por campo (extensión del Dynamic Forms Engine)

`ReglasCampo` declara el comportamiento condicional de un campo. Cada regla se
evalúa con el motor base compartido:

| Regla | Efecto |
|---|---|
| `visibleCuando` | El campo se muestra solo si la condición se cumple. |
| `ocultoCuando` | Fuerza a ocultar el campo. |
| `obligatorioCuando` | Obligatoriedad dinámica (un campo no visible **nunca** es obligatorio). |
| `soloLecturaCuando` | Solo lectura dinámica. |
| `calculadoCuando` | Calcula el valor con una `ExpresionCalculo` (aritmética/concatenación declarativa). |
| `validacionCuando` | Reglas de validación que se activan bajo condición. |

```ts
import { evaluarReglasFormulario } from "@workspace/dynamic-forms";

const { estados, datosEfectivos } = evaluarReglasFormulario(
  [
    { campo: "detalle", visibleCuando: { campo: "clasificacion", operador: "igual", valor: "alta" } },
    { campo: "total", calculadoCuando: { expresion: { op: "*", args: [{ ref: "cantidad" }, { ref: "precio" }] } } },
  ],
  { clasificacion: "alta", cantidad: 3, precio: 10 },
);
// estados.detalle.visible === true; datosEfectivos.total === 30
```

## Expresión de cálculo (`ExpresionCalculo`) — extensión propia

Árbol seguro sin `eval` (no existe en el Workflow Engine; es específico de
formularios):

- `{ ref: "campo" }` — valor de otro campo.
- `{ literal: <valor> }` — constante.
- `{ op: "+" | "-" | "*" | "/", args: [...] }` — aritmética.
- `{ concat: [...] }` — concatenación de cadenas.
- `{ redondear: <expr>, decimales? }` — redondeo.

Los campos calculados se aplican **en orden de declaración** sobre una copia de
los datos, de modo que un derivado pueda depender de otro derivado anterior.
