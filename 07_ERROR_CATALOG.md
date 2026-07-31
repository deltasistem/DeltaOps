# 07_ERROR_CATALOG.md

> **DeltaOps — ETS-008 · v1.0** · Catálogo de errores con códigos estables.
> Reglas: el código jamás cambia de significado; el mensaje se localiza, el código no; todo error lleva correlación e indicador honesto de reintentabilidad (`06` §4); el silencio es el único fallo inaceptable.
> Documento de diseño. No implementa nada.

---

## 0. Convenciones

- Código = `DOMINIO_CONDICION` en mayúsculas, estable para siempre; retirar uno exige el proceso de deprecación (`17`).
- **R** = reintentable tal cual (transitorio) · **C** = reintentable tras corregir algo · **N** = no reintentable (decisión de negocio/permiso).
- HTTP orientativo: 400 validación · 401 autenticación · 403 permiso · 404 no visible · 409 conflicto · 422 regla de negocio · 429 límite · 5xx plataforma.

## 1. Universales

| Código | Significado | Tipo |
|---|---|---|
| `NO_AUTENTICADO` | Token ausente, inválido o expirado | C (refrescar) |
| `SESION_REVOCADA` | La sesión fue cerrada o revocada | C (re-autenticar) |
| `NO_AUTORIZADO` | El actor no tiene el permiso en el contexto activo (denegado por defecto) | N |
| `CONTEXTO_INVALIDO` | Contexto inexistente, cerrado o sin membresía vigente del actor | C |
| `VALIDACION_FALLIDA` | Uno o más campos inválidos (lista completa en detalles, `06` §6) | C |
| `RECURSO_NO_ENCONTRADO` | No existe **o no es visible** para el actor (respuesta homogénea: no se revela existencia) | N |
| `CONFLICTO_VERSION` | La entidad cambió desde la versión conocida (detalles: representación actual) | C |
| `DUPLICADO_IDEMPOTENTE` | Clave de idempotencia ya procesada — se devuelve el resultado original (no es fallo: respuesta original con esta marca) | — |
| `LIMITE_EXCEDIDO` | Rate limit superado (cabeceras indican espera) | R |
| `PROTOCOLO_NO_SOPORTADO` | Versión de contrato/protocolo fuera de N/N-1 | C (actualizar) |
| `OPERACION_EN_CURSO` | La operación asíncrona aún no termina | R |

## 2. Negocio (por dominio; los propios de cada comando están en `03`)

| Código | Significado | Tipo |
|---|---|---|
| `ASIGNACION_SOLAPADA` | El activo ya tiene asignación vigente en el periodo | C |
| `DESTINO_CERRADO` / `CONTEXTO_CERRADO` | El nodo organizacional destino no está vigente | C |
| `LECTURA_NO_MONOTONA` | La lectura retrocede respecto a la última aceptada | C (o bandeja si es telemetría) |
| `FUERA_DE_RANGO` | Valor fuera del rango físico declarado | C |
| `CAPACIDAD_EXCEDIDA` | Cantidad supera capacidad + tolerancia del activo | C |
| `ENERGIA_INCOMPATIBLE` | Tipo de energía no compatible con el activo | C |
| `TRANSICION_INVALIDA` | Transición no permitida desde el estado actual (workflow del tenant) | N |
| `CAMPOS_REQUERIDOS_FALTANTES` | La transición/cierre exige campos o evidencias aún ausentes | C |
| `REQUISITOS_CIERRE_INCOMPLETOS` | Requisitos de cierre del tenant sin completar | C |
| `VENTANA_REAPERTURA_VENCIDA` | Fuera del plazo de reapertura configurado | N |
| `SOD_VIOLADA` | La acción viola segregación de deberes (aprobador=creador, auto-otorgamiento) | N |
| `MONTO_EXCEDE_NIVEL` | El monto supera el nivel de aprobación del actor | N |
| `STOCK_INSUFICIENTE` | Existencia disponible insuficiente (genera necesidad) | C |
| `RESERVA_INEXISTENTE` / `DESPACHO_INEXISTENTE` / `OC_SIN_SALDO` | Referencia operativa inválida en bodega | C |
| `CODIGO_DUPLICADO` / `USUARIO_DUPLICADO` / `PROVEEDOR_DUPLICADO` | Identidad de negocio ya existente | C |
| `ORIGEN_YA_ENLAZADO` / `SOLICITUD_YA_ATENDIDA` | El origen ya fue procesado | N |
| `ACTIVO_CON_OTS_ABIERTAS` / `NODO_CON_DEPENDENCIAS` / `CONFIGURACION_CON_DEPENDENCIAS` | No puede cerrarse/retirarse con dependencias vivas | C |
| `TECNICO_FUERA_DE_AMBITO` / `DESTINATARIO_SIN_PERMISO` | La persona no tiene membresía/permiso en el ámbito requerido | C |
| `DELEGACION_NO_PERMITIDA` | La política del tenant no permite delegar ese rol | N |
| `NOTIFICACION_OBLIGATORIA` | La notificación crítica no puede desactivarse | N |
| `EXPORTACION_EXCEDE_AMBITO` | La exportación pide más de lo que el actor puede ver | N |

## 3. Configuración (ETS-005)

