# 10_EVENT_DRIVEN_DATA.md

> **DeltaOps — ETS-006 · v1.0** · Flujo de datos orientado a eventos: cómo viajan los eventos, qué consumen y qué producen.
> El catálogo de eventos es el de ETS-003 (`03_DOMAIN_EVENTS.md`).
> Documento de diseño. No implementa nada.

---

## 1. El evento como vehículo

Todo cambio relevante del negocio viaja como **evento de dominio**: nombre en pasado (`OTCerrada`, `CombustibleRegistrado`), datos completos del hecho, contexto organizacional del momento, autoría, tiempo doble y versión de configuración. El evento es simultáneamente: el hecho (transaccional), el registro (auditoría) y la señal (integración entre motores).

## 2. Topología del flujo

```text
PRODUCTORES                         CANAL                    CONSUMIDORES
────────────                ────────────────────      ─────────────────────────
Agregados (ETS-003)   ──►   Flujo de eventos     ──►  Proyecciones/read models
  al confirmar comandos       · ordenado por           Rules Engine (ETS-005/05)
Sincronización móvil          agregado                 Notification Engine
  (hechos nacidos offline)  · durable, reproducible    Motor de Indicadores/Costos
Integraciones (IoT, ERP)    · por tenant               Auditoría (línea de tiempo)
Calendario (vencimientos)   · con reintentos           Marts/BI · Webhooks · IA (lectura)
Rules Engine (acciones que
  crean nuevos hechos)
```

## 3. Reglas del flujo

1. **Solo los agregados producen eventos de dominio.** Reglas, integraciones y móvil producen *comandos*; el agregado valida invariantes y, si acepta, emite el evento. No hay eventos "inyectados" por fuera del dominio.
2. **Orden garantizado por agregado:** los eventos de una misma OT llegan en orden; entre agregados distintos el orden es por tiempo, sin garantía estricta — los consumidores se diseñan para ello.
3. **Entrega al menos una vez + consumidores idempotentes:** todo consumidor tolera duplicados (clave de evento); ninguno depende de "exactamente una vez".
4. **Durable y reproducible:** el flujo se conserva (es la auditoría); cualquier consumidor nuevo puede **reproducir la historia** desde el inicio para construir su modelo (replay).
5. **Consumidores aislados:** cada consumidor lleva su propio cursor; uno lento o caído no frena a los demás ni a la escritura. Su atraso es visible (frescura declarada).
6. **Fallo explícito:** eventos que un consumidor no puede procesar van a su bandeja de errores con alerta al administrador; nunca se descartan en silencio.
7. **Esquemas versionados:** los eventos evolucionan aditivamente (agregar datos, no mutar significados); los consumidores toleran campos nuevos; los cambios incompatibles crean una nueva versión del evento que convive con la anterior.
8. **Anti-cascada:** las cadenas evento→regla→comando→evento tienen profundidad limitada y trazada (ETS-005/05); el linaje registra qué evento causó cuál.

## 4. Qué consume y qué produce cada quién

| Actor | Consume | Produce |
|---|---|---|
| Agregados | Comandos | Eventos de dominio |
| Proyecciones (Hoja de Vida, Stock, bandejas) | Eventos | Read models (nunca eventos) |
| Rules Engine | Eventos + calendario | Comandos (crear solicitud, transicionar, notificar) |
| Notification Engine | Eventos + escalamientos | Entregas trazadas (no eventos de dominio) |
| Indicadores/Costos | Eventos | Proyecciones analíticas, snapshots |
| Auditoría | Todos los eventos | Líneas de tiempo (lectura) |
| Webhooks | Eventos suscritos filtrados | Entregas firmadas a externos |
| Móvil (sincronización) | Paquete de configuración + read models de su alcance | Comandos con clave de idempotencia |
| IoT/ERP | — | Comandos vía API (cuenta de servicio) |
| IA | Read models/marts (alcance del asistido) | Sugerencias (jamás comandos) |

## 5. El evento y el tiempo

- **Tiempo del negocio** (cuándo ocurrió) ordena las historias y la analítica; **tiempo del sistema** (cuándo se supo) explica la operación y el offline.
- Un hecho sincronizado tarde entra al flujo con su tiempo de negocio original: las proyecciones que ya pasaron ese punto lo **incorporan retroactivamente** (recalculan el tramo afectado) y los KPIs de periodos abiertos se corrigen; los snapshots tomados no cambian (→ `05_ANALYTICS_DATA.md`).
