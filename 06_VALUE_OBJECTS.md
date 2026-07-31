# 06_VALUE_OBJECTS.md

> **DeltaOps — ETS-003 · v1.0** · Value Objects del dominio.
> Un Value Object no tiene identidad: se define por su valor, es **inmutable** y se valida al construirse (un VO inválido no puede existir). Dos VOs con el mismo valor son intercambiables.
> Documento de diseño. No implementa nada.

---

## Económicos

| VO | Composición | Reglas / invariantes |
|---|---|---|
| **Dinero** | monto + Moneda | Nunca un monto sin moneda; operaciones solo entre la misma moneda; redondeo por reglas de la moneda |
| **Moneda** | código ISO (COP, USD…) + decimales | Solo monedas del catálogo |
| **TasaDeCambio** | moneda origen/destino + valor + fecha de vigencia | Positiva; la conversión usa la tasa vigente a la fecha del hecho |
| **PorcentajeDescuento / Porcentaje** | valor 0–100 | Rango validado |

## Temporales

| VO | Composición | Reglas |
|---|---|---|
| **FechaHoraZonificada** | instante + zona horaria | Nunca fechas "flotantes"; zona obligatoria |
| **RangoDeFechas** | inicio + fin | inicio ≤ fin |
| **Periodo** | año + mes (o semana/trimestre) | Para costos, presupuestos e indicadores |
| **Vigencia** | inicio + fin opcional | Fin nulo = vigente; base de toda Asignación y Contrato |
| **Frecuencia** | valor + unidad (días, horas de uso, km) | Disparador de preventivos; valor positivo |
| **VentanaDeTolerancia** | anticipación + gracia | Para cumplimiento de preventivos |

## Medición y uso

| VO | Composición | Reglas |
|---|---|---|
| **Horómetro** | horas acumuladas | ≥ 0; monotónico por activo (la regla vive en LecturaDeMedidor) |
| **Kilometraje** | km acumulados | ≥ 0; monotónico por activo |
| **Cantidad** | valor + UnidadDeMedida | Positiva en consumos; unidad del catálogo |
| **UnidadDeMedida** | código del catálogo | Conversión solo entre unidades compatibles |
| **Rendimiento** | consumo por unidad de uso (gal/h, km/gal, kWh/km) | Derivado; nunca digitado |
| **NivelDeCombustible** | porcentaje o volumen | Rango validado |

## Identificación y contacto

| VO | Composición | Reglas |
|---|---|---|
| **Correo** | dirección | Formato válido; normalizado a minúsculas |
| **Teléfono** | país + número | Formato válido |
| **Dirección** | vía, ciudad, región, país | Campos mínimos según país |
| **UbicacionGPS** | latitud + longitud (+ precisión) | Rangos válidos; para registros de campo |
| **IdentificacionTributaria** | tipo + número (NIT, RUT…) | Única por empresa; dígito de verificación cuando aplique |
| **Placa / Serial** | identificador físico del activo | Normalizado; único por tenant cuando la regla aplique |
| **Folio** | prefijo + consecutivo (OT-00001) | Único por tenant y tipo de documento; generado por el Motor de Folios |

## Del negocio EAM

| VO | Composición | Reglas |
|---|---|---|
| **Criticidad** | nivel (baja/media/alta/crítica) | Catálogo; ordena prioridades de OT y hallazgos |
| **Prioridad** | nivel + SLA opcional | Catálogo |
| **EstadoDeCiclo** | valor del ciclo de vida de la entidad | Solo transiciones válidas definidas por el agregado |
| **TipoDeCombustible** | valor del catálogo (ACPM, gasolina, gas, GLP, GNV, eléctrico, biodiesel, hidrógeno, otros) | Extensible por catálogo, nunca hardcodeado |
| **ResultadoDeInspeccion** | apto / no apto / con observaciones | Derivado de las respuestas y criticidad de ítems |
| **CalificacionDeProveedor** | puntuación + criterio + fecha | Histórica; nunca sobrescribe la anterior |
| **AtributoDinamico** | definición (nombre, tipo de dato, unidad, obligatoriedad) + valor | Valida contra la definición del TipoDeActivo |
| **ReferenciaOrganizacional** | empresa + sede? + operación? + proyecto? + centro? + ubicación? | Consistente con la jerarquía; núcleo del tenant scoping |
| **Firma** | autor + fecha + medio | Sella inspecciones y cierres; inmutable |

---

## Reglas generales

1. **Validación en el origen:** un VO se valida al construirse; los agregados no re-validan formatos.
2. **Inmutabilidad:** cambiar un valor significa crear un VO nuevo (y usualmente un evento).
3. **Sin identidad:** los VOs no se referencian por ID ni tienen ciclo de vida propio.
4. **El lenguaje manda:** los nombres de los VOs pertenecen al lenguaje ubicuo (`08_DICCIONARIO_NEGOCIO.md`).
