# 08_INTEGRATION_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura técnica de integraciones: API, webhooks, conectores, IoT y telemetría.
> El diseño funcional está en ETS-005/10; aquí, la mecánica técnica del módulo Integration.
> Documento de diseño. No implementa nada.

---

## 1. Principio técnico

**Una sola puerta:** todo lo externo entra por el módulo Integration, se autentica como cuenta de servicio con alcance propio, atraviesa su anti-corruption layer y se convierte en comandos estándar del dominio. No existen rutas privilegiadas: un ERP y un operador humano producen los mismos comandos con las mismas validaciones.

## 2. API REST pública

1. **Contrato primero:** la API se define por especificación publicada (el contrato es la documentación); los clientes generan contra ella. Misma filosofía contract-first que ya usa SGMA (ETS-001), elevada a producto.
2. **Versionada en la ruta** con convivencia N/N-1 y calendario de retiro anunciado (ETS-006/10).
3. **Espejo de la interfaz:** todo lo que la aplicación puede hacer, la API lo expone con los mismos permisos, el mismo contexto activo y la misma auditoría — sin superficies "solo internas" indocumentadas.
4. **Paginada por cursor, filtrada por ámbito**, con idempotencia obligatoria en comandos (clave de idempotencia en la petición) y errores en lenguaje de negocio con código estable.
5. **Rate limit por cuenta de servicio y por tenant** (`12_SECURITY_TECHNICAL.md`), con cabeceras de presupuesto visibles.

## 3. Webhooks salientes

```text
Suscripción del tenant: eventos (catálogo ETS-003) + filtros (ámbito, tipo)
  → entrega firmada (el receptor verifica autenticidad e integridad)
  → reintentos con espera creciente y orden por agregado
  → traza completa por entrega (enviado/entregado/fallido)
  → suspensión automática con alerta tras fallo persistente (bandeja de
    integración; nunca silencio)
```

Los sobres de webhook son los mismos eventos del bus interno (contrato único, `04_MODULE_INTERACTIONS.md`), serializados con esquema versionado y tolerancia del lector.

## 4. Conectores de producto

| Conector | Mecánica |
|---|---|
| **Power BI / BI** | Marts curados (ETS-006/12) expuestos como conjuntos consultables con credencial de servicio por conjunto y ámbito; refresco incremental por fecha de evento; diccionario exportado junto a los datos |
| **SAP / Dynamics / Odoo** | ACL por conector: mapeos declarativos del tenant (catálogo↔código ERP), dueño por dato maestro (quién manda), sincronización por lotes o eventos según capacidad del ERP, reconciliación periódica con reporte de diferencias |
| **Microsoft 365 / Google Workspace** | SSO federado (Identity confía en el proveedor del tenant — `12`), calendario para programación, correo como canal de Notifications, exportes a almacenamiento del tenant, Teams como canal |
| **Mensajería (WhatsApp/SMS)** | Proveedores intercambiables detrás de la interfaz de canal de Notifications |

Todo conector: cuenta de servicio propia y visible en auditoría, credenciales en bóveda (nunca legibles tras guardarse), bandeja de errores propia, métricas de salud en observabilidad.

## 5. IoT y telemetría

```text
Dispositivos/gateways ─► INGESTA (endpoint dedicado de alta absorción)
  1. Autenticación por dispositivo (credencial individual revocable,
     registro de dispositivos por tenant)
  2. Cola de entrada por tenant (ráfagas absorbidas, ETS-006/16)
  3. ACL de telemetría: crudo → comandos candidatos (RegistrarLectura,
     RegistrarTanqueo, PosicionReportada)
  4. Las MISMAS validaciones de dominio que una captura humana
     (monotonía, rangos, capacidad) — lo inválido a bandeja, no a la fuente
  5. Crudo retenido corto (meses); hechos aceptados, permanentes (ETS-006/09)
```

- **MQTT preparado:** la ingesta se diseña con el transporte desacoplado de la ACL — HTTP hoy; un adaptador MQTT (broker gestionado, mismo registro de dispositivos, misma cola) se añade sin tocar dominio ni validaciones. "Preparado" significa: contratos de ingesta neutrales al transporte y registro de dispositivos ya diseñado para credenciales por dispositivo.
- **Agregación en la ACL:** telemetría de alta frecuencia se condensa a hechos con significado (una lectura aceptada por periodo, posiciones a intervalos) — el dominio recibe negocio, no ruido.

## 6. Operación de integraciones

- **Panel de salud por integración:** último intercambio, atraso, errores, elementos en bandeja — para el administrador del tenant (ETS-005/10).
- **Reproceso gobernado:** los elementos en bandeja de error se reprocesan tras corregir el mapeo/dato, con idempotencia garantizada.
- **Entornos:** credenciales y endpoints por entorno (`15_DEPLOYMENT_ARCHITECTURE.md`); una integración de pruebas jamás apunta a producción (validación estructural, no advertencia).
