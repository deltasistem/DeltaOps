# 10_WEBHOOK_CONTRACTS.md

> **DeltaOps — ETS-008 · v1.0** · Contratos de webhooks salientes: suscripción, seguridad, firmas, reintentos, payload y versionado.
> Documento de diseño. No implementa nada.

---

## 1. Modelo

El tenant se suscribe a eventos del catálogo (`09`) y DeltaOps los entrega firmados a la URL del suscriptor. El webhook es un **consumidor externo** con las mismas garantías que uno interno: al-menos-una-vez, orden por agregado, deduplicación por idEvento a cargo del receptor.

## 2. Suscripción

- Por Admin de Integraciones (`03` §15): tipos de evento + filtros (ámbito organizacional, atributos declarados del tipo) + URL de destino + versión de esquema aceptada.
- **Verificación de propiedad obligatoria:** al crear/cambiar URL, DeltaOps envía un reto que el destino debe responder (`URL_NO_VERIFICADA` si falla) — nadie apunta webhooks a servidores ajenos.
- Solo destinos cifrados (HTTPS); listas de bloqueo de plataforma (no se entrega a direcciones internas/reservadas).
- El alcance de la suscripción ≤ alcance de quien la crea; los eventos entregados se recortan por ese ámbito **siempre** (un webhook jamás ve otro tenant ni otro ámbito).

## 3. Entrega

```text
POST {url del suscriptor}
Cabeceras:
  X-DeltaOps-Firma         firma del cuerpo con el secreto de la suscripción
  X-DeltaOps-IdEntrega     único por intento de entrega
  X-DeltaOps-IdEvento      para deduplicación del receptor
  X-DeltaOps-Tipo          tipo de evento (OTCerrada)
  X-DeltaOps-Version       versión de esquema del payload
  X-Id-Correlacion         hilo extremo a extremo
Cuerpo: el sobre del evento completo (`09` §2)
```

- Éxito = respuesta 2xx dentro del tiempo límite; todo lo demás es fallo reintentable.
- El receptor debe responder rápido y procesar después (acusar y encolar): las respuestas lentas cuentan como fallo.

## 4. Firmas y seguridad

1. **Secreto por suscripción**, emitido al crearla (visible una vez, huella después — bóveda, ETS-007/12 §5); la firma cubre el cuerpo exacto + marca de tiempo de entrega (previene alteración y repetición).
2. El receptor **debe** verificar la firma y descartar entregas con marca de tiempo vieja (ventana anti-repetición documentada).
3. **Rotación de secreto sin corte:** periodo de convivencia con firma doble (secreto nuevo y anterior) hasta confirmar la migración del receptor.
4. El payload respeta minimización: datos sensibles como referencia, no como copia (`09` §3).

## 5. Reintentos y suspensión

- Fallo → reintentos con espera creciente y variación aleatoria, durante una ventana prolongada (horas→días), preservando **orden por agregado** (no se entrega el evento 5 de una OT antes de confirmar el 4; agregados distintos avanzan independientes).
- Traza completa por entrega: intento, respuesta, duración — consultable (`GET /webhooks/entregas`).
- **Fallo persistente → suspensión automática con alerta** al Admin de Integraciones (`SUSCRIPCION_SUSPENDIDA`): nunca silencio, nunca descarte.
- Reactivación manual con **recuperación**: al reactivar, se entregan los eventos perdidos desde el último confirmado (el cursor de la suscripción los recuerda) — o el administrador elige re-entregar por rango (`09` §5).

## 6. Versionado

- La suscripción declara la versión de esquema que acepta; los cambios aditivos llegan sin aviso (tolerancia del lector obligatoria para receptores).
- Versión nueva incompatible de un tipo: la suscripción sigue recibiendo la suya hasta migrar (N/N-1); el calendario de retiro se anuncia por los canales de gobierno (`17`).
- Tipos nuevos de evento jamás llegan sin suscripción explícita.
