# 04_MODULE_INTERACTIONS.md

> **DeltaOps — ETS-007 · v1.0** · Comunicación entre módulos: síncrono, eventos, contratos, desacoplamiento y anti-corruption layers.
> Documento de diseño. No implementa nada.

---

## 1. Dos vías, una regla

| Vía | Cuándo | Propiedades |
|---|---|---|
| **Llamada síncrona** (en proceso, contra contrato) | El llamador **necesita la respuesta para continuar**: resolver configuración vigente, evaluar un permiso, consultar la ficha de un activo antes de validar un comando | Solo **hacia abajo** en el grafo de capas (`02`); rápida, sin efectos colaterales en el llamado (consultas) o con transacción propia del llamado (comandos) |
| **Evento** (bus interno, durable) | Algo **ya pasó** y otros deben reaccionar: proyecciones, reglas, notificaciones, analítica, webhooks | Asíncrono, al-menos-una-vez, consumidores idempotentes con cursor propio (ETS-006/10); la vía por defecto entre módulos de dominio |

**Regla de decisión:** si la interacción puede ser un evento, es un evento. El síncrono se reserva para lo que de verdad bloquea la decisión del llamador — y nunca forma cadenas largas (máximo un salto de profundidad síncrona entre módulos; si se necesitan más, la frontera está mal).

## 2. Contratos

1. **Explícitos y versionados:** todo lo invocable o escuchable está declarado en el contrato público del módulo (`03_MODULE_CATALOG.md`). Evolución aditiva; cambios incompatibles = nueva versión conviviendo (ETS-006/10).
2. **En lenguaje ubicuo:** los contratos hablan ETS-003 (`CerrarOT`, `ActivoAsignado`), nunca jerga técnica de almacenamiento.
3. **Autocontenidos:** los eventos llevan lo necesario para reaccionar sin volver a preguntar (datos del hecho, contexto, autoría, versiones) — minimizan el síncrono de vuelta.
4. **Tolerancia del lector:** los consumidores ignoran campos desconocidos; jamás dependen de campos no documentados.

## 3. Desacoplamiento: qué lo garantiza

- **Sin acceso a datos ajenos:** ningún módulo consulta el esquema de otro; las vistas compuestas (un expediente de OT con datos de activo y repuestos) son **read models compuestos** construidos por eventos, no joins entre módulos.
- **Sin transacciones distribuidas internas:** cada comando afecta un agregado de un módulo; los procesos que cruzan módulos (compra→recepción→stock→despacho→OT) avanzan por eventos con compensación de dominio (ETS-003), no por transacciones que abarcan módulos.
- **Dependencias verificadas en la construcción** (`02`): el desacoplamiento no es una convención, es una restricción ejecutable.
- **El bus interno usa los mismos sobres que el exterior:** módulo extraído (futuro) = mismo contrato por transporte distinto (`01`, fase de evolución).

## 4. Anti-corruption layers (ACL)

Las ACL viven en los módulos de **borde** y traducen mundos ajenos al lenguaje de DeltaOps, en ambas direcciones:

| ACL | Traduce | Regla |
|---|---|---|
| Conector SAP/Dynamics/Odoo (Integration) | IDoc/OData/modelos del ERP ↔ comandos y eventos DeltaOps, con los mapeos declarativos del tenant (ETS-005/10) | El modelo del ERP **jamás** se filtra hacia adentro: dentro de DeltaOps solo existe el lenguaje ETS-003 |
| Ingesta IoT (Integration) | Telemetría cruda ↔ comandos `RegistrarLectura`/`RegistrarTanqueo` validables | La telemetría no es un hecho hasta que el agregado la acepta |
| Canales de notificación (Notifications) | Interfaz común ↔ APIs de correo/WhatsApp/SMS/Teams | Cambiar de proveedor no toca el catálogo de notificaciones |
| Móvil (Mobile) | Bitácora local del dispositivo ↔ comandos idempotentes | El formato del dispositivo evoluciona sin tocar el dominio |
| Legado SGMA (Integration, temporal) | Datos del sistema actual ↔ maestros/hechos DeltaOps durante la migración | ACL desechable: muere cuando muere la migración |

## 5. Publicación de eventos (mecánica)

1. **Atomicidad hecho+evento:** el evento se persiste **en la misma transacción** que el cambio del agregado (patrón de bandeja de salida — outbox): jamás un hecho sin evento ni un evento sin hecho.
2. **El despachador** lee la bandeja de salida y publica al bus durable (que es la fuente que Audit conserva, ETS-006/06); reintenta hasta confirmar; el orden por agregado se preserva.
3. **Suscripciones declaradas:** cada consumidor registra qué eventos escucha (visible en el catálogo `03`); las suscripciones dinámicas del tenant (reglas, webhooks, notificaciones) se resuelven dentro del módulo correspondiente.
4. **Cursores independientes por consumidor** + bandejas de error por consumidor (nunca descartar en silencio) + replay disponible para reconstruir (ETS-006/11).
5. **Trazabilidad de causalidad:** todo evento lleva referencia a su comando y, si lo causó otro evento (vía regla), la cadena causal completa (anti-cascada y linaje, ETS-005/05).

## 6. Ejemplo integrador (cadena hallazgo→OT→repuesto)

```text
Operador (móvil) ─► Mobile: bitácora ─► comando EjecutarChecklist ─► Maintenance
Maintenance: ChecklistRealizado + HallazgoDetectado (outbox, atómico)
  ├─► Rules: regla "crítico → solicitud" ─► comando CrearSolicitud ─► Maintenance
  │     Maintenance: SolicitudCreada ─► Notifications (supervisor) · Search · Audit
  ├─► Assets: proyecta Hoja de Vida        ├─► Analytics: indicadores de hallazgos
Coordinador convierte solicitud ─► WorkOrders: OTCreada ─► Workflow (estados)
Técnico pide repuesto ─► WorkOrders: RepuestoSolicitado ─► Warehouse (despacho)
Warehouse: DespachoRealizado ─► Inventory (stock) · WorkOrders (costo al expediente)
Cierre ─► OTCerrada ─► Analytics (costos/KPIs) · Assets (hoja de vida)
                      · Notifications (el operador que reportó se entera — U-38)
```

Cada flecha `─►` de reacción es un evento; las únicas llamadas síncronas del ejemplo son las consultas hacia abajo (permisos, configuración vigente, ficha del activo).
