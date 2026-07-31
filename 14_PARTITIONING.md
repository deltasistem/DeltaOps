# 14_PARTITIONING.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de particionado: por tiempo, por tenant, por operación y para históricos.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Las dos dimensiones naturales

Todo dato de DeltaOps tiene dos coordenadas que el particionado explota:

- **Tenant:** la unidad de aislamiento, facturación, respaldo y purga (01 §4).
- **Tiempo:** los hechos son un flujo que solo crece hacia adelante (04); lo reciente es caliente, lo viejo se enfría en bloques.

## 2. Por tenant

- **Arranque: aislamiento lógico con clave de tenant obligatoria** en toda estructura de ambos planos — impuesta por la capa de acceso a datos (imposible consultar sin tenant, verificado por pruebas de fuga cross-tenant, ETS-007/05).
- El diseño permite **graduar el aislamiento por tenant sin cambiar contratos**: lógico compartido (defecto) → particiones dedicadas por tenant grande → infraestructura dedicada para el tenant que la pague/exija (residencia, regulación). La clave de tenant omnipresente es lo que hace el movimiento posible: migrar un tenant es exportar su clave.
- Cifrado por tenant (claves separadas) refuerza el aislamiento en cualquier grado físico.
- Operaciones por tenant que el particionado habilita: exportación completa, purga contractual al terminar el servicio, restauración selectiva (17-18), medición de costo (10 §4).

## 3. Por tiempo

- **Los hechos y eventos se particionan por rango de tiempo** (mensual como grano típico; los de volumen extremo — lecturas, telemetría aceptada — más fino): las escrituras van siempre a la partición actual (localidad máxima), las consultas operativas tocan pocas particiones recientes (poda por rango), y el envejecimiento es administración de particiones completas — comprimir, des-indexar parcialmente, archivar en frío (10 §1) — jamás filas una a una.
- La partición se hace por **fecha de registro** (los bloques físicos jamás se reabren: lo que llega tarde entra en el bloque de hoy); la consulta por fecha de negocio la sirven los índices y read models proyectados por fecha de negocio (04 §5) — la física no miente sobre cuándo se supo, el negocio consulta cuándo ocurrió.
- Fotos de corte y vistas por periodo (08-09) heredan el mismo grano temporal: un periodo, un bloque.

## 4. Por operación (separación de cargas)

Particionado en el sentido de **aislar patrones de trabajo** para que no compitan:

| Carga | Aislamiento |
|---|---|
| Escritura transaccional (comandos) | El plano de la verdad, dimensionado para su latencia (15) |
| Lecturas operativas (pantallas) | Read models y réplicas de lectura |
| Analítica/BI/reportes pesados | Marts y réplicas dedicadas — jamás sobre la verdad caliente (07 §6) |
| Auditoría forense | Réplica de Audit separada (06 §1) |
| Ingesta IoT por lotes | Zona de aterrizaje propia con absorción por cola (ETS-008/13 §5) |
| Reconstrucciones/replay | A prioridad baja sobre réplicas, gobernado (08 §3) |

## 5. Históricos

- Lo tibio permanece en el motor en particiones comprimidas con índices reducidos (los patrones de consulta históricos son más simples: por entidad y rango).
- Lo frío sale del motor a objetos en formato columnar abierto por partición (10): consultable por rehidratación gobernada; su lugar en el motor lo ocupa solo su registro de existencia (qué rango, dónde, huella de integridad).
- El horizonte caliente/tibio/frío es política por familia de datos y por tenant (dentro de mínimos de plataforma, 10 §2) — un tenant intensivo en auditoría puede pagar más historia caliente.
- Los snapshots (09) marcan los puntos de apoyo: ninguna operación normal necesita releer particiones frías — solo la auditoría profunda y el replay total.
