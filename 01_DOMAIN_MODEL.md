# 01_DOMAIN_MODEL.md

> **DeltaOps — ETS-003 · v1.0** · Modelo de Dominio Empresarial (DDD).
> Documento maestro: visión del negocio, mapa de dominios y cómo se relacionan aggregates, entidades, value objects, servicios y eventos.
> Documento de diseño. No modela tablas, clases ni código. **Modela el negocio.**

---

## 1. Visión del negocio

DeltaOps es la plataforma empresarial de gestión de activos (EAM) de una operación logística/industrial multi-empresa. El negocio consiste en:

1. **Organizar** la operación en una jerarquía viva: empresa → sede → operación → proyecto → centro de costo → ubicación.
2. **Custodiar activos** (17+ tipos, cualquier combustible) cuya pertenencia es siempre temporal: **asignaciones con vigencia e historial**.
3. **Mantener** los activos (correctivo, preventivo, predictivo) mediante órdenes de trabajo trazables.
4. **Operar en campo**: checklists preoperacionales, tanqueos de combustible, horas hombre, lecturas de horómetro/kilometraje.
5. **Abastecer**: repuestos, almacenes, compras, proveedores, contratos.
6. **Medir y decidir**: costos, indicadores, analítica e IA.
7. **Recordarlo todo**: auditoría inmutable e historial completo.

**Principio rector (del `04_PRINCIPIOS_SGMA.md`):** la organización es el eje del sistema; el estado actual de cualquier cosa es una proyección de su historial.

## 2. Mapa de dominios (subdominios estratégicos)

| Dominio | Clasificación estratégica | Contenido |
|---|---|---|
| **Organización** | Core (genérico estructural) | Empresa, Sede, Operación, Proyecto, Centro de Costo, Ubicación |
| **Seguridad y Acceso** | Genérico | Usuario, Rol, Permiso, Contexto Activo |
| **Activos** | **Core del negocio** | Activo, Componente, Tipo de Activo, Fabricante, Modelo, Asignación, Hoja de Vida |
| **Mantenimiento** | **Core del negocio** | OT, Plan Preventivo, Alerta Predictiva, Solicitud de Servicio |
| **Operación en Campo** | Core del negocio | Checklist, Plantilla, Inspección, Hallazgo, Tanqueo, Horas Hombre, Lecturas |
| **Inventario** | Soporte | Repuesto, Almacén, Movimiento, Existencia |
| **Compras y Proveedores** | Soporte | Proveedor, Orden de Compra, Contrato, Calificación |
| **Personas** | Soporte | Técnico, Competencia, Responsable |
| **Costos e Indicadores** | Soporte analítico | Costo, Indicador (MTTR, MTBF, disponibilidad), Presupuesto |
| **Analítica e IA** | Soporte analítico | Predicción, Recomendación, Anomalía, Asistente |
| **Auditoría e Historial** | Genérico transversal | Evento de Auditoría, Línea de Tiempo |
| **Notificaciones** | Genérico transversal | Notificación, Suscripción, Canal |
| **Configuración y Catálogos** | Genérico | Catálogo, Parámetro, Moneda, Idioma, Combustible |

El detalle de límites y relaciones entre contextos está en `02_BOUNDED_CONTEXTS.md`.

## 3. Bloques tácticos del modelo

| Bloque | Definición en DeltaOps | Detalle |
|---|---|---|
| **Aggregate Root** | Entidad que garantiza la consistencia de un conjunto de objetos y es la única puerta de entrada a él (p. ej. Activo, OT, Almacén) | `05_AGGREGATES.md` |
| **Entidad** | Objeto de negocio con identidad y ciclo de vida (p. ej. Componente dentro de Activo) | `07_ENTIDADES.md` |
| **Value Object** | Concepto sin identidad, inmutable, definido por su valor (Dinero, Periodo, Horómetro) | `06_VALUE_OBJECTS.md` |
| **Domain Service** | Lógica de negocio que no pertenece a un solo aggregate (Motor de Asignaciones, Motor de Preventivos) | `04_DOMAIN_SERVICES.md` |
| **Domain Event** | Hecho de negocio ocurrido, en pasado, inmutable (ActivoAsignado, OTCerrada) | `03_DOMAIN_EVENTS.md` |

## 4. Relaciones estructurales clave

```text
Empresa 1─n Sede 1─n Operación 1─n Proyecto 1─n CentroDeCosto
Empresa 1─n Ubicación (jerárquica)

Activo n─1 TipoDeActivo (catálogo, atributos dinámicos)
Activo n─1 Modelo n─1 Fabricante
Activo 1─n Componente
Activo 1─n Asignación (con vigencia) ──→ nodo organizacional + Responsable
Activo n─m Combustible (catálogo)
Activo 1─1 HojaDeVida (proyección de su historial)

OT n─1 Activo · OT n─m Técnico · OT 1─n ConsumoDeRepuesto · OT 1─n CostoIncurrido
PlanPreventivo n─1 Activo (o grupo) ──genera──► OT
Checklist (ejecución) n─1 Plantilla · 1─n Hallazgo ──puede originar──► SolicitudDeServicio ──► OT

Almacén 1─n Existencia n─1 Repuesto · Movimiento afecta Existencia (atómico)
OrdenDeCompra n─1 Proveedor · Contrato n─1 Proveedor

TODO agregado ──emite──► DomainEvents ──► Auditoría, Historial, Notificaciones, Indicadores, IA
TODO agregado ──pertenece a──► un contexto organizacional (tenant scoping)
```

## 5. Invariantes globales del dominio (resumen normativo)

1. Ninguna entidad transaccional existe fuera de un contexto organizacional.
2. Un activo nunca pertenece permanentemente a un centro de costo: solo asignaciones con vigencia.
3. Toda asignación, traslado o cambio de responsable genera historial; nada se sobrescribe.
4. Ningún concepto del dominio se ramifica por tipo de activo; el tipo es parametrización.
5. Todo hecho de negocio relevante se expresa como Domain Event y queda auditado.
6. Los montos siempre llevan moneda (VO Dinero); las lecturas de horómetro/kilometraje son monotónicas por activo.
7. El estado "actual" (ubicación, responsable, stock, disponibilidad) es una proyección derivada de eventos/historial.
8. Las decisiones analíticas y de IA nunca mutan el dominio directamente: proponen (recomendaciones) y el dominio dispone (OT, planes).

## 6. Lenguaje ubicuo

El vocabulario oficial del negocio está en `08_DICCIONARIO_NEGOCIO.md` y `09_GLOSARIO_DELTAOPS.md`. Toda conversación, documento y contrato futuro debe usar esos términos exactos (p. ej. **Asignación**, no "traslado de dueño"; **Hallazgo**, no "novedad").

## 7. Índice de entregables ETS-003

| Doc | Contenido |
|---|---|
| `01_DOMAIN_MODEL.md` | Este documento — visión y mapa maestro |
| `02_BOUNDED_CONTEXTS.md` | Contextos delimitados y context map |
| `03_DOMAIN_EVENTS.md` | Catálogo completo de eventos de dominio |
| `04_DOMAIN_SERVICES.md` | Motores/servicios de dominio |
| `05_AGGREGATES.md` | Aggregate roots, límites e invariantes |
| `06_VALUE_OBJECTS.md` | Value objects |
| `07_ENTIDADES.md` | Ficha completa de cada entidad |
| `08_DICCIONARIO_NEGOCIO.md` | Diccionario de negocio (términos y significado operativo) |
| `09_GLOSARIO_DELTAOPS.md` | Glosario general DeltaOps (incluye términos DDD) |
