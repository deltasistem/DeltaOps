# 01_PERSISTENCE_STRATEGY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de persistencia y almacenamiento. Este documento fija el marco; los 19 restantes lo detallan.
> Entrada: ETS-001…008. Documento de diseño: no crea tablas, no genera SQL, no diseña un motor concreto.

---

## 1. La decisión central: dos planos de persistencia

Toda la persistencia de DeltaOps se organiza en **dos planos** que materializan el CQRS de ETS-006/11:

```text
PLANO DE LA VERDAD (escritura)
  ├── Hechos y eventos: append-only, inmutables, con tiempo doble
  ├── Agregados: estado vigente derivado y protegido por invariantes
  ├── Configuración: versiones inmutables con vigencias
  └── Auditoría: el propio flujo de eventos, sellado (06)
  Propiedad: transaccional fuerte por agregado, durable, la única
  fuente de la que todo lo demás puede reconstruirse.

PLANO DERIVADO (lectura)
  ├── Read models por consulta (07)
  ├── Vistas materializadas y agregaciones (08)
  ├── Índice de búsqueda, marts analíticos, contexto de IA
  └── Caches (ETS-007/11)
  Propiedad: 100 % RECONSTRUIBLE desde el plano de la verdad.
  Perderlo es un incidente de rendimiento, jamás de datos.
```

La regla que gobierna todo diseño posterior: **si un dato no puede reconstruirse, vive en el plano de la verdad; si puede, vive en el derivado** — y nunca al revés.

## 2. Principios aplicados a la persistencia

| Principio | Consecuencia en persistencia |
|---|---|
| Organization First | Todo registro lleva tenant + contexto organizacional desde su nacimiento; ninguna consulta física puede omitir el tenant (ETS-007/05) |
| Append Only | Los hechos jamás se actualizan ni borran; las correcciones son nuevos hechos compensatorios enlazados (04) |
| Audit by Design | La auditoría no es una tabla aparte que alguien llena: es el flujo de eventos persistido con integridad propia (06) |
| CQRS | Escritura y lectura tienen modelos de persistencia distintos, conectados solo por eventos (07) |
| API First | La persistencia jamás se expone: solo los contratos ETS-008 la tocan; ningún cliente conoce la forma física |
| Offline First | Los dispositivos tienen su propia persistencia local (cola + réplica de alcance) con identidades provisionales resolubles (12) |
| Configuration First | La configuración es dato versionado e inmutable, nunca constantes del código (05) |
| UUID First | Toda identidad es un identificador universal generado sin coordinación — la base del offline y de la fusión de datos (12) |
| Version First | Todo lo que evoluciona (configuración, documentos, esquemas, read models) persiste por versiones que conviven (05, 18) |
| Single Source of Truth | Cada dato tiene exactamente un dueño persistente (ETS-006/08); todo lo demás son copias declaradas y reconstruibles |

## 3. Familias de datos y su persistencia

Cada familia de ETS-006 recibe una estrategia distinta — no hay una talla única:

| Familia | Estrategia | Detalle |
|---|---|---|
| Maestros (activos, proveedores, ítems, usuarios, organización) | Agregado con estado vigente + historia de cambios como eventos | 02 |
| Transaccionales (checklists, combustible, HH, compras, movimientos, lecturas) | Hechos append-only puros; el estado es consecuencia | 03 |
| Configuración (formularios, workflows, reglas, catálogos) | Versiones inmutables con vigencia y publicación | 05 |
| Auditoría | El flujo de eventos con cadena de integridad, separado lógicamente | 06 |
| Derivados (dashboards, BI, IA, búsqueda) | Read models reconstruibles, sin garantías de durabilidad propia | 07, 08 |
| Binarios (evidencias, documentos, fotos) | Almacén de objetos con metadatos en el plano de la verdad | 13 |
| Telemetría cruda IoT | Retención corta en zona de aterrizaje; solo los hechos aceptados son permanentes | 13, 19 |

## 4. Unidades de aislamiento

- **El tenant es la unidad absoluta:** aislamiento lógico con clave de tenant obligatoria en toda estructura, cifrado por tenant y capacidad de exportar/purgar/restaurar un tenant completo sin tocar a los demás (ETS-006/13, 17-18).
- **El módulo es la unidad de propiedad:** cada módulo de ETS-007 posee sus estructuras de persistencia y nadie más las lee o escribe directamente — la integración es por eventos y contratos, jamás por consultas cruzadas al almacén ajeno (ETS-007 NT-03).
- **El agregado es la unidad transaccional:** una transacción = un agregado + sus eventos en el outbox (16).

## 5. Neutralidad de motor

La estrategia se define por **capacidades requeridas**, no por productos: transacciones fuertes por agregado, append eficiente, consultas por índices secundarios, particionado por tiempo y tenant, búsqueda de texto, almacén de objetos con URLs firmadas, cola durable. El motor relacional gestionado del arranque (ETS-007/14) las cubre todas al inicio; la evolución hacia motores especializados (series de tiempo, lakehouse) está prevista y aislada tras los mismos contratos (19). Ningún documento de esta serie asume sintaxis ni características exclusivas de un producto.

## 6. Mapa de la serie

02 agregados · 03 transaccionales · 04 append-only · 05 versionado · 06 auditoría · 07 read models · 08 vistas materializadas · 09 snapshots · 10 archivado · 11 borrado lógico · 12 identidad · 13 almacenamiento · 14 particionado · 15 rendimiento · 16 consistencia · 17 respaldo · 18 migraciones · 19 evolución futura · 20 lineamientos (cierre normativo).
