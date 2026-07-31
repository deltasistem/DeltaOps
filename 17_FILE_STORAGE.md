# 17_FILE_STORAGE.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia física de archivos: qué guarda PostgreSQL de los binarios y cómo.
> El contrato es ETS-008/11 y la estrategia ETS-009/13: el binario jamás entra al motor — PostgreSQL guarda su verdad (metadatos).
> Documento de diseño. Sin SQL.

---

## 1. Piezas físicas en el esquema `archivos`

| Tabla | Contenido físico |
|---|---|
| `archivo` | Metadato completo: `id` (UUID, el nombre físico en objetos es este UUID opaco), dueño lógico (polimórfico controlado: `tipo_dueno` + `id_dueno`, 04 §5), nombre original, tipo verificado, tamaño, `huella` (contenido), clasificación, estado (`pendiente/disponible/cuarentena/archivado`), categoría, `id_tenant/id_contexto/actor/creado_en` |
| `documento` + `documento_version` | Patrón versionable (03 §0): cada versión referencia su `archivo` propio; puntero a versión vigente en la definición |
| `subida_pendiente` | Planes de subida por partes: partes esperadas/recibidas con huella por parte, vencimiento generoso (ETS-008/11 §6) |
| `acceso_archivo` | Hecho por emisión de URL firmada sobre material Restringido (particionada, alimenta auditoría 15) |

## 2. Reglas físicas

1. **Ni un byte de binario en PostgreSQL**: sin `bytea` de contenido, sin objetos grandes del motor. La única excepción tolerada: nada — incluso las miniaturas viven en objetos (derivados desechables, ETS-009/13 §5, sin fila propia: se derivan por convención de nombre del original).
2. **El estado del archivo es una máquina explícita** con transiciones por hechos (solicitud→pendiente→disponible / cuarentena): las consultas operativas filtran por estado con índice parcial (08 §2) — "evidencias pendientes de subir" es una pregunta indexada.
3. **Huella obligatoria al confirmar**: `disponible` exige huella verificada; la huella hace el binario demostrable para siempre (evidencia legal) y detecta duplicados exactos por tenant (deduplicación lógica opcional: mismo contenido, metadatos distintos — el binario físico puede compartirse por conteo de referencias en objetos, decisión de implementación).
4. **Reconciliación bidireccional programada** metadatos↔objetos (ETS-009/13 §4): huérfanos de objetos purgables tras plazo; metadatos sin objeto = alerta de integridad. Resultados en `plataforma.resultado_reconciliacion`.
5. **RLS y permisos por dueño lógico**: el acceso al metadato hereda el permiso de la entidad dueña (validado por dominio al emitir URL firmada); RLS de tenant como muralla física.
6. Temperaturas: `archivado` refleja el tránsito a frío del binario (ETS-009/10); el metadato queda siempre caliente (encontrar es caliente, traer puede ser frío).

---

## Impacto sobre la implementación
Define el esquema `archivos` completo del catálogo (03); la implementación de subidas/descargas construye contra estas tablas y la máquina de estados; la reconciliación es job de serie.

## ETS relacionados
ETS-008 (11 contrato de archivos) · ETS-009 (13 almacenes) · ETS-007 (07 arquitectura de archivos, NT-09) · ETS-010 (04 polimorfismo, 09 particiones, 15 auditoría).

## Riesgos
- Deduplicación física mal contada borra binarios referenciados → si se adopta, conteo de referencias transaccional y verificación en la reconciliación; alternativa segura: no deduplicar (costo asumido).
- Estados huérfanos (`pendiente` eterno) → vencimientos con limpieza gobernada (el plan vence, el metadato pasa a estado terminal auditado).

## Decisiones habilitadas
DDL del esquema `archivos`, jobs de reconciliación y vencimiento, integración con el almacén de objetos.

## Decisiones bloqueadas hasta el siguiente ETS
Adopción o no de deduplicación física (decisión de implementación con datos de costo) y el proveedor concreto de objetos por región.
