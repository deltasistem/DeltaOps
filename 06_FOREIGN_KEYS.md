# 06_FOREIGN_KEYS.md

> **DeltaOps — ETS-010 · v1.0** · Estrategia de claves foráneas: dónde hay FK física, dónde no, y con qué políticas.
> Complementa 04 (relaciones). Documento de diseño. Sin SQL.

---

## 1. Dónde SÍ hay FK física

**Dentro del mismo esquema (mismo módulo dueño):**

- Detalle→cabecera del mismo agregado (`ot_transicion → orden_trabajo`, `conteo_detalle → conteo`).
- Versión→definición (`formulario_version → formulario_definicion`).
- Hecho→maestro del mismo módulo (`movimiento → item`, `movimiento → bodega`).
- Hecho compensatorio→hecho compensado (mismo esquema).
- Todo→`organizacion.tenant` y →`organizacion.nodo_organizacional`: **excepción deliberada de esquema cruzado** — tenant y contexto son estructurales (RLS depende de ellos), Organization es "hacia abajo" para todos (NT-05), y esa dependencia física universal es aceptada y documentada.
- →`identidad.cuenta` para columnas de actor: misma excepción estructural (la autoría debe ser íntegra).

## 2. Dónde NO hay FK física (referencia débil por UUID)

- **Entre esquemas de verdad de módulos distintos** (regla NT-03): `orden_trabajo → activos.activo`, `tanqueo → activos.activo`, `movimiento → ordenes_trabajo.orden_trabajo` (causa)… El dominio valida la existencia al aceptar el comando; la reconciliación programada verifica después (04).
- **Hacia tablas de hechos particionadas** (PK compuesta, 05 §2).
- **Relaciones polimórficas controladas** (archivos, sugerencias — 04 §5).
- **Desde read models y marts hacia cualquier verdad**: los derivados jamás declaran FKs (se reconstruyen; una FK los volvería frágiles al replay).
- **Versiones de configuración congeladas en hechos**: son copia semántica (id + número), no referencia viva.

## 3. Políticas de las FKs físicas

| Política | Regla |
|---|---|
| **ON DELETE** | `RESTRICT` universal. No hay CASCADE en el plano de la verdad: nada se borra (append-only + bajas lógicas, ETS-009/04, 11); un borrado físico que encuentre hijos debe fallar ruidosamente porque no debería estar ocurriendo |
| **ON UPDATE** | `RESTRICT` (los UUID jamás cambian — un update de PK es un defecto) |
| **Validación** | FKs siempre validadas; en migraciones sobre tablas gigantes se admite crear como NOT VALID + VALIDATE posterior (patrón expandir, 19) — el estado final es siempre validado |
| **Índice** | Toda columna FK lleva índice (08) — PostgreSQL no lo crea solo |
| **DEFERRABLE** | No se usa por defecto; solo se admitiría documentado en la excepción concreta |

## 4. Integridad de las referencias débiles

Cada referencia débil paga su disciplina (sin esto, §2 sería negligencia):

1. Validación de existencia y tenant **dentro de la transacción del comando** (el dominio la hace de todos modos: precondiciones ETS-008/03).
2. `id_tenant` redundante en ambas puntas + RLS: una referencia jamás puede cruzar tenants aunque el UUID exista.
3. Reconciliación programada por relación (04) con alerta — huérfanos detectados, no descubiertos.
4. La baja lógica del referenciado no rompe nada: la referencia histórica sigue resolviendo (ETS-009/11 §3).

---

## Impacto sobre la implementación
El DDL declara FKs exactamente donde §1 dice y ninguna más; toda FK con RESTRICT e índice; las débiles llevan su validación en el dominio y su reconciliación registrada.

## ETS relacionados
ETS-007 (NT-03, NT-05) · ETS-009 (04 append-only, 11 soft delete, 12 identidad) · ETS-010/04 (relaciones).

## Riesgos
- Las excepciones estructurales (tenant/contexto/actor) crean acoplamiento físico universal hacia `organizacion`/`identidad` → aceptado y documentado: esos módulos son el suelo de todos (extraerlos algún día exigiría replicación local de esas tablas, decisión de 21).
- RESTRICT puede sorprender a operaciones administrativas mal concebidas → correcto: deben fallar.

## Decisiones habilitadas
Índices de FKs (08), patrón NOT VALID en migraciones (19), reconciliaciones (plataforma).

## Decisiones bloqueadas hasta el siguiente ETS
Lista exhaustiva FK por FK (va con el DDL, obedeciendo estas reglas).
