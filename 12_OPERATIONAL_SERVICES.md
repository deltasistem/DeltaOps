# 12 — QR / Barcode / NFC Service (Identificación Física)

> **DeltaOps — ESI-006 · v1.0** · El servicio de identificación física: el puente entre objetos etiquetados del mundo real y entidades del sistema.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

La operación de mantenimiento vive entre objetos físicos: el técnico escanea el QR del equipo y llega a su ficha; pistolea el código de barras del repuesto y lo descuenta; acerca el teléfono al tag NFC del extintor y registra la inspección. El servicio gobierna esa correspondencia:

| Concepto | Definición |
|---|---|
| **Etiqueta** | Un portador físico (QR, código de barras, tag NFC) con identificador propio del sistema, ligado a una referencia de entidad (patrón doc 04) |
| **Vínculo** | Etiqueta ↔ entidad: uno-a-uno vigente, con historia (re-etiquetar un activo conserva el rastro del vínculo anterior) |
| **Resolución** | Escanear → identificar la etiqueta → resolver la entidad → entregar la referencia con las acciones contextuales que el módulo declaró |
| **Lote de etiquetas** | Generación e impresión masiva (planillas de QR para el parque de activos) como trabajo, entregado vía doc 09/11 |

## 2. Reglas

1. **La etiqueta porta identidad, no datos**: el QR contiene el identificador de etiqueta del sistema — nunca datos de negocio serializados (que envejecen, se falsifican y fugan). La verdad siempre se resuelve en línea (u offline contra el paquete descargado, ESI-005/18 §2.5).
2. **La resolución respeta las murallas**: etiqueta de otro tenant = no existe (aislamiento, ESI-005/17); entidad sin permiso de lectura = denegación limpia sin revelar qué era.
3. **Acciones contextuales declaradas**: cada módulo declara qué acciones ofrece al resolver sus tipos de entidad ("registrar lectura de horómetro", "descontar stock") — enlaces a sus comandos, evaluados con las reglas del solicitante; el servicio no ejecuta negocio (frontera del doc 07 §1).
4. **Códigos de barras de terceros** (el EAN del repuesto comprado): son **alias de búsqueda** declarados por el módulo dueño, no etiquetas del sistema; la resolución distingue ambos mundos.
5. **Offline de primera clase**: la resolución opera contra el paquete descargado del dispositivo; el registro resultante sigue la aptitud offline del comando destino (ESI-005/18).

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `identificacion_fisica` (núcleo), `etiquetado_masivo` (lotes de impresión) — separables.
- **Eventos**: "Etiqueta Vinculada", "Etiqueta Desvinculada" (v1) — cronología del activo/entidad.
- **Contratos**: resolver etiqueta; vincular/desvincular (con permiso del módulo dueño); generar lote; declaración de acciones contextuales y alias por módulo.
- **Configuración**: formatos de etiqueta por tenant (tamaños, material implica formato), prefijos de planta.
- **KPIs**: resoluciones por día/módulo, tasa de etiquetas no resueltas (deterioro físico), cobertura de etiquetado del parque.
- **Permisos**: `IDENTIFICACION.RESOLVER`, `IDENTIFICACION.VINCULAR`, `IDENTIFICACION.LOTES.GENERAR`.
- **Consumidores**: Activos (parque etiquetado), Inventario (repuestos y ubicaciones), Combustible (surtidores/equipos), OT (llegada al sitio), SST (equipos de seguridad inspeccionables).

## Impacto sobre la implementación

DGP propio; el cliente móvil integra el escáner una vez para todos los módulos; los módulos declaran acciones contextuales y alias en sus DGP.

## Dependencias

Docs 04, 07, 09; ESI-005/17-18; ETS-012 (operación de campo); ETS-004 (maestros etiquetables).

## Riesgos

- Etiquetas físicas degradadas rompiendo la confianza de campo; mitigación: el KPI de no-resueltas §3 con respuesta operativa (re-etiquetado) y el vínculo con historia que hace el reemplazo barato.

## Decisiones habilitadas

- Flujo de campo "escanear → actuar" uniforme en todos los módulos.
- Inventarios y rondas de inspección aceleradas por identificación física.

## Decisiones bloqueadas

- Prohibido serializar datos de negocio dentro de etiquetas.
- Prohibidas resoluciones que salten murallas o permisos.
- Prohibidos esquemas de etiquetado propios por módulo.

## Reusable Pattern

Etiqueta-como-identidad + resolución con acciones contextuales declaradas: el patrón para todo puente físico-digital futuro (sensores y telemetría entran por integraciones, doc 14, pero resuelven entidades por este servicio).

## Anti-Patterns

- QRs con URLs públicas sin autorización.
- El alias EAN tratado como etiqueta del sistema (identidades confundidas).
- Acciones contextuales que ejecutan comandos sin pasar por el módulo.

## Knowledge Graph

- **ETS que consume**: ETS-004 (maestros), ETS-012 (operación física de campo).
- **ESI que consume**: ESI-005/17-18; docs 04, 07 y 09 de esta serie.
- **DGP que originará**: DGP-IdentificaciónFísica; secciones de acciones contextuales/alias en DGP de Activos, Inventario, Combustible, OT y SST.
- **ADR relacionados**: ADR etiqueta-como-identidad (§2.1).
- **Módulos que reutilizarán este patrón**: Activos, Inventario, Combustible, OT y SST — la mayor intersección física del producto.
