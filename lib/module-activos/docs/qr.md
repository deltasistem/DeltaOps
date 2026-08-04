# Etiquetas QR / Barcode / NFC (DGP-008.3)

La identificación de activos **delega** en el servicio de plataforma
`platform.qr` (etiquetas con tipos, validación, resolución y acciones). El
módulo no genera imágenes ni gestiona hardware: la etiqueta apunta a un
`entityRef` opaco (`activo:<id>`).

## Emitir: `POST /deltaops/activos/:id/qr`

Comando `qr-emitir` (permiso `modulo.activos.write`). **Idempotente por
activo+tipo**: si ya existe una etiqueta **activa** de ese tipo para el activo,
la reutiliza (no reemite). Delega en `platform.qr.issue`.

Request (body opcional):

```jsonc
{ "tipo": "qr" }   // "qr" (por defecto) | "barcode" | "nfc"
```

Response:

```jsonc
{ "activoId": "…", "id": "…", "codigo": "DOP-3F2A9C11", "tipo": "qr", "reutilizada": false }
```

`barcode`/`nfc` quedan **preparados** (mismos endpoints aceptan `tipo`); no hay
UI de hardware en esta entrega.

## Resolver: `GET /deltaops/activos/qr/resolver?codigo=`

Query `qr-resolver` (permiso `modulo.activos.read`). Es una **consulta sin
efectos**: usa `platform.qr.list` y filtra por código **activo** (no usa
`platform.qr.resolve`, que es un comando que registraría el escaneo). Devuelve el
`activoId` para navegación directa:

```jsonc
{ "activoId": "…", "codigo": "DOP-3F2A9C11", "tipo": "qr", "acciones": ["open"] }
```

- `404` si el código **no existe** o la etiqueta fue **revocada** (sólo se
  resuelven etiquetas en estado `active`).
- `404` si el `entityRef` de la etiqueta no apunta a un activo (`activo:*`).

## Detalle del activo

`GET /deltaops/activos/:id` (query `detalle`) incluye la etiqueta vigente si
existe (mejor esfuerzo: un fallo del servicio de QR no impide devolver el
detalle):

```jsonc
{ "...activo": "...", "etiqueta": { "id": "…", "codigo": "DOP-3F2A9C11", "tipo": "qr" } }
```

`etiqueta` es `null` cuando el activo aún no tiene código emitido.

## Permisos y tenant

`platform.qr.read` / `platform.qr.write` (incluidos en los roles lector y
operador del API server). El aislamiento por tenant lo garantiza `platform.qr`
(el store de etiquetas es tenant-scoped).
