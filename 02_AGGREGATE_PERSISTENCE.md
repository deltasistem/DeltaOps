# 02_AGGREGATE_PERSISTENCE.md

> **DeltaOps — ETS-009 · v1.0** · Cómo persiste cada agregado principal (ETS-003/05). Patrón común + particularidades por agregado.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Patrón común: estado vigente + historia de eventos

Todo agregado persiste en **dos piezas inseparables**:

```text
ESTADO VIGENTE                          HISTORIA
  la foto actual del agregado             los eventos que la produjeron
  ├── identidad (UUID) + tenant           ├── append-only, ordenados por
  ├── contexto organizacional             │   secuencia del agregado
  ├── atributos vigentes                  ├── cada uno con actor, canal,
  ├── versión (concurrencia optimista)    │   tiempo doble, causalidad
  └── referencia a la última secuencia    └── mismos eventos del catálogo
                                              ETS-008/09 (una sola verdad)
```

- El estado vigente existe por **rendimiento y protección de invariantes** (cargar el agregado para validar un comando); la historia es la verdad: ante cualquier discrepancia, la historia manda y el estado se reconstruye de ella.
- Escritura siempre atómica: estado + eventos nuevos + outbox en una transacción (16).
- La concurrencia se protege con la versión del agregado (quien llega tarde recibe `CONFLICTO_VERSION`, ETS-008).

## 2. Activo

- Estado vigente: ficha completa (datos base + atributos dinámicos según plantilla del tenant con su versión), estado del ciclo de vida, asignación vigente, componentes.
- Historia = **hoja de vida** (U-05): la consulta estrella no se arma con joins caros sino desde un read model proyectado de estos mismos eventos (07).
- Los medidores (horómetro, odómetro) NO viven en el agregado como simple número: cada lectura es un hecho (03); el estado vigente solo conserva la última aceptada por medidor como conveniencia derivada.
- Jerarquía activo–componentes: cada componente con identidad propia; el ensamble/desmontaje son eventos — el historial del componente lo sigue a través de activos.

## 3. OT (Orden de Trabajo)

- Estado vigente: cabecera, estado del workflow (con la **versión del workflow** que la gobierna — en vuelo termina con su versión, ETS-005), asignaciones, checklist en curso.
- Historia rica: cada transición, registro de trabajo, consumo, pausa y firma es un evento; el expediente de la OT (ETS-004) es proyección directa.
- La OT cerrada queda **sellada**: el estado vigente ya no admite comandos de modificación (solo compensatorios que crean hechos enlazados); candidata natural a archivado en frío con el tiempo (10).

## 4. Inventario

- El agregado por ítem-bodega persiste **saldo vigente + parámetros** (mínimos, ubicaciones), pero el saldo es estrictamente derivado: la verdad son los movimientos (hechos, 03).
- Invariante protegido en el estado vigente: no despachar más de lo disponible se valida contra el saldo vigente en la transacción del comando.
- La reconciliación periódica saldo-vigente ↔ suma-de-movimientos es un control de calidad automático (ETS-006/17): una discrepancia es un defecto grave, no un ajuste silencioso.

## 5. Proveedor

- Maestro clásico: estado vigente + eventos de cambio (datos de contacto, condiciones, calificaciones).
- Si el ERP es el dueño declarado (ETS-008/13), el estado vigente marca su origen y la edición local se restringe: los cambios llegan como eventos de sincronización con su procedencia auditada.
- Nunca se borra (participa en historia de compras): baja lógica (11).

## 6. Usuario

- Separación estricta (ETS-006/02): **identidad** (credenciales, factores — módulo Identity, cifrado reforzado) vs **perfil laboral** (membresías por contexto con vigencias, roles, licencias — módulo Organization).
- Las membresías son hechos con vigencia temporal: la pregunta "¿qué podía hacer X el 12 de marzo?" se responde desde la historia, no desde el estado actual (requisito de auditoría).
- Datos personales: mínimos, clasificados Restringido, con seudonimización posible en analítica (ETS-006/13); la salida de un empleado es baja lógica que preserva su autoría histórica (11).

## 7. Organización

- El árbol organizacional (empresa→zona→sitio→área, ETS-005) persiste como agregado de nodos con vigencias: las reorganizaciones no reescriben el pasado — un nodo se cierra y otro se abre, y los hechos históricos conservan el contexto donde ocurrieron.
- Las consultas jerárquicas (todo lo de esta zona, incluidos sus hijos) se sirven con una representación derivada del árbol optimizada para descendencia (07), reconstruible.

## 8. Configuración

- El agregado más particular: **nunca tiene "estado vigente" editable** — persiste como cadena de versiones inmutables con estados (borrador→publicada→vigente→histórica) y vigencias (05).
- "La configuración vigente para el contexto X" es un cálculo de cascada (ETS-005/02) servido por un read model resuelto, jamás una edición en sitio.
- Cada hecho transaccional referencia las versiones de configuración que lo gobernaron: la configuración es parte de la explicación de la historia.
