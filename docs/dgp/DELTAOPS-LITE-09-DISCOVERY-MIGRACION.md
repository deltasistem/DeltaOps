# DELTAOPS LITE-09 — Discovery de migración de datos históricos reales Delta

Fecha: 2026-08-14 (America/Bogota) · Estado: DISCOVERY (previo a implementación)
Directiva: `attached_assets/Pasted--DIRECTIVA-DELTAOPS-LITE-09-Migraci-n-de-datos-hist-ric_1786736742585.txt`

## 1. Fuentes analizadas (estructura real, sin inferencias)

Los seis archivos fueron subidos por Dirección a `attached_assets/` (prefijo `0_`, sufijo de timestamp). Todos son exportes de Microsoft Forms (columnas `Id`, `Hora de inicio`, `Hora de finalización`, `Correo electrónico`, `Nombre`) con una única hoja `Sheet1`.

| # | Archivo | Filas de datos | Columnas | Rango temporal |
|---|---------|----------------|----------|----------------|
| 1 | CHECKLIST PRE OPERACIONAL DE CARGADOR (4) | 1 457 | 34 | 2025-08-12 → 2026-08-13 |
| 2 | CHECKLIST PRE OPERACIONAL DE MONTACARGAS (5) | 2 388 | 34 | 2025-09-05 → 2026-08-13 |
| 3 | CONTROL DE _COMBUSTIBLE RIVERPORT (2) | 1 155 | 13 útiles (46 físicas) | 2025-08-05 → 2026-07-30 |
| 4 | Formulario para el cargue de Horas Hombre (1) | 2 042 | 24 útiles (29 físicas) | 2025-10-01 → 2026-07-22 |
| 5 | PLAN DE MANTENIMIENTO PREVENTIVO CARGADORES V3 | 75 | 153 | 2026-01-09 → 2026-08-01 |
| 6 | PLAN DE MANTENIMIENTO PREVENTIVO MONTACARGAS V2 | 34 | 192 | 2026-02-16 → 2026-07-28 |

### 1.1 Checklists preoperacionales (fuentes 1 y 2)
- Identidad de la fila: `Id` de Forms (único por archivo), `Hora de inicio`/`finalización` (timestamp real de diligenciamiento), correo `anónimo`/`anonymous`.
- Activo: columna `Equipo` (cargadores) / `Montacarga` (montacargas). Horómetro en columna propia.
- Ítems de inspección: 19–23 columnas con valores exclusivamente `CUMPLE` / `NO CUMPLE` (cargador: 26 253 / 1 430; montacargas: 44 703 / 669). Sin N/A.
- Campos operativos: `Centro de costo` (texto libre con variantes: RIVERPORT, DISSAN, SQM, ZONA FRANCA, «Palo blanco»/«PALO BLANCO»/«Delta paloblanco», etc.), `Operador de Máquina` (52 y 44 nombres distintos, texto libre), `Supervisor`, `Observaciones` (58–59 % vacío), GPS.
- Cargador (4): columnas `Fecha` y `Hora inicial` 100 % vacías (la fecha real es `Hora de inicio`); `Nombre` 100 % vacío en ambas.
- No hay fotografías, firmas ni usuarios autenticados en los datos (correo anónimo).

### 1.2 Control de combustible (fuente 3)
- Columnas útiles: `FECHA` (fecha del cargue; `HORA` 98 % vacía), `CARGADOR` (activo), `PROVEEDOR DE GASOLINA`, `CANTIDAD DE GALONES`, `HOROMETRO ACTUAL`, `RESPONSABLES DEL CARGUE` (2 personas distintas), `ADJUNTAR TICKET` (URL OneDrive corporativa — evidencia externa no descargable de forma confiable).
- Proveedores (snapshot texto, exactamente como pide el modelo LITE-08): COMBGAS (705), SALIDA DE COMBUSTIBLE BARITANQUE (380), RIVERPORT (23+1), TERPEL (17), SANTA MARIA DEL MAR (10), INGRESO DE COMBUSTIBLE BARITANQUE (2), vacío (10).
- «Baritanque» aparece a la vez como *activo* (9 filas de CARGADOR) y como *proveedor* («SALIDA/INGRESO DE COMBUSTIBLE BARITANQUE»): es un tanque interno de almacenamiento; las «salidas» son despachos internos y los «ingresos» son recargas del tanque.
- Filas con `Id` vacío: ~1 % (fila sin identidad de Forms).
- Unidad implícita: galones. Todos los valores de galones y horómetro son numéricos.

