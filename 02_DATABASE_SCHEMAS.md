# 02_DATABASE_SCHEMAS.md

> **DeltaOps — ETS-010 · v1.0** · Esquemas PostgreSQL por dominio: el mapa de propiedad física.
> Regla: esquema = frontera de propiedad de un módulo (NT-03). Nadie consulta el esquema de otro módulo; la integración es por eventos y contratos.
> Documento de diseño. Sin SQL.

---

## 1. Convención

- Nombres de esquema en español, minúsculas, singular del dominio: `identidad`, `organizacion`, `activos`…
- Prefijo de plano solo en los derivados: `lectura_*` (read models/vistas del módulo) y `audit_consulta` — la verdad usa el nombre del dominio a secas.
- Cada esquema tiene exactamente un módulo dueño (ETS-007/03) con su rol de escritura (01 §3).

## 2. Catálogo de esquemas del plano de la verdad

| Esquema | Módulo dueño (ETS-007) | Contenido principal |
|---|---|---|
| `nucleo` | Core | Catálogos canónicos de plataforma, KPIs canónicos, unidades |
| `identidad` | Identity | Cuentas, credenciales, factores, sesiones/refresco, cuentas de servicio, api keys, dispositivos registrados |
| `organizacion` | Organization | Tenants, árbol organizacional con vigencias, membresías, roles, permisos, delegaciones, licencias |
| `configuracion` | Configuration | Definiciones y versiones (formularios, catálogos del tenant, parámetros, plantillas de activo), vigencias, publicaciones, paquetes emitidos |
| `auditoria` | Audit | Flujo sellado: cadena de huellas, sellos de periodo, registros de acceso sensible |
| `activos` | Assets | Activos, componentes, plantillas aplicadas, asignaciones, medidores y lecturas |
| `mantenimiento` | Maintenance | Planes preventivos, rutinas, programaciones, cumplimiento |
| `ordenes_trabajo` | Work Orders | Solicitudes, OTs, transiciones, registros de trabajo (HH), checklists diligenciados, hallazgos |
| `inventario` | Inventory | Ítems, bodegas, saldos vigentes, movimientos, conteos |
| `combustible_energia` | Fuel & Energy | Tanqueos, cargas de energía, tanques propios, rendimientos base |
| `compras` | Purchasing | Solicitudes de compra, aprobaciones, OCs, recepciones, facturas registradas, proveedores* |
| `bodega` | Warehouse | Despachos, devoluciones, ubicaciones físicas |
| `flujo_trabajo` | Workflow | Definiciones y versiones de workflows, instancias en curso |
| `reglas` | Rules | Definiciones y versiones de reglas, disparos (hechos) |
| `notificaciones` | Notifications | Plantillas, envíos, acuses, preferencias |
| `archivos` | Files | Metadatos de binarios: dueño lógico, huella, estado, versiones de documentos |
| `busqueda` | Search | Cursores y control del índice (el índice textual vive en `lectura_busqueda`) |
| `reportes` | Reporting | Definiciones de reportes, emisiones congeladas (metadatos; el PDF en objetos) |
| `analitica` | Analytics | Definiciones de marts, cursores, diccionario publicado |
| `ia` | AI | Conversaciones, sugerencias con trazabilidad, retroalimentación, calibración |
| `movil` | Mobile | Bitácoras recibidas, resultados por comando, estado por dispositivo |
| `integracion` | Integration | Conexiones, mapeos versionados, bandejas de errores, trazas de intercambio |
| `mensajeria` | (plataforma) | Outbox por módulo, cursores de consumidores |

\* Proveedores viven en `compras` como dueño (ETS-006/08); si el ERP es el dueño declarado, el mapeo lo gobierna `integracion`.

## 3. Esquemas del plano derivado

| Esquema | Contenido |
|---|---|
| `lectura_<dominio>` (uno por módulo con consultas propias) | Read models desnormalizados del módulo: `lectura_activos` (hoja de vida, ficha), `lectura_ordenes_trabajo` (expediente, backlog), `lectura_indicadores` (KPIs pre-agregados, 10)… |
| `lectura_busqueda` | Índice de texto completo global por tenant |
| `audit_consulta` | Réplica indexada del flujo para consulta forense (15) |
| `marts` | Estructuras dimensionales para Power BI (contrato externo estable) |

## 4. Esquema `plataforma`

Control operativo: registro de migraciones aplicadas, cursores de proyección y su retraso, trabajos programados, resultados de reconciliaciones y restauraciones de prueba. Sin datos de negocio; sin RLS de tenant (es del sistema).

---

## Impacto sobre la implementación
Todo artefacto físico nace en el esquema de su módulo dueño; los permisos de roles se conceden por esquema; mover un módulo a infraestructura propia = mover su(s) esquema(s).

## ETS relacionados
ETS-007 (03 catálogo de módulos, NT-03) · ETS-009 (01 §4 propiedad, 07 read models) · ETS-006 (08 data ownership).

## Riesgos
- Tentación de joins entre esquemas de verdad de módulos distintos → prohibido por convención y por permisos de rol; la necesidad real se resuelve con read models o eventos.
- Proliferación de esquemas derivados sin gobierno → cada read model se registra con dueño y fuente (ETS-009/08 §2).

## Decisiones habilitadas
Catálogo de tablas por esquema (03), permisos por rol y esquema (07), extracción futura de módulos (21).

## Decisiones bloqueadas hasta el siguiente ETS
Nombres definitivos de cada tabla y columna (se fijan en 03 y 22) y cualquier DDL.
