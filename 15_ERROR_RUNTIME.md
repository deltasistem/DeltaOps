# 15 — Gestión de Errores en Runtime

> **DeltaOps — ESI-003 · v1.0** · Un catálogo, una frontera de traducción, cero fugas de detalle interno.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Arquitectura de errores

DeltaOps distingue tres familias, ya definidas conceptualmente en ETS-011; aquí se diseña su runtime:

| Familia | Origen | Tratamiento |
|---|---|---|
| **Errores de negocio** | Invariantes, Policies, estados inválidos | Esperados: se catalogan, se traducen a respuesta 4xx con código estable y mensaje en español |
| **Errores de solicitud** | Validación de entrada, autenticación, autorización, capacidad | Esperados: respuesta 4xx canónica según su tipo (400/401/403/404/409/422) |
| **Fallos técnicos** | Bugs, infraestructura caída, dependencias externas | Inesperados: respuesta 500 genérica, detalle completo solo en logs y observabilidad |

## 2. El catálogo canónico

1. Todo error de negocio y de solicitud tiene **código estable del catálogo del Kernel** (doc 04), en español, versionado con el producto. El código es contrato: la UI y las integraciones dependen de él (ETS-008).
2. La entrada de catálogo define: código, familia, estatus HTTP, mensaje plantilla en español y campos estructurados permitidos.
3. Los módulos **lanzan errores canónicos**; jamás construyen respuestas HTTP ni inventan códigos ad hoc.

## 3. La frontera de traducción

1. El manejador de errores del borde (doc 10, paso 7) es **el único lugar** donde un error se convierte en respuesta HTTP. En workers, la tubería equivalente decide reintento o bandeja muerta (docs 19/22).
2. Traducción por familia: negocio/solicitud → respuesta canónica con código, mensaje y correlación; técnico → 500 opaco con solo el identificador de correlación para soporte.
3. **Nada interno se filtra**: ni trazas de pila, ni sentencias SQL, ni rutas de archivos, ni versiones de librerías, ni existencia de recursos de otros tenants (un recurso ajeno responde como inexistente, ETS-009).
4. Todo fallo técnico se registra completo (doc 16) y cuenta en métricas (doc 17); los errores de negocio se registran como información, no como alarma.

## 4. Reglas normativas

1. **Sin silenciamiento**: prohibido capturar y tragar errores; quien captura, o resuelve significativamente o relanza. La regla es de revisión obligatoria (ESI-002/25).
2. **Sin fallbacks silenciosos**: ante dependencia caída se falla explícito o se degrada anunciándolo (doc 03); jamás se devuelven datos inventados o parciales sin marca.
3. **La validación de entrada ocurre en el borde de la pieza** con los contratos de ETS-008; el dominio recibe datos ya bien formados y solo valida negocio.
4. **Los mensajes son para humanos en español**; los códigos son para máquinas; ninguno contiene datos sensibles.
5. **Errores de concurrencia** (bloqueo optimista, ETS-009) tienen código canónico propio y la UI sabe ofrecer reintento; no se disfrazan de 500.

## Impacto sobre la implementación

El DGP del Kernel incluye el catálogo y las familias; el DGP de plataforma, la frontera de traducción HTTP y de workers. La plantilla T01 (ESI-002/18) nace lanzando errores canónicos.

## Dependencias

Docs 04, 10, 16, 17 y 19; ETS-008 (contrato de error), ETS-009 (concurrencia y tenancy), ETS-011 (familias).

## Riesgos

- Proliferación de códigos casi idénticos; mitigación: el catálogo tiene dueño (ESI-002/27) y las altas pasan revisión.
- Fugas de detalle por manejadores locales improvisados; mitigación: prohibición de construir respuestas fuera de la frontera, verificada en revisión.

## Decisiones habilitadas

- Contrato de error estable para UI e integraciones.
- Alertas de observabilidad basadas en familias (técnico ≠ negocio).

## Decisiones bloqueadas

- Prohibido construir respuestas de error fuera de la frontera única.
- Prohibidos códigos de error fuera del catálogo.
- Prohibido exponer detalle interno en cualquier respuesta.
