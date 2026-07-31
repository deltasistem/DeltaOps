# 10_INTEGRATION_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Integration Engine: integraciones configurables con el ecosistema externo.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Que DeltaOps conviva con el ecosistema de cada empresa —ERP, BI, IoT, ofimática— mediante **conectores configurables**, no desarrollos por cliente. La integración es configuración del tenant sobre capacidades estándar de la plataforma.

## 2. Superficies de integración

| Superficie | Dirección | Uso |
|---|---|---|
| **API REST pública** | Entrada/salida | Contrato estable y versionado de la plataforma; todo lo que la interfaz puede hacer, la API lo expone bajo los mismos permisos |
| **Webhooks salientes** | Salida | Suscripción a eventos de dominio (ETS-003): "avísame cada `OTCerrada`" — con filtros por ámbito y tipo, firma, reintentos y traza de entrega |
| **Ingesta IoT/telemetría** | Entrada | Lecturas de medidores, GPS, sensores de combustible: llegan como *eventos propuestos* que validan las mismas reglas que una captura humana (monotonía, rangos) |
| **Conectores de producto** | Ambas | Power BI, SAP, Dynamics, Odoo, Microsoft 365, Google Workspace — mantenidos por el fabricante, configurados por el tenant |

## 3. Conectores previstos

- **Power BI / BI genérico:** exposición de conjuntos de datos curados y consistentes con el Motor de Indicadores (los mismos números que los dashboards), con permisos por conjunto; nunca acceso crudo a la base.
- **SAP / Dynamics / Odoo (ERP):** sincronización configurable de maestros (proveedores, materiales, centros de costo) y de hechos (OC, recepciones, costos), con **mapa de equivalencias** declarativo (catálogo DeltaOps ↔ código ERP) y dueño claro por dato: para cada maestro se define quién manda (ERP o DeltaOps) — nunca doble escritura ambigua.
- **Microsoft 365 / Google Workspace:** identidad (SSO), calendario (programación de OTs), correo (canal del Notification Engine), exportes a Drive/SharePoint, Teams como canal.
- **Pasarelas de mensajería** (WhatsApp/SMS): proveedores intercambiables detrás del Notification Engine.

## 4. Reglas del motor

1. **Las integraciones obedecen el dominio.** Nada entra saltándose validaciones, permisos o eventos: una OC creada por SAP recorre el mismo workflow que una creada a mano; una lectura IoT inválida se rechaza igual que una humana. No existe "puerta trasera de integración".
2. **Identidad propia:** cada integración actúa con una **cuenta de servicio** con rol y ámbito propios, visible en auditoría ("creado por integración SAP-PROD"), jamás suplantando usuarios.
3. **Contratos versionados:** API y webhooks se versionan; los cambios incompatibles conviven en paralelo con calendario de retiro. La configuración del tenant declara qué versión usa.
4. **Trazabilidad total:** toda entrada/salida queda registrada (qué, cuándo, resultado, reintentos); los fallos van a una bandeja de integración del administrador — nunca silencio.
5. **Resiliencia declarada:** reintentos con espera creciente, colas de entrada para ráfagas IoT, idempotencia por clave externa (el mismo mensaje dos veces no duplica hechos).
6. **Multi-tenant estricto:** credenciales, colas y trazas por tenant; una integración jamás ve datos de otro tenant.
7. **Mapeos declarativos, no código:** equivalencias de catálogos, unidades y monedas se configuran en tablas de mapeo del tenant, versionadas como toda configuración.

## 5. Capas

- **Plataforma:** catálogo de conectores disponibles (según licencia), versiones de API, límites de tasa.
- **Tenant:** qué conectores activa (Feature Flags), credenciales (bóveda segura, nunca visibles tras guardarse), mapeos, suscripciones de webhooks, cuentas de servicio y sus ámbitos.
- **Usuario:** ninguna — las integraciones no son personales.

## 6. Frontera

- El motor conecta; no transforma lógica de negocio: si un ERP exige un flujo distinto, se configura el workflow (04), no el conector.
- Conectores a medida por cliente no existen: un requerimiento no cubierto es una petición de producto (nuevo conector estándar o extensión de la API).
