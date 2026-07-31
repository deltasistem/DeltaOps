# 08_IA_ASSISTANT.md

> **DeltaOps — ETS-004 · v1.0** · El asistente de IA: cómo interactúa, qué puede y no puede hacer, cuándo aparece, qué propone y cómo aprende.
> Principio rector (ETS-003): **la IA propone, no dispone.**
> Documento de diseño. No implementa nada.

---

## 1. Cómo interactúa

- **Presencia ubicua y discreta:** un punto de acceso persistente en toda la aplicación (escritorio y móvil). Nunca interrumpe un flujo de captura de campo.
- **Dos modos:**
  1. **Conversacional:** el usuario pregunta en lenguaje natural ("¿por qué subió el costo de combustible de la flota de carbón?", "¿qué OTs tiene pendientes la volqueta 034?") y recibe respuestas con datos del tenant, **con enlaces a las pantallas y hechos** que sustentan cada cifra.
  2. **Proactivo contextual:** tarjetas de sugerencia dentro de la pantalla pertinente (en una OT: "este activo tuvo esta misma falla 3 veces este año"; en planeación: "estas 5 alertas predictivas esperan decisión").
- **Contextual:** el asistente sabe dónde está el usuario (pantalla, entidad, contexto organizacional) y responde respecto a eso sin que se lo repitan.
- **Multilingüe:** responde en el idioma del usuario.

## 2. Qué puede hacer

| Capacidad | Ejemplos |
|---|---|
| **Responder consultas** sobre datos del tenant | Estado de activos, OTs, costos, consumos, historial |
| **Explicar indicadores** | Descomponer un KPI en los hechos que lo causan |
| **Resumir** | Hoja de vida de un activo, historial de fallas, un expediente de OT |
| **Predecir** | Riesgo de falla por activo (alertas predictivas), consumo esperado |
| **Detectar anomalías** | Tanqueos atípicos, costos fuera de patrón, lecturas sospechosas |
| **Proponer** | OTs desde alertas, ajustes a planes preventivos, compras por quiebre inminente |
| **Prellenar** | Diagnósticos sugeridos, criticidad de hallazgos, formularios repetitivos |
| **Guiar** | "¿Cómo traslado un activo?" → explica y lleva a la pantalla correcta |

## 3. Qué NO puede hacer (límites duros)

1. **No ejecuta escrituras por sí solo.** Nunca crea, cierra, aprueba, asigna ni borra nada sin confirmación humana explícita. Sus propuestas se materializan solo cuando un usuario (o una regla configurada explícitamente por el tenant) las confirma.
2. **No excede los permisos del usuario.** Ve exactamente lo que el usuario puede ver: mismo tenant, mismo contexto, mismos permisos. Jamás cruza datos entre empresas.
3. **No aprueba nada:** compras, cierres y traslados son decisiones humanas.
4. **No inventa datos:** si no hay información, lo dice; cada afirmación es trazable al hecho origen.
5. **No reemplaza el registro formal:** un diagnóstico sugerido no es un diagnóstico hasta que el técnico lo confirma y firma.
6. **No opina de personas:** no evalúa desempeño individual ni sugiere sanciones.

## 4. Cuándo aparece

| Momento | Comportamiento |
|---|---|
| Al abrir una OT | Resumen del historial relevante del activo y fallas recurrentes |
| Al diagnosticar | Causas raíz típicas para ese síntoma/modelo (sugerencia, no imposición) |
| En planeación | Alertas predictivas pendientes y planes con bajo cumplimiento |
| En dashboards | Explicación de desviaciones al hacer clic en "¿por qué?" |
| Ante anomalías | Tarjeta de alerta (consumo anómalo, costo atípico) al rol pertinente |
| A demanda | Siempre disponible desde el acceso persistente |
| **Nunca** | En medio de un checklist o captura de campo (no interrumpe); offline queda en modo degradado |

## 5. Qué propone (catálogo de propuestas)

- **AlertaPredictiva → OT:** "El motor de la retroexcavadora R-12 muestra patrón de falla en 2–3 semanas. ¿Crear OT predictiva?" → el planeador acepta (se crea vinculada) o descarta con motivo.
- **Ajuste de plan preventivo:** "El plan cada 250 h de este modelo llega tarde: las fallas ocurren a ~200 h. ¿Ajustar frecuencia?"
- **Compra anticipada:** "Al ritmo de consumo actual, los filtros X quiebran stock en 12 días y el lead time es 15. ¿Crear necesidad de compra?"
- **Priorización:** "Estas 3 OTs vencen hoy y sus técnicos están libres. ¿Reasignar?"
- **Calidad de datos:** "8 activos llevan 15 días sin lectura de horómetro; sus preventivos por uso están ciegos."

Toda propuesta muestra su **evidencia** (los hechos que la sustentan) y sus **consecuencias** (qué pasará al aceptar).

## 6. Cómo aprende

1. **Del historial del tenant:** OTs (diagnóstico → causa raíz → solución), consumos, lecturas, fallas: la trazabilidad de ETS-003 es su materia prima.
2. **Del feedback explícito:** cada propuesta aceptada o descartada (con motivo) ajusta las siguientes; los descartes repetidos silencian ese tipo de sugerencia para ese contexto.
3. **De la operación:** los eventos nuevos recalibran predicciones continuamente.
4. **Límites del aprendizaje:** aprende **por tenant** (los datos de una empresa jamás entrenan mejoras visibles para otra sin acuerdo explícito); no aprende de datos personales.

## 7. Transparencia y confianza

- Toda respuesta cita sus fuentes (hechos, fechas, enlaces).
- Las predicciones muestran su nivel de confianza en lenguaje simple ("riesgo alto", "patrón débil").
- El usuario siempre distingue qué escribió un humano y qué sugirió la IA (las sugerencias se marcan como tales, también en auditoría: `RecomendacionGenerada/Aceptada/Descartada`).
- Un tenant puede desactivar capacidades de IA por módulo (Motor de Reglas / configuración).