| Código | Significado | Tipo |
|---|---|---|
| `VALIDACION_CONFIGURACION_FALLIDA` | El borrador no pasa validación (referencias, permisos, simulación) | C |
| `PLANTILLA_INVALIDA` | La plantilla referenciada no está vigente ni en vuelo | C |
| `VERSION_CONFIGURACION_RETIRADA` | Se intentó iniciar trabajo con una versión retirada (lo en vuelo continúa) | C |
| `PAQUETE_INCOMPATIBLE` | Paquete de import incompatible con el ámbito destino | C |
| `FUNCION_NO_HABILITADA` | Feature flag apagado para el tenant/ámbito | N |
| `LIMITE_LICENCIA` / `LIMITE_DISPOSITIVOS` | Cuota de licencia alcanzada | N |

## 4. Offline y sincronización (`12_SYNC_API.md`)

| Código | Significado | Tipo |
|---|---|---|
| `COMANDO_RECHAZADO_NEGOCIO` | El comando de la bitácora violó una regla al validarse a tiempo de negocio (el motivo específico acompaña) | N (a bandeja de atención del dispositivo) |
| `COMANDO_EN_REVISION` | El conflicto requiere decisión humana (tabla ETS-006/14) | R (se resuelve en bandeja) |
| `MEMBRESIA_VENCIDA_AL_HECHO` | El actor no tenía membresía vigente cuando ocurrió el hecho | N |
| `IDENTIDAD_PROVISIONAL_DESCONOCIDA` | Referencia a identidad provisional no incluida ni mapeada | C |
| `SECUENCIA_INVALIDA` | Hueco o retroceso en la secuencia del dispositivo | C (re-sincronizar) |
| `PAQUETE_DESACTUALIZADO` | El cursor del paquete es demasiado viejo; requiere descarga base | C |
| `DISPOSITIVO_REVOCADO` | El dispositivo fue revocado; la cola local se conserva para entrega tras re-registro | C |

## 5. Archivos (`11_FILE_API.md`)

| Código | Significado | Tipo |
|---|---|---|
| `TIPO_NO_PERMITIDO` / `TAMANO_EXCEDIDO` | Fuera de los límites configurados | C |
| `ARCHIVO_CORRUPTO` | La huella no coincide con lo declarado | C (re-subir) |
| `MALWARE_DETECTADO` | Exploración positiva; archivo en cuarentena, evento de seguridad | N |
| `ACCESO_FIRMADO_VENCIDO` | La URL firmada expiró | C (pedir otra) |
| `PARTE_FALTANTE` | Subida por partes incompleta | C (reanudar) |

## 6. Integraciones e IoT

| Código | Significado | Tipo |
|---|---|---|
| `DISPOSITIVO_NO_REGISTRADO` | Credencial IoT desconocida o inactiva | C |
| `URL_NO_VERIFICADA` | El destino del webhook no respondió el reto de verificación | C |
| `SUSCRIPCION_SUSPENDIDA` | Webhook suspendido por fallo persistente (reactivable) | C |
| `MAPEO_INVALIDO` | El mapeo declarativo no resuelve el dato (a bandeja) | C |
| `CUENTA_SERVICIO_REVOCADA` | Credencial de integración revocada | N |
| `ELEMENTO_YA_PROCESADO` | Reproceso sobre elemento ya resuelto (idempotencia) | — |
| `INTEGRACION_ENTORNO_INCORRECTO` | Credencial/endpoint de otro entorno (bloqueo estructural, ETS-007/08 §6) | N |

## 7. IA (`14_AI_API.md`)

| Código | Significado | Tipo |
|---|---|---|
| `CAPACIDAD_IA_DESHABILITADA` | La capacidad no está activa para el tenant/ámbito (flag) | N |
| `SUGERENCIA_VENCIDA` | La sugerencia ya no es vigente (el mundo cambió) | N |
| `CONTEXTO_INSUFICIENTE` | La IA no alcanza datos suficientes en el alcance del asistido para responder con fundamento (respuesta honesta, no inventada) | N |
| `PRESUPUESTO_IA_AGOTADO` | Cuota de uso IA del tenant agotada | R (al reiniciar ciclo) |
| `PROVEEDOR_IA_NO_DISPONIBLE` | El modelo externo no responde — degradación explícita, jamás sustituto silencioso (ETS-007/09 §8) | R |

## 8. Infraestructura (5xx — la plataforma lo dice y lo mide)

| Código | Significado | Tipo |
|---|---|---|
| `ERROR_INTERNO` | Fallo no anticipado; correlación registrada y alertada (`10_OBSERVABILITY` ETS-007) | R |
| `DEPENDENCIA_NO_DISPONIBLE` | Dependencia interna caída (almacén, bus); degradación selectiva aplica (ETS-006/15) | R |
| `SERVICIO_EN_MANTENIMIENTO` | Ventana anunciada; cabecera indica duración estimada | R |
| `TIEMPO_AGOTADO` | La operación superó su presupuesto; el estado real es consultable (no asumir éxito ni fallo: verificar con la clave de idempotencia) | R |

---

**Gobierno del catálogo:** agregar un código es aditivo (permitido); cambiar el significado de uno, prohibido; los clientes deben tratar códigos desconocidos por su clase HTTP y su indicador `reintentable` (tolerancia del lector aplicada a errores).
