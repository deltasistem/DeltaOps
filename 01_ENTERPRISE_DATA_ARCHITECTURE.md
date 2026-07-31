# 01_ENTERPRISE_DATA_ARCHITECTURE.md

> **DeltaOps — ETS-006 · v1.0** · Arquitectura Empresarial de Datos: documento maestro de la estrategia de datos.
> No diseña PostgreSQL, tablas ni ORM. Define cómo **viven** los datos en DeltaOps.
> Documento de diseño. No implementa nada.

---

## 1. Principios rectores

| Principio | Consecuencia sobre los datos |
|---|---|
| **Organization First** | Todo dato nace anclado al contexto organizacional (empresa→sede→operación→proyecto→centro de costo→ubicación) vigente al momento del hecho; nunca se recalcula el pasado con la estructura de hoy |
| **API First** | Los datos solo se leen y escriben a través de contratos publicados; nadie toca "la base" — ni las integraciones, ni el BI, ni la IA |
| **Configuration First** | La configuración es un dominio de datos de primera clase, versionada e inmutable por versión (ETS-005) |
| **Event Driven** | El hecho de negocio se registra como evento de dominio (ETS-003); los demás datos derivan de los eventos |
| **CQRS** | Escritura y lectura tienen modelos separados: el de escritura protege invariantes; los de lectura sirven a cada consumidor |
| **Single Source of Truth** | Cada dato tiene exactamente un dueño y un lugar canónico; todo lo demás es proyección declarada como tal |
| **Append Only** | Los hechos no se editan ni borran; las correcciones son eventos compensatorios |
| **Offline First** | El dato puede nacer sin señal; la sincronización es parte del modelo de datos, no un parche |
| **Audit by Design** | Todo dato sabe quién, cuándo, dónde, en qué contexto y por qué; la trazabilidad no se agrega después |
| **Privacy by Design** | Los datos personales se minimizan, clasifican y protegen desde el diseño (→ `13_DATA_SECURITY.md`) |

## 2. Los seis dominios de datos

Todo dato de DeltaOps pertenece a exactamente uno:

| Dominio | Naturaleza | Cambia | Doc |
|---|---|---|---|
| **Maestros** | Quién y qué existe: empresas, usuarios, activos, ubicaciones, proveedores, catálogos | Lento, versionado, nunca borrado si fue usado | `02` |
| **Transaccionales** | Lo que pasó: checklists, OTs, combustible, horas, movimientos, compras, asignaciones | Append-only; alto volumen | `03` |
| **Configuración** | Cómo se comporta el tenant: formularios, workflows, reglas, dashboards, branding, flags | Por publicación versionada (ETS-005) | `04` |
| **Analíticos** | Lo que significan los hechos: KPIs, read models, marts, snapshots | Derivado, reconstruible, jamás fuente | `05` |
| **Auditoría** | La memoria: eventos, versiones, cambios, trazabilidad | Append-only estricto, ni el fabricante lo edita | `06` |
| **Metadatos** | Datos sobre los datos: diccionario, linaje, clasificación | Mantenido junto al producto y al tenant | `18` |

Regla de dependencia: **Analíticos ← Transaccionales ← Maestros + Configuración**, y Auditoría observa a todos. Nunca al revés: un maestro no depende de un KPI; un hecho no depende de una proyección.

## 3. Anatomía de todo dato

Independiente del dominio, cada registro conceptual lleva:

1. **Identidad estable** — identificador inmutable; los negocios ven folios (Core ETS-003), las máquinas ven identidades técnicas.
2. **Tenant** — aislamiento absoluto; el tenant es parte de la identidad lógica de todo dato, sin excepciones.
3. **Contexto organizacional del momento** — el hecho recuerda dónde ocurrió según la estructura vigente entonces.
4. **Tiempo doble** — cuándo ocurrió (tiempo del negocio) y cuándo se registró (tiempo del sistema); imprescindible para offline.
5. **Autoría** — quién (usuario, integración con cuenta de servicio, regla, o humano que aceptó una sugerencia de IA).
6. **Versión de configuración usada** — con qué versión de formulario/workflow/regla se produjo (ETS-005).
7. **Clasificación de seguridad** — heredada de su tipo de dato (→ `13`).

## 4. Flujo canónico (visión de conjunto)

```text
CAPTURA (web / móvil offline / API / IoT / regla)
   │  comando validado contra invariantes + permisos en contexto
   ▼
MODELO DE ESCRITURA (agregados ETS-003)  ──────►  EVENTO DE DOMINIO
   │                                                   │ (append-only)
   │                                                   ▼
   │                                    ┌──────────────────────────────┐
   │                                    │  CONSUMIDORES DE EVENTOS      │
   │                                    │  · proyecciones / read models │
   │                                    │  · Rules Engine (ETS-005)     │
   │                                    │  · Notification Engine        │
   │                                    │  · Auditoría (línea de tiempo)│
   │                                    │  · Analítica / marts / BI     │
   │                                    │  · Webhooks salientes         │
   ▼                                    └──────────────────────────────┘
LECTURAS: cada consumidor lee SU read model, nunca el modelo de escritura
```

Detalles en `10_EVENT_DRIVEN_DATA.md` y `11_CQRS_ARCHITECTURE.md`.

## 5. Decisiones estructurales

1. **El evento es el hecho; las vistas son opinión.** Hoja de Vida, Stock, KPIs y buscador son proyecciones reconstruibles desde los eventos (ETS-003). Si una proyección discrepa del evento, la proyección está mal.
2. **Un solo mundo lógico por tenant, muchos modelos de lectura.** No hay "base de reportes" divergente: el BI consume marts derivados del mismo linaje.
3. **Consistencia:** fuerte dentro del agregado (una OT nunca queda a medias); eventual entre proyecciones, con la frescura visible al usuario (U-17/U-20).
4. **El borrado es un estado, no una operación física** — salvo obligaciones legales de supresión de datos personales, resueltas por anonimización (→ `09`, `13`).
5. **Todo es reconstruible menos la verdad:** proyecciones, caches y marts se pueden regenerar; maestros, hechos, configuración publicada y auditoría son el patrimonio a respaldar (→ `15`).

## 6. Índice de la serie ETS-006

| Doc | Tema |
|---|---|
| `02_MASTER_DATA.md` | Datos maestros |
| `03_TRANSACTIONAL_DATA.md` | Datos transaccionales |
| `04_CONFIGURATION_DATA.md` | Datos de configuración |
| `05_ANALYTICS_DATA.md` | Datos analíticos |
| `06_AUDIT_DATA.md` | Datos de auditoría |
| `07_DATA_GOVERNANCE.md` | Gobierno de datos |
| `08_DATA_OWNERSHIP.md` | Propiedad por dominio |
| `09_DATA_LIFECYCLE.md` | Ciclo de vida |
| `10_EVENT_DRIVEN_DATA.md` | Flujo de eventos |
| `11_CQRS_ARCHITECTURE.md` | Separación comando/consulta |
| `12_READ_MODELS.md` | Modelos de lectura por consumidor |
| `13_DATA_SECURITY.md` | Clasificación y protección |
| `14_OFFLINE_SYNCHRONIZATION.md` | Sincronización y conflictos |
| `15_BACKUP_RECOVERY.md` | Respaldo y recuperación |
| `16_PERFORMANCE_STRATEGY.md` | Rendimiento y escalabilidad |
| `17_DATA_QUALITY.md` | Calidad de datos |
| `18_METADATA_STRATEGY.md` | Metadatos, diccionario y linaje |
