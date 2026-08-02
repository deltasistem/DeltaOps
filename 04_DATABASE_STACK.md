# 04_DATABASE_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de datos.
> Decisiones justificadas; alternativas descartadas con razón objetiva. Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación principal |
|---|---|---|
| **Base de datos principal** | **PostgreSQL 16+** | ETS-010 fue diseñado sobre sus capacidades: RLS (dos murallas), esquemas por módulo, transacciones serias para el UoW+outbox, índices parciales, particionado, JSONB para sobres; madurez y comunidad insuperables; es LA decisión más congelada de este ESI |
| **Caché / estructuras efímeras** | **Redis 7+** | caché de respuestas de consulta y de configuración resuelta (con invalidación por eventos), rate limiting por tenant/integración (ETS-011/22), coordinación ligera de workers; efímero por contrato: **jamás fuente de verdad** |
| **Almacén de objetos** | **Object storage compatible S3** (API S3 como estándar, proveedor sustituible tras el puerto) | flujo de archivos por URL firmada (ETS-011/18) nativo; API S3 es el estándar de facto con implementaciones libres y de nube; los binarios nunca tocan el Core |

## 2. Escalabilidad (dentro de lo normado por ETS-010)

- **Vertical primero**: PostgreSQL escala verticalmente hasta los volúmenes NP normados con holgura.
- **Réplicas de lectura**: consultas pesadas, exportaciones y BI (ETS-012/20) a réplicas; la escritura permanece en el primario — coherente con CQRS.
- **Particionado**: outbox, auditoría y series de alto volumen según lo ya normado en ETS-010; el particionado es mantenimiento, no re-diseño.
- **Redis escala por reemplazo/cluster sin impacto**: al ser efímero, su pérdida total degrada rendimiento, jamás corrección.
- **Object storage escala por naturaleza**; el costo es lineal por almacenamiento.

## 3. Respaldo y recuperación (postura oficial)

- **PostgreSQL**: respaldo continuo con archivado WAL + snapshots programados; objetivo de recuperación punto-en-el-tiempo (PITR); restauraciones **ensayadas** periódicamente — un respaldo no probado no existe.
- **Object storage**: versionado de objetos + replicación según clasificación de datos (ETS-006/13); los derivados no se respaldan (reconstruibles).
- **Redis**: sin respaldo — su contenido es reconstruible por definición; si algo en Redis doliera al perderse, está mal ubicado.
- **Read models y proyecciones**: la estrategia primaria es el replay (ETS-011/10 §replay), el respaldo físico es aceleración.

## 4. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **MySQL/MariaDB** | RLS ausente/limitado — la segunda muralla de ETS-010/12 es innegociable; transaccionalidad y DDL transaccional inferiores |
| **MongoDB / documental como principal** | el UoW exige transacciones multi-tabla serias y el modelo relacional ya está normado (ETS-010); un documental re-abriría decisiones congeladas |
| **Un motor de eventos dedicado (Kafka) para el MVP** | el outbox+despachador sobre PostgreSQL (ETS-009/011) cubre los volúmenes NP del MVP sin operar un clúster adicional; Kafka queda como candidato futuro del roadmap (12) si el volumen lo exige — el contrato de consumidores no cambia |
| **SQLite en producción** | multi-tenant concurrente con RLS y réplicas queda fuera de su alcance (válido solo como herramienta local de desarrollo si algún ESI lo decide) |
| **Memcached** | Redis lo cubre y agrega estructuras (contadores, sorted sets para rate limiting) |
| **Almacenar binarios en PostgreSQL** | prohibido por ETS-011/18 (el binario no pasa por el Core); infla respaldos y WAL |
| **Búsqueda dedicada (Elasticsearch/OpenSearch) en el MVP** | la búsqueda del MVP se sirve con las capacidades de texto de PostgreSQL detrás del puerto ÍndiceDeBúsqueda (ETS-012/19); si la relevancia/volumen lo exige, el motor dedicado entra por el puerto sin tocar módulos — roadmap (12) |

## 5. Reglas de uso

1. Redis nunca guarda nada irrecuperable; toda clave tiene TTL o invalidación por evento.
2. El acceso a PostgreSQL pasa por los adaptadores de persistencia (ETS-012/07); prohibidas conexiones directas desde herramientas de aplicación fuera del gobierno de comandos.
3. Toda URL de object storage servida a clientes es firmada y efímera (ETS-012/18 §regla 6).

---

## Impacto sobre la implementación
Confirma PostgreSQL como columna vertebral física (ya implícito en ETS-010), suma Redis y object storage S3-compatible como piezas oficiales; el diseño físico de ETS-010 se implementa tal cual.

## Dependencias
ETS-010 (todo el diseño físico) · ETS-009 (persistencia) · 02 (SQLAlchemy/Alembic) · 05 (infraestructura que los hospeda).

## Riesgos
- Redis usado como fuente de verdad por comodidad → regla 1 + revisión; su volatilidad se documenta como contrato.
- Búsqueda PostgreSQL insuficiente antes de lo previsto → el puerto ya aísla el cambio; la señal es el presupuesto de latencia (ETS-011/27).

## Decisiones habilitadas
Aprovisionamiento de entornos (05), estrategia de migraciones, implementación del flujo de archivos, caché de configuración resuelta.

## Decisiones bloqueadas
Proveedor concreto de hosting/nube de cada pieza — decisión de despliegue (05/roadmap), sustituible sin re-diseño.