### 1.3 Horas hombre (fuente 4)
- Columnas útiles: `Fecha` (jornada), `Cliente1` (RIVERPORT 2 037 / ZONA FRANCA 2), `Operación`, `Material`, `Cargador` (activo), `Cargador propio o tercerizado`, `Recibo` (número), `Horómetro Inicial`, `Horómetro Final`, `Turno` (Día/Noche), `Supervisor`/`Supervisor1` (columnas duplicadas complementarias: 37 %/63 % vacías), `Operador de Máquina`, `Observaciones`, `Hora` (duración calculada en horas decimales, 0.2–16.7; una fila >16 h).
- **Horómetros con doble semántica**: 1 993 filas numéricas (horómetro real) y ~44 filas en formato `HH:MM` (hora del reloj; en esas filas la observación dice «HOROMETRO FS», es decir, fuera de servicio). La directiva exige conservar ambos sin asumir cuál es correcto.
- `Cargador propio o tercerizado` es por fila y contradictorio para el mismo activo (p. ej. C11: 300 «Tercerizado» / 15 «Propio»; C1: 434 «Propio» / 1 «Tercerizado») → es dato transaccional declarado, no atributo confiable del activo.

### 1.4 Planes de mantenimiento preventivo (fuentes 5 y 6)
- A pesar del nombre, **no son planes: son registros de eventos de mantenimiento** capturados por Forms.
- Discriminador `MANTENIMINETO A REALIZAR` (sic): `RUTINA` (24+24) vs `CORRECTIVO` (51+10).
- Filas RUTINA: `Rutina a Realizar` (300/600/1200/2400 hrs) + bloques de ítems `CUMPLE`/`NO CUMPLE` por rutina (columnas repetidas por bloque de frecuencia, mayormente vacías fuera del bloque aplicable). Algunas filas RUTINA no tienen ningún ítem diligenciado (p. ej. montacargas 600 hrs).
- Filas CORRECTIVO: `SISTEMA-SUBSISTEMA AFECTADO`, `MODO DE FALLA`, `EFECTO DE FALLA`, `Descripción de la falla Existente`, `Descripción de Actividades a Realizar`, `Tiempo de reparación EN HORAS` y `Downtime EN HORAS` (solo cargadores), `Técnico # 1/2`, `Mecánico Ejecutor` (100 % vacío), `Supervisor`.
- `Estado` del equipo: Operativo / Fuera de servicio (4 en cargadores).
- Técnicos: mezcla de personas internas (CRISTIAN ZUÑIGA, JESUS BUELVAS, JOEL MOSQUERA…) y **proveedores externos** («Hidráulicos de la costa», «Para service») en el mismo campo.
- Estos registros **sí demuestran ejecución** (fecha, técnico, horómetro, ítems/falla descrita) — no son programación futura. No contienen costos.

## 2. Universo de activos y unificación de identidad

Códigos distintos observados en las 6 fuentes (42 en bruto). Evidencia de equivalencias:

| Código canónico propuesto | Variantes observadas | Evidencia |
|---|---|---|
| C11 (nombre actual «C11 SIGAR») | `C11` (horas hombre), `C11 SIGAR` (checklist cargador, combustible) | Directiva + Dirección: mismo activo. Confirmado con datos: horómetros mensuales solapan de forma continua (oct-2025: comb 501.9–766.4 vs hh 373.7–772.9; … jul-2026: ambos ≈3 4xx–3 5xx). Alquilado, mantenimiento del tercero. |
| SEM05 | `SEM05`, `SEM 5 GPR` | Mismo consecutivo SEM; «GPR» solo en horas hombre. **Requiere confirmación de Dirección.** |
| SEM06 | `SEM06`, `SEM 6 GPR` | Ídem. |
| SEM07 | `SEM07`, `SEM 7 GPR` | Ídem. |
| C9 | `C-9` (solo horas hombre) | ¿Es el «C9» de la flota o un tercero? **Requiere confirmación.** |
| 950-01 / 950-03 | `950-01`, `950-03` | Cargadores CAT 950 tercerizados (mayoría «Tercerizado»). |

Activos sin ambigüedad: C1–C8 (cargadores), M1–M13, DISAN #1, DISAN #2 (montacargas), VOLVO L70F, SDR (1 sola fila), A02, RETRO 312 BL, Baritanque (tanque), CAMIONETA ALVARO, «Serpomar Logístic Sas, Liugong 856» (equipo de un tercero con combustible despachado por Delta).

