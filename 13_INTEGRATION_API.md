# 13_INTEGRATION_API.md

> **DeltaOps — ETS-008 · v1.0** · Contratos de integración: ERP (SAP, Dynamics, Odoo), Power BI/Power Platform, Microsoft 365, Google, IoT y MQTT.
> La arquitectura está en ETS-007/08; el diseño funcional en ETS-005/10. Aquí, los contratos por familia.
> Documento de diseño. No implementa nada.

---

## 1. Reglas comunes a toda integración

1. **Una sola puerta:** todo entra por Integration como cuenta de servicio con alcance mínimo (`08` §3), atraviesa su anti-corruption layer y produce **los mismos comandos del catálogo `03`** con las mismas validaciones — sin rutas privilegiadas (ETS-007 NT-10).
2. Mapeos declarativos del tenant (catálogo↔código externo) versionados como configuración (ETS-005); lo inmapeable a bandeja de errores con reproceso gobernado — nunca silencio.
3. Credenciales en bóveda por entorno (`INTEGRACION_ENTORNO_INCORRECTO` es estructural); panel de salud por integración (`04` §8).
4. Todo intercambio auditado con la identidad de la cuenta de servicio y correlación.

## 2. ERP (SAP · Dynamics · Odoo)

Contrato común de conector ERP; cada producto difiere solo en su adaptador:

| Aspecto | Contrato |
|---|---|
| **Dueño por dato maestro** | Declarado por el tenant en el mapeo: quién manda por entidad (proveedores del ERP, activos de DeltaOps, ítems según el caso); el no-dueño recibe y no edita |
| **Maestros (bidireccional según dueño)** | Proveedores, ítems, centros de costo, contratos — por lotes programados o eventos, con reconciliación periódica y reporte de diferencias |
| **Hechos hacia el ERP** | Consumos, despachos, costos consolidados, recepciones, OCs aprobadas — como eventos suscritos (webhooks/lotes), con folio DeltaOps como referencia cruzada |
| **Hechos desde el ERP** | Recepciones/facturas registradas allá → comandos estándar (`RegistrarRecepcion`…) vía la ACL, validados como cualquier captura |
| **Errores** | `MAPEO_INVALIDO` a bandeja por elemento; la reconciliación detecta lo que ninguno vio |

El modelo del ERP jamás se filtra hacia adentro: dentro de DeltaOps solo existe el lenguaje ETS-003 (ETS-007/04 §4).

## 3. Power BI y Power Platform

- **Power BI:** consume los **marts curados** (ETS-006/12) con credencial de servicio por conjunto y ámbito; refresco incremental por fecha de evento; diccionario de datos exportado junto al conjunto; los KPIs canónicos viajan calculados (la fórmula es Core — BI presenta, no reinventa).
- **Power Platform (Power Automate/Apps):** consume la API pública y los webhooks como cualquier cliente: cuentas de servicio con alcance mínimo, comandos del catálogo — un flujo de Power Automate que crea solicitudes es un cliente API más, con permisos y auditoría.

## 4. Microsoft 365 y Google Workspace

| Servicio | Contrato |
|---|---|
| SSO | Federación por tenant (`08` §5): autentican, jamás autorizan |
| Correo | Canal de Notifications detrás de la interfaz común (proveedor intercambiable) |
| Calendario | Publicación de programaciones (OTs, preventivos) hacia calendarios del usuario — solo lectura desde afuera: el calendario refleja, no comanda |
| Teams | Canal de notificación con acuse; los enlaces llevan a DeltaOps (la acción ocurre adentro, con permisos) |
| Almacenamiento (SharePoint/Drive) | Destino opcional de exportaciones y reportes emitidos del tenant; DeltaOps conserva el original congelado |

## 5. IoT

- **Registro de dispositivos** por tenant con credencial individual (`08` §8); alta/baja/rotación por API de administración de integraciones.
- **Ingesta:** `POST /iot/telemetria` por lotes (clase M, absorción por cola): la ACL condensa telemetría cruda a comandos candidatos (`RegistrarLectura`, `RegistrarTanqueo`, posiciones) con las **mismas validaciones de dominio** que una captura humana; lo inválido a bandeja (`LECTURA_NO_MONOTONA` no rechaza al sensor: aparta el dato para revisión).
- Telemetría cruda retenida corto; hechos aceptados, permanentes (ETS-006/09); agregación declarada en la configuración del dispositivo (una lectura aceptada por periodo).

## 6. MQTT (preparado)

- El contrato de ingesta es **neutral al transporte**: los mismos lotes, credenciales individuales y ACL sirven a HTTP hoy y a un broker MQTT gestionado mañana (temas por tenant/dispositivo, QoS al-menos-una-vez, deduplicación por clave de origen).
- Activar MQTT no toca dominio, validaciones ni el registro de dispositivos: es un adaptador nuevo de la misma puerta (ETS-007/08 §5).
