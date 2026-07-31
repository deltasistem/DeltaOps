# 14_OFFLINE_SYNCHRONIZATION.md

> **DeltaOps — ETS-006 · v1.0** · Sincronización offline: conflictos, resolución, versionado, sincronización y reintentos.
> Complementa `06_MOBILE_FIRST.md` (ETS-004) definiendo la estrategia de datos que la sostiene.
> Documento de diseño. No implementa nada.

---

## 1. Modelo mental

El dispositivo de campo no es un "cliente sin señal": es un **nodo productor de hechos** con derecho propio. El dato nace local, completo y válido; la nube lo confirma después. Pérdida de datos capturados: **cero** (U-16).

## 2. Qué vive en el dispositivo

| Contenido | Dirección | Nota |
|---|---|---|
| Paquete de alcance (read model móvil, → `12_READ_MODELS.md`) | Descarga | Mis OTs, activos de mi frente, catálogos, formularios y workflows vigentes, stock básico |
| Paquete de configuración con versión declarada | Descarga | El dispositivo sabe qué versiones tiene (ETS-006/04) |
| **Bitácora local de hechos** (outbox) | Subida | Cola append-only de comandos capturados offline, cifrada, persistente a cierres y reinicios |
| Evidencias pendientes (fotos, firmas) | Subida diferida | El hecho viaja primero; las evidencias, cuando la red lo permita |

## 3. El viaje de un hecho nacido offline

```text
1. CAPTURA    validación local completa (formulario vigente en el dispositivo),
              identidad provisional local + clave de idempotencia,
              tiempo de negocio del momento real
2. ENCOLADO   a la bitácora local (sobrevive a todo; U-16)
3. SINCRONIZACIÓN  automática al volver la señal, por orden de captura;
              manual nunca requerida (U-17 solo informa)
4. CONFIRMACIÓN  el agregado valida invariantes y permisos → folio definitivo;
              el dispositivo reconcilia identidad provisional → definitiva
5. RECHAZO    (raro) → bandeja local "requiere atención" con explicación de
              negocio; el dato NUNCA se descarta solo
```

## 4. Conflictos y resolución

La estrategia minimiza conflictos por diseño: los hechos append-only **no chocan** — dos tanqueos del mismo activo no son conflicto, son dos hechos. Los conflictos reales son pocos y tienen regla:

| Conflicto | Resolución |
|---|---|
| Doble envío del mismo hecho (reintento, doble toque) | Idempotencia por clave de origen: se registra una vez (U-19) |
| Lectura de medidor que quedó incoherente al llegar tarde (otra mayor ya entró) | El hecho se acepta con su tiempo de negocio; el motor recalcula la serie y marca la anomalía para revisión si viola monotonía (evento compensatorio si procede) |
| Dos técnicos avanzan la misma OT sin señal | Los avances son hechos aditivos: ambos entran. Si ambos intentan la **misma transición** de estado, gana la primera confirmada; la segunda se rechaza con explicación y el trabajo capturado se re-adjunta a la OT en su estado real |
| El objeto cambió mientras el dispositivo estaba offline (OT cancelada) | El comando tardío se rechaza con motivo de negocio; lo capturado queda disponible para re-imputar (nada se pierde) |
| Configuración nueva publicada mientras se capturaba | Válido: el hecho entra con la versión que usó (lo en vuelo termina con su versión, ETS-005) |
| Asignación/permiso vencido entre captura y sincronización | Se evalúa con la vigencia del **tiempo de negocio** del hecho: si era válido cuando ocurrió, entra; queda marcado para visibilidad del supervisor |

**Principio:** la resolución es **por reglas de dominio, nunca "gana el último"** ni fusiones silenciosas de campos. Cuando el dominio no puede decidir, decide un humano en una bandeja explícita.

## 5. Versionado y reintentos

1. **Todo intercambio declara versiones:** del paquete de configuración, de los read models y del protocolo de sincronización — dispositivos rezagados sincronizan igual y se actualizan después.
2. **Delta-sincronización:** solo cambios desde el último cursor, en ambas direcciones; las descargas grandes (paquete inicial) son reanudables.
3. **Reintentos con espera creciente y sin límite de abandono** para la bitácora local: los hechos esperan días si hace falta; solo alertan al usuario si algo requiere su atención.
4. **Prioridad de subida:** hechos primero (pequeños, valiosos), evidencias después, por red disponible (3G basta para operar — U-26).
5. **Higiene local:** lo confirmado y con evidencias subidas se limpia del dispositivo según su política (espacio), quedando siempre lo necesario para operar.

## 6. Visibilidad y confianza

- Estado permanente y honesto: en línea / sin señal / N pendientes / atención requerida (U-17).
- El supervisor ve qué hechos de su frente llegaron tarde (transparencia del offline, sin castigo — llegar tarde es normal en campo).
- La analítica marca los periodos con sincronización pendiente relevante ("datos de campo incompletos al corte") en lugar de fingir completitud.