Ninguno de estos activos existe hoy en el tenant `delta-demo` (solo los 10 activos demo `*-001`, que la directiva ordena conservar). Todo activo histórico deberá crearse con los comandos oficiales y marcarse como HISTÓRICO REAL (vs DEMO) mediante procedencia.

## 3. Modelos destino existentes (contratos verificados en código)

| Dato histórico | Destino | Comando/contrato | Fecha histórica | Idempotencia |
|---|---|---|---|---|
| Activos + alias + tenencia | module-activos | `POST /activos` (`activos.crear`, luego `registrar`); campos: código, nombre, tipo/categoría/familia, criticidad, centroCosto, proveedor, especificaciones, observaciones | n/a | id + opId de cliente |
| Horómetros (todas las fuentes) | module-utilizacion | `modulo.utilizacion.registrar-lectura` `{id, opId, activoId, tipoMedidor, valor, fechaHora, origen, observacion?}` — append-only, `fechaHora` explícita ✔, lectura descendente se marca inconsistente sin borrarse ✔ (exactamente lo que pide la directiva) | ✔ | opId determinista |
| Checklists preoperacionales | preoperacional (Dynamic Forms + record store) | `modulo.preoperacional.sellar` `{id, opId, activoId, plantillaClave, plantillaVersion, respuestaId, veredicto, selladoAt, incumplimientos?, observaciones?, contexto?}`; `contexto` acepta objeto arbitrario → procedencia ✔ | ⚠ `selladoAt` lo impone la capa HTTP con hora de servidor (GAP-3) | id + opId; mismo id con otro opId ⇒ conflicto |
| Combustible | module-utilizacion (LITE-08) | registro multi-energía con proveedor snapshot string ✔, cantidad, horómetro, fecha | ✔ (verificar en implementación) | opId |
| Horas hombre (jornadas) | module-manodeobra | **GAP-4**: las sesiones existen solo ligadas a OT; no hay comando para jornada histórica libre por activo | — | — |
| Mantenimientos RUTINA/CORRECTIVO ejecutados | module-ordenes / preventivo | **GAP-5**: crear OT exige workflow completo; no existe «mantenimiento realizado» como hecho histórico simple | parcial | opId |

Contrato transversal de idempotencia (verificado): todos los comandos de creación exigen `opId` con claim durable; repetir el mismo `id`+`opId` converge (idempotente), mismo `id` con otro `opId` es conflicto. Estrategia: **id y opId deterministas (UUIDv5) derivados de (archivo fuente, Id de Forms, tipo de registro)** — sin timestamps actuales. Filas sin `Id` de Forms (~1 % en combustible) usarán hash del contenido completo de la fila.

## 4. Matriz de mapeo de columnas (resumen por fuente)

### 4.1 Checklists → preoperacional + lectura de horómetro
- `Hora de inicio` → fecha/hora del preoperacional y de la lectura. `Equipo`/`Montacarga` → activo (tabla §2). `Horómetro` → lectura (normalizando `3816,4`, `669 7`, `1392 ,2` → punto decimal; 63+22 filas afectadas, se marcan ⚠ regularizadas conservando el valor crudo en procedencia).
- Ítems CUMPLE/NO CUMPLE → respuestas de una plantilla Dynamic Forms histórica por tipo (cargador/montacargas) creada 1:1 con las columnas reales del Excel. Veredicto derivado: NO CUMPLE en algún ítem ⇒ incumplimientos listados (la directiva prohíbe inventar veredicto de bloqueo que el Excel no declara: el Excel no trae veredicto, solo ítems → veredicto se calcula de forma transparente y documentada).
- `Centro de costo`, `Operador de Máquina`, `Supervisor`, `Observaciones`, GPS, kit antiderrame → `contexto` (procedencia + datos operativos), sin fabricar usuarios autenticados.

### 4.2 Combustible → registro de combustible + lectura de horómetro
- `FECHA` (+`HORA` si existe) → fecha del cargue; `CARGADOR` → activo; `CANTIDAD DE GALONES` → cantidad (galones); `PROVEEDOR DE GASOLINA` → proveedor snapshot texto (vacío se conserva vacío); `HOROMETRO ACTUAL` → lectura de horómetro asociada; `RESPONSABLES` y URL del ticket → contexto/procedencia (URL como referencia externa, sin descargar).
- Filas «INGRESO DE COMBUSTIBLE BARITANQUE» sobre el activo Baritanque = recarga del tanque interno (no consumo de un equipo). Ver P-6.

