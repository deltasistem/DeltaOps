# Dominio: aggregate Activo y Value Objects

## Aggregate `Activo`

Raíz de consistencia del módulo. Cada operación produce una nueva versión
inmutable (`version` monótona) y un evento de dominio autosuficiente. Campos:

| Campo | Descripción |
|-------|-------------|
| `id`, `tenantId`, `version` | Identidad + concurrencia optimista. |
| `codigoEmpresarial` | Código único por tenant (case-insensitive). |
| `nombre`, `descripcion` | Denominación del activo. |
| `estado` | Estado de la máquina (ver `maquina-estados.md`). |
| `tipo`, `categoria`, `familia`, `subfamilia` | Clasificación (claves de catálogo). |
| `criticidad`, `prioridad` | Riesgo/urgencia (claves de catálogo). |
| `ubicacion` (VO `Ubicacion`) | Ubicación actual con coordenadas opcionales. |
| `responsableId` | Responsable asignado. |
| `horometro`, `odometro` (VO `Medicion`) | Mediciones acumulativas monótonas. |
| `garantia`, `identificacionTecnica`, `especificaciones` | VOs opcionales. |
| `proveedor`, `moneda`, `costoAdquisicion`, `fechaAdquisicion` | Datos de compra. |
| `createdBy`, `createdAt`, `updatedAt` | Auditoría mínima. |

Persistencia: columnas indexadas (`estado`, `tipo`, `criticidad`,
`ubicacion_id`) + columna `datos jsonb` con el resto de campos y VOs.

## Value Objects (inmutables, validados con Zod)

Todos exponen un constructor `crear*` que devuelve `Result<VO, KernelError>`
(código `KRN-VAL-001` con los `issues` de Zod) y congela el objeto
(`Object.freeze`). Nunca se muta un VO existente; se crea uno nuevo.

- `Coordenadas` — lat/lng validados.
- `Ubicacion` — `ubicacionId`, `etiqueta`, `coordenadas?`.
- `Medicion` — `valor >= 0`, `unidad`, `fecha`. Helper `esRetroceso(previa, nueva)`
  implementa la regla de monotonicidad (una medición nueva menor que la previa
  es un retroceso).
- `Garantia`, `IdentificacionTecnica`, `Dimensiones`, `Peso`, `Capacidad`,
  `Combustible`, `Motor`, `Transmision`, `Neumaticos`, `Proveedor`,
  `Especificaciones` — VOs técnicos compuestos.

## Operaciones puras del aggregate

`crearActivo`, `editarActivo`, `registrarActivo`, `operarActivo`,
`mantenerActivo`, `fueraServicioActivo`, `retirarActivo`, `cambiarUbicacion`,
`asignarResponsable`, `actualizarHorometro`, `actualizarOdometro`.

Cada una devuelve `Result<{ activo, evento }, KernelError>`. Las mediciones
rechazan retrocesos con `KRN-CFL-001` salvo que la configuración
`permite-retroceso-horometro` / `permite-retroceso-odometro` lo habilite.
