# 06_REQUEST_RESPONSE_STANDARDS.md

> **DeltaOps — ETS-008 · v1.0** · Estándares de petición y respuesta: sobre, metadatos, errores, advertencias, validación, paginación, enlaces, correlación y localización.
> Los esquemas se describen conceptualmente (sin JSON literal, por mandato de ETS-008).
> Documento de diseño. No implementa nada.

---

## 1. Petición (request)

### Comandos
Cuerpo = **la intención completa**, en lenguaje ubicuo:
- Datos del hecho (qué pasó / qué se quiere), con `fechaNegocio` cuando el hecho ocurrió antes de registrarse (offline, correcciones).
- Referencias por identificador opaco (o identidad provisional del dispositivo en sync — `12`).
- Versión conocida de la entidad cuando el comando edita (concurrencia optimista, `02` §9).
- Nada de campos de auditoría enviados por el cliente (autor, tenant, fechaRegistro los pone el servidor — el cliente no se auto-atribuye nada).
- La clave de idempotencia va en cabecera, no en el cuerpo (`02` §2).

### Consultas
Todo por parámetros de consulta: filtros declarados, `ordenar` (campo con `-` para descendente), `cursor` y `tamano` para paginar, `buscar` para texto simple. Sin cuerpos en GET.

## 2. Sobre de respuesta (envelope)

Toda respuesta exitosa comparte la misma estructura conceptual:

```text
RESPUESTA
├── datos          la representación (objeto o lista de la página)
├── metadatos      (§3)
├── advertencias   (§5) — opcional
└── enlaces        (§7) — opcional
```

Los errores usan un sobre distinto y excluyente (§4): una respuesta es éxito con datos o error con problema — jamás "200 con error adentro".

## 3. Metadatos

| Campo conceptual | Contenido |
|---|---|
| `idCorrelacion` | Siempre (eco de `02` §5) |
| `frescura` | En consultas: momento del dato servido (ETS-006 — la API no finge actualidad) |
| `paginacion` | En listas: cursor siguiente (opaco), tamaño devuelto, indicador de más-páginas; total exacto solo si el read model lo precalcula (`01` §14) |
| `version` | En representaciones individuales: versión de la entidad (coincide con ETag) |
| `contexto` | Contexto organizacional bajo el que se resolvió la respuesta |
| `marcasIA` | Cuando algún contenido fue asistido por IA: marcado explícito (U-40) |

## 4. Errores

Sobre único de problema, con:

| Campo | Contenido |
|---|---|
| `codigo` | Código estable del catálogo (`07_ERROR_CATALOG.md`) — jamás cambia de significado |
| `mensaje` | Texto en lenguaje de negocio, localizado (`Accept-Language`) |
| `accionSugerida` | Qué puede hacer el actor (cuando existe una salida) |
| `detalles` | Para validación: lista por campo (§6); para conflictos: la representación actual |
| `idCorrelacion` | Siempre — el usuario lo reporta, soporte lo rastrea extremo a extremo |
| `reintentable` | Indicador honesto: ¿reintentar puede funcionar? (los SDK lo obedecen) |

Reglas: sin trazas técnicas ni jerga interna; el estado HTTP acompaña coherentemente (4xx: el cliente debe cambiar algo; 5xx: la plataforma falló y lo dice); los errores de negocio explican la **regla**, no el síntoma ("la OT no puede cerrarse: faltan las evidencias exigidas por su tipo", no "constraint violation").

## 5. Advertencias (warnings)

Un comando puede **aceptarse con advertencias**: hechos aceptados que merecen atención sin ser rechazo (tanqueo aceptado pero rendimiento anómalo detectado; lectura aceptada cerca del límite de rango). Lista de advertencias con código estable + mensaje localizado. Las advertencias jamás sustituyen un rechazo debido: lo inválido se rechaza (`07`), lo sospechoso se acepta-y-vigila (coherente con validación dual ETS-006/17).

## 6. Validación

- **Completa, no al primer error:** la respuesta de `VALIDACION_FALLIDA` lista **todos** los campos con problema (campo, código, mensaje, valor esperado conceptual) — un formulario se corrige en una pasada (U-13).
- Las reglas de validación provienen de las definiciones declarativas (formularios ETS-005/03): cliente y servidor validan **las mismas reglas**; el servidor es la autoridad.
- Validación semántica de negocio con el mismo formato (la capacidad excedida es un error de campo `cantidad` con código `CAPACIDAD_EXCEDIDA`).

## 7. Enlaces (links)

Enlaces conceptuales de navegación en las representaciones, al servicio del drill-down (U-05, ≤3 clics):
- Toda entrada de lista enlaza su detalle; todo hecho enlaza su expediente y su línea de tiempo; todo costo enlaza el hecho que lo originó; toda sugerencia IA enlaza su trazabilidad.
- Las operaciones asíncronas (`202`) enlazan su recurso de operación.
- Los enlaces respetan permisos: no se enlaza lo que el actor no podría abrir.

## 8. Correlación

`idCorrelacion` en toda petición y respuesta (eco o generado), presente en el sobre de error, propagado a eventos, reglas, notificaciones y webhooks (ETS-007/10 §4). Es el identificador que une la experiencia del usuario con el diagnóstico de la plataforma: **ninguna respuesta sin él.**

## 9. Localización

- Mensajes y advertencias localizados por `Accept-Language` (español por defecto); códigos, identificadores y valores canónicos, invariantes.
- Fechas siempre UTC ISO-8601 en el intercambio; el cliente presenta en la zona del actor (`02` §8).
- Etiquetas de catálogos y atributos dinámicos llegan localizadas según la configuración del tenant (ETS-005/13); el valor canónico acompaña siempre a la etiqueta.
