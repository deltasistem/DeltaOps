# 03 — Ciclo de Vida de la Aplicación

> **DeltaOps — ESI-003 · v1.0** · Estados del proceso: arranque, servicio, degradación y apagado ordenado.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Estados oficiales del proceso

| Estado | Significado | Tráfico |
|---|---|---|
| **INICIANDO** | Ejecutando el bootstrap (doc 02) | Rechaza todo; sonda de vida responde, la de disponibilidad no |
| **LISTO** | Composición completa y verificada | Acepta tráfico |
| **DEGRADADO** | Sirviendo con una dependencia no crítica caída | Acepta tráfico; lo anuncia en salud (doc 18) |
| **DRENANDO** | Recibida señal de apagado | Rechaza tráfico nuevo, termina lo aceptado |
| **DETENIDO** | Recursos liberados | Ninguno |

Las transiciones son unidireccionales salvo LISTO ↔ DEGRADADO. No existe "reinicio interno": recuperarse de un estado roto es responsabilidad del orquestador, que reemplaza el proceso (imagen inmutable, ESI-002/10).

## 2. Apagado ordenado (graceful shutdown)

1. Recibir la señal estándar de terminación del orquestador.
2. Marcar DRENANDO: la sonda de disponibilidad pasa a negativa para que el balanceador retire el proceso.
3. Esperar el drenaje de peticiones en curso hasta un plazo máximo configurado (doc 08).
4. Detener consumidores de bandejas y trabajos en curso en un punto seguro: los trabajos son reanudables por diseño (cursores e idempotencia, ETS-009).
5. Cerrar en orden inverso al arranque: HTTP → dispatcher → pool de BD → observabilidad → logging.
6. Salir con código de éxito. Si el plazo vence, salir igualmente dejando constancia en el log: la idempotencia garantiza que nada se pierde, solo se reintenta.

## 3. Reglas normativas

1. **Nada de trabajo perdido invisible**: todo lo interrumpido debe ser detectable y reanudable (outbox, `clave_idempotencia`, cursores).
2. **El estado se anuncia, no se adivina**: los estados se exponen por las sondas de salud; los operadores no infieren el estado leyendo logs.
3. **Los workers comparten el ciclo**: mismo modelo de estados; su "tráfico" son mensajes de bandeja en lugar de peticiones HTTP.
4. **Sin hilos huérfanos**: todo trabajo en segundo plano se registra en el ciclo de vida y participa del drenaje; prohibido lanzar tareas que el apagado no conozca.
5. **Los recursos se liberan donde se crearon**: quien abre en el arranque, cierra en el apagado, en orden inverso.

## 4. Ventana de despliegue

El despliegue estándar (mismo artefacto promocionado, ESI-002/09) se apoya en este ciclo: el proceso nuevo alcanza LISTO antes de que el viejo pase a DRENANDO. La compatibilidad N/N-1 (ETS-010, ESI-002/21) garantiza que ambos convivan contra el mismo esquema.

## Impacto sobre la implementación

El DGP de arranque debe implementar los cinco estados y el drenaje; los runtimes (docs 19-22) deben declarar sus puntos seguros de interrupción.

## Dependencias

Doc 02 (bootstrap), doc 18 (salud), doc 22 (background); ETS-009 (idempotencia y cursores); ESI-002/09 y /10.

## Riesgos

- Plazos de drenaje mal calibrados que corten trabajos largos; mitigación: los trabajos largos avanzan por lotes con cursor, nunca en una sola operación monolítica.
- Estados DEGRADADO usados como normalidad permanente; mitigación: la degradación dispara alerta y tiene tratamiento en la operación (doc 17).

## Decisiones habilitadas

- Definir sondas de vida y disponibilidad distintas (doc 18).
- Diseñar despliegues sin pérdida apoyados en drenaje + idempotencia.

## Decisiones bloqueadas

- Prohibidos los apagados abruptos como procedimiento normal.
- Prohibido trabajo en segundo plano fuera del registro del ciclo de vida.
- Prohibida la recuperación "mágica" interna: el proceso roto se reemplaza.
