# 02_API_STANDARDS.md

> **DeltaOps — ETS-008 · v1.0** · Estándares y convenciones completas de la API pública.
> Documento de diseño. No implementa nada.

---

## 1. Rutas

```text
/api/v{N}/{recurso}[/{id}][/{sub-recurso}][/{accion}]
```

| Regla | Ejemplo |
|---|---|
| Versión mayor al inicio | `/api/v1/activos` |
| Recursos: sustantivos plurales, minúsculas, guion como separador | `/ordenes-trabajo`, `/centros-costo` |
| Identificadores opacos en la ruta | `/activos/{idActivo}` |
| Sub-recursos solo por subordinación real | `/activos/{id}/hoja-vida`, `/ordenes-trabajo/{id}/expediente` |
| Acciones de dominio como sub-recurso de intención (POST) | `/ordenes-trabajo/{id}/cierre`, `/activos/{id}/traslado` |
| Filtros, orden y paginación por parámetros de consulta | `?estado=abierta&ordenar=-fechaCreacion&cursor=...` |
| Sin verbos en recursos, sin extensiones, sin mayúsculas | — |

## 2. Cabeceras estándar

### De petición

| Cabecera | Obligatoria | Contenido |
|---|---|---|
| `Authorization` | Sí (salvo login) | Token de acceso portador (`08_SECURITY_CONTRACTS.md`) |
| `X-Contexto` | Sí en comandos; opcional en consultas (por defecto: contexto de la sesión) | Identificador del contexto organizacional activo (sede/operación/proyecto/centro de costo) — validado contra membresías (ETS-007/05) |
| `X-Clave-Idempotencia` | Sí en todo comando | Clave única de la intención; en móvil: dispositivo+secuencia |
| `X-Id-Correlacion` | Recomendada | Identificador de correlación del cliente; si falta, el borde lo genera (ETS-007/10 §4) |
| `Accept-Language` | Recomendada | Localización de textos (`es` por defecto; los códigos jamás se traducen) |
| `X-Zona-Horaria` | Recomendada | Zona del actor para interpretación de fechas locales en presentación; **el intercambio siempre es UTC** (ver §8) |
| `X-Version-Protocolo` | Solo sync móvil | Triple versión del protocolo offline (`12_SYNC_API.md`) |

Nota: el **tenant no viaja en cabecera editable** — está firmado dentro del token (ETS-007/12 §1); cualquier discrepancia es rechazo inmediato.

### De respuesta

| Cabecera | Contenido |
|---|---|
| `X-Id-Correlacion` | Eco del identificador (o el generado) — toda respuesta es rastreable |
| `X-Frescura` | Para consultas: momento del dato servido (frescura declarada, ETS-006) |
| `X-Limite-*` | Presupuesto de rate limit: límite, restante, reinicio (§6) |
| `ETag` | Versión de la representación (§9) |
| `Deprecation` / `Sunset` | En endpoints en retiro: aviso y fecha (`17_API_GOVERNANCE.md`) |

## 3. Autenticación

- Token de acceso portador en `Authorization`, corto, verificado en cada petición (firma, expiración, tenant, vigencia de sesión — ETS-007/12).
- Cuentas de servicio y API keys para integraciones, dispositivos IoT con credencial individual (`08_SECURITY_CONTRACTS.md`).
- Sin autenticación por parámetros de consulta, jamás (los URLs se registran en logs).

## 4. Tenant y contexto

1. **Tenant:** implícito y firmado en la credencial; invisible en rutas y parámetros; toda respuesta pertenece al tenant del token — sin excepciones ni "modo cross-tenant".
2. **Contexto activo:** toda ejecución corre en un contexto validado (ETS-007/05 §2); los comandos lo registran como parte del hecho; las consultas recortan por él. Cambiar de contexto = cambiar la cabecera (validación por petición), no re-autenticar.

## 5. Trazabilidad

- **Id de correlación:** nace en el cliente o en el borde; viaja por comandos, eventos, reglas, notificaciones y webhooks; se devuelve siempre — es la llave del diagnóstico extremo a extremo (ETS-007/10 §4) y **se incluye en todo reporte de error** (`06`).
- **Id de traza técnica:** interno de la plataforma (muestreo); el cliente solo necesita la correlación.

## 6. Rate limit

- Por capas: sesión, cuenta de servicio, tenant (ETS-007/12 §4); presupuestos distintos por costo (login estricto, lecturas generosas, comandos moderados, ingesta por cola).
- Presupuesto visible en cabeceras; al exceder: respuesta estándar `LIMITE_EXCEDIDO` (`07`) con espera sugerida — el cliente educado se auto-regula.
- Los SDK oficiales reintentan con espera creciente automáticamente (`15_SDK_GUIDE.md`).

## 7. Tiempo de respuesta

- Presupuestos por clase de operación, derivados de ETS-004/11 y medidos en producción (ETS-007/10 §3): captura de hechos y consultas de bandeja en fracciones de segundo; consultas analíticas declaran su costo; lo que no puede ser rápido es asíncrono declarado (`01` §13).
- La lentitud sostenida es un defecto medible, no una condición aceptada.

## 8. Localización y tiempo

| Regla | Detalle |
|---|---|
| Textos localizados, códigos estables | `Accept-Language` gobierna mensajes; códigos de error y catálogos técnicos jamás cambian |
| **Todo intercambio en UTC**, formato ISO-8601 con zona explícita | La presentación local es del cliente (con `X-Zona-Horaria` como pista) |
| Tiempo doble siempre | Los hechos llevan `fechaNegocio` (cuándo ocurrió) y `fechaRegistro` (cuándo lo supo el sistema) — ETS-006; las consultas declaran contra cuál filtran |
| Formatos regionales (moneda, números) | Configuración del tenant (ETS-005/12); la API intercambia valores canónicos, el cliente presenta |

## 9. Cache y ETags

- Consultas cacheables declaran su política (frescura declarada + validación); `ETag` en representaciones individuales: el cliente revalida barato (`If-None-Match` → sin cambios = respuesta vacía de confirmación).
- **Concurrencia optimista:** los comandos de edición sobre entidades versionadas envían la versión conocida (`If-Match`/campo de versión); si el mundo cambió: `CONFLICTO_VERSION` con la representación actual — el actor decide con información (coherente con la mecánica de conflictos ETS-006/14).
- Nada sensible en caches compartidos: directivas privadas por defecto; los estáticos inmutables van por CDN con huella (ETS-007/14).

## 10. Compresión

- Compresión de respuestas negociada y activada por defecto sobre umbral de tamaño; lotes de sincronización móvil comprimidos siempre (ETS-007/06 §5).
- Subida de archivos: el binario no atraviesa la API (va directo al almacén firmado, `11_FILE_API.md`); los comandos permanecen livianos.
