# 01_DATABASE_ARCHITECTURE.md

> **DeltaOps — ETS-010 · v1.0** · Arquitectura física general de la base de datos PostgreSQL empresarial.
> Materializa la estrategia ETS-009 sobre PostgreSQL gestionado (ETS-007/14). Documento de diseño: sin SQL, sin migraciones.

---

## 1. Topología física

```text
CLÚSTER POSTGRESQL GESTIONADO (por región de residencia de datos)
│
├── INSTANCIA PRIMARIA (escritura)
│     └── Base de datos DELTAOPS
│           ├── Esquemas del PLANO DE LA VERDAD (por dominio, 02)
│           │     agregados, hechos, eventos, outbox, configuración,
│           │     metadatos de archivos, sync
│           ├── Esquemas del PLANO DERIVADO
│           │     read models, vistas materializadas, réplica de audit
│           └── Esquema de PLATAFORMA
│                 control de migraciones, jobs, salud
│
├── RÉPLICAS DE LECTURA (streaming, N según carga)
│     lecturas operativas pesadas, marts BI, reportes, replay
│
└── SERVICIOS ADYACENTES (fuera de PostgreSQL, ETS-009/13)
      almacén de objetos (binarios) · cache (efímero) · cola durable
```

- **Una base de datos por entorno**, esquemas por dominio (no una BD por módulo): las transacciones agregado+outbox son locales, la operación es simple, y la separación lógica por esquema preserva la propiedad por módulo (NT-03) permitiendo extraer un esquema a clúster propio si algún día un módulo se separa (ETS-007).
- **Aislamiento multi-tenant lógico** (ETS-009/14): `id_tenant` obligatorio en toda tabla de ambos planos + políticas de seguridad a nivel de fila (RLS) como segunda muralla — la aplicación fija el tenant de la sesión y RLS garantiza que ninguna consulta, ni siquiera defectuosa, cruce tenants.
- Réplicas de lectura para separación de cargas (ETS-009/14 §4); el retraso de réplica queda cubierto por la frescura declarada (ETS-008).

## 2. Los dos planos dentro del clúster

| Plano | Esquemas | Régimen |
|---|---|---|
| Verdad | dominio_* (02 §2) | Transaccional fuerte, append-only en hechos/eventos, respaldo PITR, RLS estricta |
| Derivado | lectura_*, audit_consulta | Reconstruible por replay; índices ricos; puede moverse a réplicas/motores dedicados sin tocar la verdad |
| Plataforma | plataforma | Control operativo (migraciones aplicadas, jobs, cursores de proyección) |

## 3. Conexiones y roles

- **Agrupador de conexiones** (pooling) obligatorio entre la aplicación y PostgreSQL; transacciones cortas (una transacción = un comando, ETS-009/16).
- Roles de base de datos por función, con mínimo privilegio: rol de escritura por módulo (solo sus esquemas), rol de proyección (lee eventos, escribe derivados), rol de solo-lectura para BI/reportes (solo esquemas derivados), rol de migración (DDL, usado solo por el proceso de migración), rol de auditoría (solo lectura de audit). Ninguna aplicación se conecta como superusuario jamás.
- Credenciales desde la bóveda con rotación (ETS-007/12); cifrado en tránsito obligatorio.

## 4. Durabilidad y disponibilidad

- Alta disponibilidad gestionada: primaria con espera síncrona en zona distinta; conmutación automática (RTO minutos, ETS-007/15).
- Respaldo continuo con recuperación a punto en el tiempo (PITR) — RPO cercano a cero (ETS-009/17); restauraciones de prueba programadas.
- Los esquemas de eventos reciben además copia lógica inmutable exportada (la póliza última, ETS-009/17 §2).

## 5. Límites de lo que vive en PostgreSQL

En PostgreSQL: todo lo estructurado de ambos planos. Fuera: binarios (almacén de objetos), cache (memoria), colas de alto volumen en tránsito (la cola durable propia; el outbox sí es tabla), telemetría cruda IoT (zona de aterrizaje; solo hechos aceptados entran), índice de búsqueda avanzada cuando supere el texto completo nativo (ETS-009/19).

---

## Impacto sobre la implementación
Define la topología que toda la serie asume: una BD, esquemas por dominio, RLS por tenant, pooling, roles por función, réplicas para lectura pesada. Cualquier código de acceso a datos deberá fijar tenant de sesión y respetar los roles.

## ETS relacionados
ETS-007 (14 cloud, 15 despliegue, 12 seguridad, NT-03/04) · ETS-009 (01 planos, 13 almacenes, 14 particionado, 16 consistencia, 17 respaldo) · ETS-006 (13 seguridad de datos) · ETS-008 (frescura declarada).

## Riesgos
- RLS mal configurada da falsa sensación de seguridad → pruebas de fuga cross-tenant obligatorias en CI (ETS-007/05).
- Una sola BD concentra el radio de daño operativo → mitigado por PITR, réplica síncrona y separación por esquemas que permite extracción futura.
- El pooling con RLS exige disciplina en la fijación de tenant por sesión/transacción → convención única en la capa de acceso a datos (07).

## Decisiones habilitadas
Diseño de esquemas (02), catálogo de tablas (03), roles y convenciones (07), particionado físico (09), estrategia de réplicas (20).

## Decisiones bloqueadas hasta el siguiente ETS
Dimensionamiento concreto de instancias, número de réplicas, parámetros del motor y del pooler, y la implementación del código de acceso a datos (ORM/driver) — corresponden a la fase de implementación que estos documentos gobiernan.