### 4.3 Horas hombre → jornadas + lecturas de horómetro
- `Fecha`+`Turno` → jornada; `Cargador` → activo; `Operador de Máquina` texto (no usuario autenticado); `Horómetro Inicial`/`Final` → lecturas si son numéricas; formato `HH:MM` (HOROMETRO FS) se conserva como dato de contexto SIN generar lectura; `Hora` (duración declarada) se conserva tal cual junto a los horómetros, sin recalcular ni preferir uno u otro (mandato explícito de la directiva).
- Destino pendiente de GAP-4 (ver §5 y pregunta P-3).

### 4.4 PMP → eventos de mantenimiento ejecutado
- RUTINA con ítems diligenciados: mantenimiento preventivo ejecutado demostrado (fecha PMP, técnicos, horómetro, rutina X hrs, ítems CUMPLE/NO CUMPLE).
- RUTINA sin ítems: ejecución declarada sin detalle → importar como evento con detalle vacío marcado ⚠.
- CORRECTIVO: falla + actividades + tiempos de reparación/downtime, técnico interno o proveedor externo.
- `Horómetro Actual` → lectura de horómetro adicional.
- **Jamás se convertirá una fila en OT cerrada con workflow fabricado** (usuarios, aprobaciones y sellos que no existen). Destino concreto depende de GAP-5 (pregunta P-4).
- C11/C11 SIGAR no aparece en ninguna fila de PMP ✔ coherente con mantenimiento a cargo del tercero; el importador además excluirá por regla la generación de rutinas/OT internas para activos con responsabilidad de mantenimiento TERCERO.

## 5. GAPs de modelo detectados

- **GAP-1 — Alias de activo**: el modelo de activo no tiene nombres alternativos. La búsqueda (`platform.search`) indexa código y nombre. Propuesta sin hardcode: canónico `codigoEmpresarial=C11`, `nombre=C11 SIGAR`, y alias histórico registrado en el campo estructurado existente del activo (identificación/especificaciones) + normalización de alias en el importador mediante tabla de equivalencias del lote (dato, no código). Si Dirección exige que la búsqueda por «C11» y «C11 SIGAR» encuentre el activo por ambos términos, se verificará que ambos térmnos queden en campos indexados (código y nombre cubren exactamente ese par).
- **GAP-2 — Tenencia y responsabilidad de mantenimiento**: no existen campos propio/alquilado ni interno/tercero. Opciones: (a) especificaciones estructuradas del activo (existente, sin migración), (b) extensión aditiva del contrato de activos (requiere aprobación por contrato congelado). Se propone (a) para LITE-09.
- **GAP-3 — `selladoAt` de preoperacional es hora de servidor**: un preoperacional histórico quedaría sellado «hoy». Para no falsificar sellos, las ejecuciones históricas deben portar la fecha real del evento como dato del hecho y quedar marcadas como importadas (contexto), y la hoja de vida debe ordenarlas por la fecha real. Requiere un camino de importación explícito (no reutilizar a ciegas la ruta HTTP operativa) que preserve el principio «sello de servidor = fecha de importación» + «fecha del hecho = dato histórico declarado».
- **GAP-4 — Jornadas de horas hombre sin OT**: mano de obra actual es sesiones ligadas a OT. Las 2 042 jornadas históricas no tienen OT. No se fabricarán OT ficticias.
- **GAP-5 — Mantenimiento ejecutado sin OT/workflow**: no hay comando «mantenimiento realizado» como hecho. Las 109 filas de PMP demuestran ejecución pero no soportan fabricar el ciclo completo de una OT (solicitante, aprobaciones, sesiones, cierre con validador).
- **GAP-6 — Centro de costo**: en activos es clave de catálogo; los Excel traen texto libre con variantes de mayúsculas/tildes. Se requiere normalización a catálogo (RIVERPORT, DISSAN, SQM, ZONA FRANCA, PALO BLANCO, …) conservando el literal original en procedencia.

## 6. Inconsistencias de datos detectadas (se marcarán ⚠, no se borran)

