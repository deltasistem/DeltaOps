# 06_NOTIFICATION_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Notification Engine: motor de notificaciones configurable multicanal.
> Complementa el diseño UX de `09_NOTIFICACIONES.md` (ETS-004) definiendo su arquitectura de configuración.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Que **todo evento relevante encuentre a su responsable** por el canal correcto, en el momento correcto, sin que nada se programe: catálogo de eventos, destinatarios, canales, plantillas, horarios y escalamientos son configuración del tenant y preferencias del usuario.

## 2. Canales

| Canal | Uso previsto | Nota |
|---|---|---|
| **Bandeja interna** | Todo; es el registro canónico | Siempre activa, no desactivable |
| **Push (móvil/web)** | Urgencias operativas y aprobaciones | Con acción directa (aprobar, abrir OT) |
| **Correo** | Resúmenes, aprobaciones, documentos | Plantillas con branding del tenant |
| **WhatsApp** | Alertas de campo donde el correo no llega | Requiere habilitación por tenant (costos) |
| **SMS** | Respaldo para lo crítico sin datos | Solo severidad máxima, por costo |
| **Teams / Slack** | Equipos administrativos | Vía Integration Engine |
| **Webhooks** | Sistemas externos | Vía Integration Engine (contratos firmados) |

La disponibilidad de canales es configuración de **plataforma** (según licencia); su activación, del **tenant**; la preferencia final, del **usuario** — sin poder silenciar lo que el tenant marque como obligatorio (seguridad, aprobaciones que le corresponden).

## 3. Catálogo de notificaciones

Toda notificación nace de un evento (dominio, SLA/escalamiento, regla, calendario). El tenant configura una **matriz evento → notificación**:

```text
Evento (ETS-003) + severidad
 ├── Destinatarios: roles resueltos en el contexto del evento
 │   ("el supervisor del frente del activo"), cadena de interesados
 │   (quien reportó, quien aprobó), nunca personas quemadas
 ├── Canales por severidad (crítica: push+bandeja; informativa: solo bandeja)
 ├── Plantilla multiidioma con variables del evento
 ├── Agrupación: individual / resumen (digest diario o por turno)
 └── Horario: inmediata o respetando ventanas (no molestar), salvo crítica
```

## 4. Reglas del motor

1. **Deduplicación:** el mismo hecho no notifica dos veces a la misma persona aunque llegue por dos rutas (regla + workflow).
2. **Colapso:** N eventos iguales en poco tiempo se agrupan ("12 activos sin lectura esta semana"), no ametrallan.
3. **Accionables:** toda notificación lleva el enlace profundo a su objeto y, cuando aplica, la acción directa (aprobar ≤ 2 toques — ETS-004 U-06).
4. **Cierre del ciclo:** el que reporta se entera del desenlace (U-38) — es configuración por defecto, no opcional del tenant.
5. **Confirmación de lo crítico:** las notificaciones de severidad máxima exigen acuse; sin acuse en el plazo, escalan (política del Workflow Engine).
6. **Trazables:** enviada/entregada/leída/actuada queda registrado; el escalamiento usa esa traza.
7. **Fallo explícito:** canales caídos reintentan y degradan al siguiente canal configurado; nunca se pierde en silencio (la bandeja siempre queda).

## 5. Preferencias del usuario

- Canales preferidos por categoría, ventanas de silencio, digest vs. inmediato, idioma.
- Delegación durante ausencias (ligada a la delegación de aprobaciones del Workflow Engine).
- Lo obligatorio del tenant prevalece sobre la preferencia; el usuario siempre ve *por qué* recibió algo.

## 6. Frontera

- El motor entrega y traza; **no decide** qué es notificable: eso lo declaran los eventos, workflows y reglas.
- Los proveedores concretos de cada canal (pasarela de SMS/WhatsApp, correo) son configuración de plataforma/tenant vía Integration Engine; el catálogo de notificaciones no cambia si cambia el proveedor.
