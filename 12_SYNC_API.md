# 12_SYNC_API.md

> **DeltaOps — ETS-008 · v1.0** · Contratos de sincronización móvil: bitácoras, paquetes, conflictos y versiones.
> La arquitectura offline está en ETS-007/06 y la estrategia de datos en ETS-006/14; aquí, el contrato del protocolo.
> Documento de diseño. No implementa nada.

---

## 1. Actores y garantías del contrato

- Actor: **dispositivo registrado** (`08` §7) de un usuario con sesión válida al sincronizar.
- Garantías: **cero pérdida de capturas** (U-16), idempotencia extremo a extremo (U-19), validación a **tiempo de negocio**, conflictos resueltos por reglas de dominio en el servidor — el dispositivo reporta, nunca arbitra.
- Toda petición de sync lleva `X-Version-Protocolo` (triple versión: protocolo, paquete de configuración, esquema de read models — `02` §2); el servidor soporta N/N-1 (`PROTOCOLO_NO_SOPORTADO` fuera de eso).

## 2. Registro de dispositivo

`POST /sync/dispositivos` — asocia el dispositivo al usuario (límite por licencia), emite credencial local y cursor inicial. Revocación administrativa inmediata (`DISPOSITIVO_REVOCADO`); la cola local legítima se conserva y entrega tras re-registro verificado.

## 3. Paquete de alcance (bajada)

`GET /sync/paquete?cursor=...`

- **Contenido:** read models del alcance del usuario (mis OTs, activos de mis contextos, catálogos, plantillas y configuración **ya resuelta** por la cascada — el dispositivo no re-implementa herencia, ETS-007/05 §4), cada bloque con su versión.
- **Delta por cursor:** solo lo cambiado desde la última bajada; comprimido; descargable por tramos (reanudable).
- `PAQUETE_DESACTUALIZADO`: cursor demasiado viejo → descarga base completa (el servidor lo decide, el dispositivo obedece).
- El paquete respeta permisos al momento de armarlo; membresías vencidas recortan el próximo paquete (y la validación de subida protege el resto).

## 4. Bitácora (subida)

`POST /sync/bitacora` — lote de comandos capturados offline, **en orden de secuencia local**:

```text
Por comando: tipo (del catálogo `03`, columna Offline=Sí) + datos +
  claveIdempotencia (dispositivo+secuencia) + fechaNegocio + contexto local
  + versiones de configuración usadas + identidades provisionales
  + referencias a evidencias (pendientes de subir o ya subidas)

Respuesta POR COMANDO (el lote es transporte, no transacción):
  CONFIRMADO      folio definitivo + mapa identidadProvisional→definitiva
  RECHAZADO       COMANDO_RECHAZADO_NEGOCIO + motivo específico (`07`)
                  → bandeja de atención del dispositivo, hecho conservado
  EN REVISIÓN     COMANDO_EN_REVISION → bandeja humana del supervisor;
                  el dispositivo lo muestra como "en revisión"
```

- **Idempotencia absoluta:** reenviar el lote entero es seguro; lo ya procesado responde su resultado original (`DUPLICADO_IDEMPOTENTE`).
- `SECUENCIA_INVALIDA` (hueco/retroceso): el servidor indica desde qué secuencia re-entregar.
- El dispositivo solo poda lo **confirmado y con evidencias subidas** (ETS-007/06 §2).

## 5. Evidencias

Referencias viajan en la bitácora; binarios por el contrato de archivos (`11` §6: partes, reanudación), priorizados tras los comandos y sensibles a la red (las grandes pueden esperar mejor conexión según política del tenant). El hecho es válido con evidencia "pendiente"; su estado es visible hasta completarse.

## 6. Conflictos

- **Los resuelve el dominio en el servidor** según la tabla ETS-006/14: los hechos concurrentes coexisten (dos lecturas son dos hechos); las decisiones concurrentes se resuelven por regla (primera válida gana / estado de mayor autoridad / a revisión humana).
- El resultado le llega al dispositivo como respuesta por comando (§4) y, si otro actor fue afectado, como notificación (U-38: quien capturó se entera del destino de su captura).
- El contrato **no tiene "forzar sobrescritura"**: no existe comando para pisar la historia (append-only).

## 7. Estado de sincronización

`GET /sync/estado` — pendientes, última sync, elementos en atención/revisión, versiones vigentes del dispositivo. Es la fuente del indicador visible del móvil (en línea / sin señal / N pendientes, ETS-004/06) y del panel de soporte por ámbito (`04` §8).

## 8. Versionado del protocolo

- N/N-1 mínimo en las tres versiones; una actualización del servidor jamás deja mudo a un dispositivo en campo (ETS-007/06 §6).
- Hechos capturados con configuración vieja: válidos (en vuelo termina con su versión, ETS-005); el paquete siguiente actualiza.
- Versiones mínimas anunciadas con antelación; un dispositivo fuera de soporte conserva su cola intacta y sincroniza tras actualizar.