1. Horómetros con retrocesos: C1 (4), C11 SIGAR (3), C5 (1), SEM07 (6, incluye salto 5011→2252: posible cambio de medidor o dígitos) en combustible; el modelo de lecturas ya marca descendentes como inconsistentes sin descartarlas ✔.
2. Horómetros con formato sucio en checklists: 85 valores con coma decimal o espacios (`3816,4`, `669 7`).
3. Horas hombre: ~44 filas con «horómetro» en formato hora de reloj (HOROMETRO FS); 1 jornada de 16.7 h; columnas Supervisor/Supervisor1 complementarias.
4. Combustible: 10 filas sin proveedor; ~12 filas sin `Id` de Forms; equipo «Baritanque» con doble rol (activo y origen de despachos).
5. Centro de costo con variantes tipográficas (≥12 literales para ~6 centros reales).
6. C11 en mayo-2026 (horas hombre): valor 13 526.1 fuera de rango (dedo/dígitos) → ⚠.
7. PMP: filas RUTINA sin ítems diligenciados; campo `Técnico` mezcla personas y empresas externas; `Mecánico Ejecutor` siempre vacío.
8. Operadores/supervisores como texto libre con variantes (mayúsculas, con/sin segundo apellido) — se conservan literales; no se crearán usuarios.

## 7. Diseño propuesto del importador (composición, sin ETL externo)

- Ubicación: capacidad de importación en api-server + UI Administración → Datos históricos → Importar (flujo de 8 pasos de la directiva, desktop). Sin módulos paralelos: los datos aterrizan vía comandos públicos existentes de cada módulo.
- Lote (`loteId` determinista por archivo+hash) con estados y reintento seguro; validación previa completa con categorías ✓/⚠/✕ y confirmación explícita antes de escribir.
- Procedencia por registro: archivo fuente, `Id` de Forms/fila, tipo, `loteId`, fecha de importación, marcador HISTÓRICO (vs DEMO), literal original de campos normalizados.
- Idempotencia: UUIDv5 (namespace del programa) sobre `(tenant, archivo, tipo, Id de fila)`; segunda importación = 0 duplicados.
- Tenant exclusivamente del contexto autenticado; rol CONSULTA jamás importa.
- Activos alquilados con mantenimiento TERCERO: regla dura de exclusión de rutinas internas e OT propias.

## 8. Preguntas de negocio abiertas (bloqueantes — §26 de la directiva)

- **P-1** ¿`SEM05/SEM 5 GPR`, `SEM06/SEM 6 GPR`, `SEM07/SEM 7 GPR` son respectivamente el mismo activo? ¿Y `C-9` es un noveno cargador de la flota o un equipo tercero?
- **P-2** ¿Deben crearse como activos los equipos incidentales/de terceros: `CAMIONETA ALVARO`, `Serpomar Logístic Sas, Liugong 856`, `Baritanque` (tanque), `SDR` (1 fila), `A02`, `RETRO 312 BL`, `950-01/950-03`, `VOLVO L70F`? ¿O solo la flota propia/alquilada operada por Delta (C1–C8, C11, M1–M13, DISAN #1/#2, SEM05–07) y el resto queda fuera con su combustible/horas conservados contra el activo si se crea, u omitidos con reporte?
- **P-3 (GAP-4)** Horas hombre sin OT: ¿basta con (a) lecturas de horómetro + jornada conservada como registro histórico consultable en hoja de vida (procedencia completa), o Dirección exige (b) que aparezcan en el módulo de mano de obra actual (requeriría extensión de contrato congelado)?
- **P-4 (GAP-5)** Mantenimientos PMP ejecutados: ¿(a) evento de mantenimiento histórico en la hoja de vida (fecha, tipo RUTINA/CORRECTIVO, técnico, falla, tiempos, ítems) sin fabricar OT, o (b) OT reales retroactivas (implicaría fabricar workflow que el Excel no demuestra — desaconsejado por la propia directiva)?
- **P-5** Preoperacionales históricos: ¿conforme con GAP-3 (sello de servidor = fecha de importación; fecha real del hecho como dato, hoja de vida ordena por fecha real)?
- **P-6** Combustible del Baritanque: los «INGRESO DE COMBUSTIBLE BARITANQUE» (2 filas) y las 9 filas donde el activo es `Baritanque`, ¿se importan como movimientos del tanque o se excluyen con reporte?

## 9. Alcance de la prueba real (§23)

C11/C11 SIGAR (combustible 195 + horas hombre 315 + checklists 26) y al menos un activo por fuente: C1 (todas las fuentes), M5 (checklist + PMP montacargas), C5 (PMP cargadores + combustible + horas hombre). Verificación en hoja de vida + segunda importación idempotente.
