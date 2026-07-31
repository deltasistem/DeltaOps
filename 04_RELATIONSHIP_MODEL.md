# 04_RELATIONSHIP_MODEL.md

> **DeltaOps — ETS-010 · v1.0** · Relaciones conceptuales del modelo físico: cómo se conectan las tablas dentro y entre esquemas.
> Documento de diseño. Sin SQL.

---

## 1. Los tres tipos de relación física

| Tipo | Dónde | Integridad |
|---|---|---|
| **Fuerte (FK física)** | Dentro del mismo esquema/agregado | Restricción declarada en la BD (06) |
| **Débil (referencia por UUID sin FK)** | Entre módulos (esquemas de verdad distintos) | Validada por el dominio al escribir; verificada por reconciliación — jamás FK física entre esquemas de módulos distintos (preserva NT-03 y la extracción futura) |
| **Congelada (copia en el hecho)** | Dentro de hechos históricos | El hecho copia lo que debe quedar congelado (tarifa, precio, nombre del momento): no es desnormalización accidental, es semántica de historia |

## 2. Relaciones estructurales principales

```text
organizacion.tenant 1─N organizacion.nodo_organizacional (árbol por id_padre)
tenant 1─N TODO (id_tenant en cada tabla — la relación omnipresente, RLS)
nodo_organizacional 1─N membresía, activo (asignación vigente), OT, bodega…
   (id_contexto en cada registro: el contexto donde ocurre/vive)

activos.activo 1─N lectura_medidor, asignacion, activo_componente
activos.activo 1─N ordenes_trabajo.orden_trabajo         (débil)
ordenes_trabajo.orden_trabajo 1─N ot_transicion, registro_trabajo,
                                   checklist_diligenciado, hallazgo (fuertes)
hallazgo 1─0..1 solicitud 1─0..1 orden_trabajo (cadena de origen, débil
                                   entre agregados, misma bd de módulo)
inventario.movimiento N─1 item, bodega (fuertes) · N─0..1 OT (débil, causa)
combustible_energia.tanqueo N─1 activo (débil) · N─0..1 tanque (fuerte)
compras: solicitud_compra → aprobacion → orden_compra → recepcion →
         factura_registrada (cadena fuerte dentro del esquema)
archivos.archivo N─1 dueño lógico (débil polimórfica: tipo_dueno + id_dueno)
configuracion.*_version N─1 *_definicion (fuerte); TODO hecho → versiones
         de configuración usadas (congelada: ids + números de versión)
mensajeria.outbox_* N─1 evento origen (fuerte por módulo)
ia.sugerencia N─1 entidad objetivo (débil) · hechos aceptados → sugerencia (débil)
```

## 3. Relaciones temporales (con vigencia)

Membresías, asignaciones, vigencias de configuración y nodos organizacionales relacionan **con intervalo** (`vigente_desde`/`vigente_hasta`): la pregunta histórica ("qué regía el 12 de marzo") es un predicado de intervalo, no un join simple. El "hasta" lo escribe un hecho posterior, nunca una edición (ETS-009/03 §7).

## 4. Relaciones de historia

- Todo hecho compensatorio → hecho compensado (`id_hecho_compensado`, dentro del mismo esquema, fuerte).
- Todo evento → agregado origen (`tipo_agregado` + `id_agregado` + `secuencia_agregado`) y → causalidad (`id_comando`, `id_evento_causa`) — las cadenas causales de ETS-008/09.
- Componentes: la historia de un componente atraviesa activos vía hechos de ensamble/desmontaje — la relación vigente es derivable y está materializada en el estado vigente.

## 5. Polimorfismo controlado

Solo dos relaciones polimórficas se admiten (tipo + id): el **dueño lógico de archivos** y la **entidad objetivo** de sugerencias IA/notificaciones/línea de tiempo. Se pagan con validación de dominio (el tipo pertenece a un catálogo cerrado) y sin FK física; ninguna otra tabla introduce polimorfismo sin pasar por la revisión de convenciones (07).

---

## Impacto sobre la implementación
Fija dónde habrá FK reales y dónde referencias débiles validadas por dominio: el DDL y la capa de acceso a datos deben respetar esta frontera exactamente.

## ETS relacionados
ETS-003 (agregados y sus fronteras) · ETS-007 (NT-03 propiedad) · ETS-009 (02-04, 12 identidad) · ETS-006 (14 conflictos, 08 ownership).

## Riesgos
- Referencias débiles sin su reconciliación programada = integridad en fe → cada relación débil listada aquí debe tener verificación periódica registrada en `plataforma.resultado_reconciliacion`.
- Abuso del polimorfismo controlado → limitado a los dos casos declarados.

## Decisiones habilitadas
Claves foráneas concretas (06), índices de las rutas de join (08), verificaciones de reconciliación.

## Decisiones bloqueadas hasta el siguiente ETS
Cardinalidades finas por columna y reglas ON DELETE específicas (06 fija la política general; el detalle por FK va con el DDL).
