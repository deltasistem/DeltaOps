# 09_GLOSARIO_DELTAOPS.md

> **DeltaOps — ETS-003 · v1.0** · Glosario general de la plataforma.
> Complementa el `08_DICCIONARIO_NEGOCIO.md` (lenguaje del negocio) con los términos de arquitectura, DDD y plataforma usados en toda la documentación.
> Documento de diseño. No implementa nada.

---

## A. Términos de plataforma

| Término | Definición |
|---|---|
| **DeltaOps** | Plataforma empresarial de gestión de activos (EAM) organización-primero, multi-tenant, con historial completo. Evolución del SGMA actual. |
| **SGMA** | Sistema de Gestión de Mantenimiento actual (CMMS), auditado en `ARQUITECTURA_ACTUAL.md`; base de reutilización según `REUTILIZACION.md`. |
| **EAM** | Enterprise Asset Management: gestión integral del ciclo de vida de los activos (más amplio que un CMMS). |
| **CMMS** | Computerized Maintenance Management System: gestión de mantenimiento; el alcance del SGMA actual. |
| **Multi-tenant** | Arquitectura donde varias empresas (tenants) comparten la plataforma con datos totalmente aislados. |
| **ETS** | Especificación Técnica de Solución: numeración de los encargos de diseño (ETS-001 auditoría, ETS-002 arquitectura, ETS-003 dominio DDD). |
| **Mobile-first / PWA** | Prioridad de diseño para uso en campo desde dispositivos móviles, instalable como aplicación web progresiva. |
| **Contract-first** | El contrato (OpenAPI) es la fuente de verdad de la que se derivan clientes y validadores. Patrón reutilizado del SGMA. |

## B. Términos DDD (cómo se usan en DeltaOps)

| Término | Definición |
|---|---|
| **DDD (Domain-Driven Design)** | Enfoque de diseño que pone el modelo del negocio (no la tecnología) en el centro. |
| **Dominio** | Área de conocimiento del negocio (Activos, Mantenimiento, Inventario…). |
| **Subdominio Core** | El que diferencia al negocio: Activos y Mantenimiento. |
| **Subdominio de soporte / genérico** | Habilitadores: Inventario, Compras, Personas / Seguridad, Notificaciones, Catálogos. |
| **Bounded Context (contexto delimitado)** | Frontera dentro de la cual un modelo y su lenguaje son válidos y consistentes. Ver `02_BOUNDED_CONTEXTS.md`. |
| **Context Map** | Mapa de relaciones entre contextos (conformist, customer/supplier, eventos publicados, ACL). |
| **Lenguaje ubicuo** | Vocabulario único y obligatorio del negocio, definido en `08_DICCIONARIO_NEGOCIO.md`. |
| **Aggregate Root** | Entidad que gobierna un límite de consistencia y es su única puerta de entrada. Ver `05_AGGREGATES.md`. |
| **Entidad** | Objeto con identidad y ciclo de vida. Ver `07_ENTIDADES.md`. |
| **Value Object (VO)** | Concepto inmutable definido por su valor, sin identidad (Dinero, Vigencia, Horómetro). Ver `06_VALUE_OBJECTS.md`. |
| **Domain Service (motor)** | Lógica de negocio que coordina varios agregados (Motor de Asignaciones, de Preventivos…). Ver `04_DOMAIN_SERVICES.md`. |
| **Domain Event** | Hecho de negocio ocurrido, nombrado en pasado, inmutable. Ver `03_DOMAIN_EVENTS.md`. |
| **Invariante** | Regla que siempre debe cumplirse dentro de un agregado (p. ej. una sola asignación vigente por dimensión). |
| **Proyección** | Estado de lectura derivado de eventos (hoja de vida, stock, indicadores, línea de tiempo). |
| **Append-only** | Registro al que solo se agrega; nunca se edita ni borra (auditoría, movimientos, lecturas). |
| **Evento compensatorio** | Nuevo evento que corrige el efecto de otro, preservando la historia. |
| **Anticorruption Layer (ACL)** | Traducción entre modelos para que un contexto no contamine a otro (p. ej. IA → Mantenimiento). |
| **Shared Kernel** | Núcleo mínimo compartido entre contextos; en DeltaOps, solo identidades de catálogo. |
| **Conformist** | Patrón donde un contexto acepta el modelo de otro tal cual (todos conforman la jerarquía de Organización). |
| **Customer/Supplier** | Relación donde un contexto (cliente) consume el modelo de otro (proveedor), con acuerdos explícitos. |
| **Idempotencia** | Propiedad de un suscriptor: procesar el mismo evento dos veces no duplica efectos. |

## C. Siglas e indicadores

| Sigla | Significado |
|---|---|
| **OT** | Orden de Trabajo. |
| **MTTR** | Mean Time To Repair — tiempo medio de reparación. |
| **MTBF** | Mean Time Between Failures — tiempo medio entre fallas. |
| **KPI** | Key Performance Indicator — indicador clave. |
| **RBAC / ABAC** | Control de acceso por roles / por atributos (rol evaluado en el contexto organizacional). |
| **SLA** | Acuerdo de nivel de servicio (tiempos objetivo de atención). |
| **TCO** | Total Cost of Ownership — costo total de propiedad de un activo. |
| **VO** | Value Object. |
| **AR** | Aggregate Root. |
| **BC** | Bounded Context. |
| **ACPM / GLP / GNV** | Diésel colombiano / gas licuado de petróleo / gas natural vehicular — valores del catálogo de combustibles, nunca supuestos por defecto. |
| **NIT / RUT** | Identificaciones tributarias (Colombia/Chile) modeladas como VO IdentificacionTributaria. |

## D. Índice cruzado de la documentación

| Documento | Contenido | Serie |
|---|---|---|
| `ARQUITECTURA_ACTUAL.md`, `MODULOS_EXISTENTES.md`, `MODELO_DATOS_ACTUAL.md`, `REUTILIZACION.md` | Auditoría del SGMA actual | ETS-001 |
| `01_ARQUITECTURA_EMPRESARIAL.md` … `04_PRINCIPIOS_SGMA.md` | Arquitectura empresarial, módulos, navegación y principios | ETS-002 |
| `01_DOMAIN_MODEL.md` … `09_GLOSARIO_DELTAOPS.md` | Modelo de dominio DDD completo de DeltaOps | ETS-003 |
