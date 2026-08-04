# Máquina de estados

Definición **declarativa** (`DEFINICION_MAQUINA_ACTIVO`) ejecutada por
`MaquinaEstados` de `@workspace/business-foundation`. El dominio sólo declara
estados y transiciones; el runtime valida que una transición sea legal.

## Estados

```
BORRADOR ──registrar──▶ REGISTRADO ──operar──▶ OPERATIVO ⇄ MANTENIMIENTO
                                                    │  (mantener / operar)
                                                    ├──fueraServicio──▶ FUERA_SERVICIO
                                                    │                        │ (operar)
                                                    └────────── retirar ─────┴──▶ RETIRADO (final)
```

| Desde | Comando | Hacia |
|-------|---------|-------|
| `BORRADOR` | `registrar` | `REGISTRADO` |
| `REGISTRADO` | `operar` | `OPERATIVO` |
| `OPERATIVO` | `mantener` | `MANTENIMIENTO` |
| `MANTENIMIENTO` | `operar` | `OPERATIVO` |
| `OPERATIVO` / `MANTENIMIENTO` | `fueraServicio` | `FUERA_SERVICIO` |
| `FUERA_SERVICIO` | `operar` | `OPERATIVO` |
| `REGISTRADO` / `OPERATIVO` / `MANTENIMIENTO` / `FUERA_SERVICIO` | `retirar` | `RETIRADO` |

- `RETIRADO` es **terminal**: no admite transiciones de salida.
- `MANTENIMIENTO` ⇄ `OPERATIVO` y `FUERA_SERVICIO` ⇄ `OPERATIVO` son bidireccionales.
- Una transición ilegal devuelve `Result` fallido (`KRN-CFL-*`), nunca lanza.

## Configurabilidad por catálogo `estados` (semántica inequívoca)

La máquina anterior es la **canónica**. El catálogo configurable `estados`
(ver [catalogos.md](./catalogos.md)) permite a cada tenant **recortar** los
estados admitidos, con reglas sin ambigüedad:

- Catálogo `estados` **VACÍO** ⇒ se usa la **máquina canónica completa**: toda
  transición legal del dominio es admisible.
- Catálogo `estados` **NO vacío** ⇒ el tenant declara **explícitamente** el
  subconjunto de estados admitidos. Cada transición valida su **estado destino**:
  debe estar **presente y habilitado** en el catálogo. Un estado **ausente** o
  **deshabilitado** hace que la transición se rechace con `KRN-VAL-001`
  (validación), además de la validación estructural de la máquina (`KRN-CFL-*`).

Ejemplo: un tenant que sólo declara `REGISTRADO` y `OPERATIVO` puede registrar y
operar, pero `mantener` (destino `MANTENIMIENTO`, ausente) se rechaza con
`KRN-VAL-001`.

## Uso

```ts
import { maquinaActivo, ESTADOS } from "@workspace/module-activos";
```

Las funciones del aggregate (`registrarActivo`, etc.) consultan `maquinaActivo`
antes de aplicar el cambio, garantizando que estado y transición son coherentes.
