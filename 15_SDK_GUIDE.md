# 15_SDK_GUIDE.md

> **DeltaOps — ETS-008 · v1.0** · Guía del SDK oficial: cómo deberá construirse para JavaScript/TypeScript, Python, .NET y móvil.
> Documento de diseño. No implementa nada.

---

## 1. Principios del SDK

1. **Generado desde el contrato:** los SDK nacen de la especificación publicada (`16_OPENAPI_GUIDELINES.md`) — la cobertura es total y la deriva imposible; el código manual del SDK es solo la capa de ergonomía y transporte común.
2. **Los cuatro SDK se comportan igual:** misma semántica de reintentos, idempotencia, errores y paginación en todos los lenguajes; cambiar de lenguaje no cambia el modelo mental.
3. **El SDK habla el lenguaje ubicuo:** operaciones y modelos con los nombres del catálogo (`crearActivo`, `cerrarOT`, `ConsultarHojaVida`) — nunca envolturas genéricas tipo "post(path, body)".
4. **El SDK jamás oculta la verdad:** frescura declarada, advertencias, marcas de IA y estados de operación asíncrona se exponen tal cual; ninguna comodidad la sacrifica.

## 2. Comportamientos obligatorios (todos los SDK)

| Comportamiento | Regla |
|---|---|
| **Idempotencia automática** | El SDK genera la clave de idempotencia por comando (y permite fijarla); los reintentos reutilizan la misma clave |
| **Reintentos** | Automáticos solo en errores `reintentable=R` (`07`), con espera creciente + variación aleatoria y respeto de `X-Limite-*` y esperas sugeridas; jamás reintenta N |
| **Paginación** | Iteradores/streams idiomáticos que recorren cursores transparentemente; el cursor crudo también accesible |
| **Errores tipados** | Excepciones/resultados por clase de error con el código estable, mensaje localizado, detalles de validación por campo, correlación y `reintentable`; códigos desconocidos degradan por clase HTTP (tolerancia del lector) |
| **Operaciones asíncronas** | Ayudante de espera con sondeo del recurso de operación (`202` → resultado o error), con tiempo máximo configurable |
| **Autenticación** | Manejo del par acceso/refresco con rotación automática y almacenamiento delegado a la aplicación (el SDK no persiste secretos por su cuenta); cuentas de servicio y API keys de primera clase |
| **Contexto** | Contexto activo configurable por cliente y sobrescribible por llamada (cabecera `X-Contexto`) |
| **Correlación** | Genera y expone `X-Id-Correlacion`; permite inyectarlo para hilarlo con la telemetría del cliente |
| **Archivos** | Ayudantes de subida/descarga firmada con partes y reanudación (`11`) integrados |
| **Webhooks** | Ayudante de verificación de firma + deduplicación por idEvento (`10`) |
| **Compatibilidad** | El SDK declara la versión de API que cubre; tolera campos nuevos sin romperse |

## 3. Por lenguaje

### JavaScript / TypeScript
- **TypeScript primero:** tipos completos generados del contrato (modelos, comandos, errores, eventos); JavaScript lo consume sin tipos.
- Un solo paquete isomórfico (navegador y servidor) con el transporte inyectable; promesas nativas; iteradores asíncronos para paginación.
- Es el SDK que consumen el frontend web propio y las extensiones — el producto come su propia cocina.

### Python
- Cliente síncrono y asíncrono con la misma superficie; modelos tipados (anotaciones completas); iteradores para paginación.
- Orientado a ciencia de datos e integraciones: ayudantes para volcar consultas/marts a estructuras tabulares con el diccionario de datos adjunto.

### .NET
- Idiomático C# (async/await, tipos anulables estrictos, inyección de dependencias estándar); paquete firmado.
- Orientado al ecosistema corporativo (integraciones con ERP y servicios Windows on-premise del tenant).

### Móvil
- La app móvil propia usa el SDK TypeScript **más la capa offline** (cola local, bitácora, paquetes — `12`), que es parte del producto, no del SDK público.
- Para terceros móviles: el SDK público estándar (la sincronización offline de terceros no es contrato público en v1; capturan vía API con sus propias colas si lo necesitan).

## 4. Versionado y soporte del SDK

- Versionado semántico propio, mapeado a la versión de API que cubre; regla N/N-1 heredada (`17`).
- Los cambios aditivos de la API generan SDK menor automático; los breaking de API, SDK mayor con guía de migración.
- Ejemplos ejecutables por caso de uso frecuente (crear solicitud, cerrar OT, registrar tanqueo, consumir webhooks) mantenidos como parte de la documentación viva (`16` §5).
