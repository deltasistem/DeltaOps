# Políticas (PolicyEngine del Kernel)

Las 8 políticas se registran en el `PolicyEngine` del Kernel al inscribir el
módulo (`conPolicies`). **Todas están enlazadas** a la autorización de sus
comandos y se evalúan antes de aplicar el cambio. Son **puras y
configurables**: su decisión depende del estado del activo y de la
configuración del tenant (que la aplicación lee y pasa en el `subject`), no de
servicios externos.

| Constante | Nombre | Comando(s) | Decisión |
|-----------|--------|-----------|----------|
| `POLICY_PUEDE_REGISTRAR` | `modulo.activos.puede-registrar` | `crear`, `registrar` | Permite registrar sólo desde `BORRADOR`. |
| `POLICY_PUEDE_MODIFICAR` | `modulo.activos.puede-modificar` | `editar`, `operar`, `mantener`, `fuera-servicio` | Bloquea la operación en estado `RETIRADO`. |
| `POLICY_PUEDE_RETIRAR` | `modulo.activos.puede-retirar` | `retirar` | Permite retirar salvo `RETIRADO`; si `requiere-aprobacion-retiro`, exige `aprobado`. |
| `POLICY_PUEDE_CERRAR` | `modulo.activos.puede-cerrar` | `retirar` | Cierre definitivo: deniega desde `BORRADOR`/`RETIRADO` y respeta `requiere-aprobacion-retiro`. |
| `POLICY_PUEDE_CAMBIAR_UBICACION` | `modulo.activos.puede-cambiar-ubicacion` | `cambiar-ubicacion` | Impide cambiar ubicación de un activo retirado. |
| `POLICY_PUEDE_ASIGNAR_RESPONSABLE` | `modulo.activos.puede-asignar-responsable` | `asignar-responsable` | Impide asignar responsable a un activo retirado. |
| `POLICY_PUEDE_MODIFICAR_HOROMETRO` | `modulo.activos.puede-modificar-horometro` | `actualizar-horometro` | Aplica monotonicidad salvo `permite-retroceso-horometro`. |
| `POLICY_PUEDE_MODIFICAR_ODOMETRO` | `modulo.activos.puede-modificar-odometro` | `actualizar-odometro` | Aplica monotonicidad salvo `permite-retroceso-odometro`. |

El comando `retirar` = **cierre definitivo**: exige que **ambas** políticas
(`puede-retirar` y `puede-cerrar`) permitan.

## Evaluación

```ts
import { policiesDelModulo } from "@workspace/module-activos";

const p = policiesDelModulo();
const puedeRetirar = p.find((x) => x.name.endsWith("puede-retirar"))!;
puedeRetirar.evaluate(null, { estado: "OPERATIVO", requiereAprobacion: true, aprobado: false });
// → { allow: false, reason: ... }
```

Una política que deniega hace que el comando devuelva un `Result` fallido
(`KRN-AUTH-*` / `KRN-CFL-*` según el caso), nunca lanza excepción.
