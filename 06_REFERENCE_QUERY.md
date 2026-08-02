# 06 — Query de Referencia: Listar Elementos de Referencia

> **DeltaOps — ESI-004 · v1.0** · La consulta canónica: plano de lectura puro, paginado por cursor, bajo RLS.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Definición

| Atributo | Valor |
|---|---|
| Nombre | Listar Elementos de Referencia |
| Entrada | Filtro opcional por estado, término de búsqueda por nombre, cursor de paginación, tamaño de página acotado |
| Capacidad | `capacidad_de_referencia` |
| Permiso | `REFERENCIA.ELEMENTO.LISTAR` |
| Salida | Página del contrato ETS-008: elementos proyectados + cursor siguiente |
| Plano | Lectura pura (ETS-011): lector de consulta, sesión de solo lectura, sin repositorios ni agregados (ESI-003/21 §2) |

## 2. Qué demuestra deliberadamente

1. **Separación de planos**: la consulta no toca el repositorio ni carga agregados; proyecta directamente a la forma del contrato. La tentación de "reutilizar el agregado para listar" queda refutada con el ejemplar delante.
2. **RLS como segunda muralla**: la prueba E2E lista con el tenant A y verifica que los elementos del tenant B jamás aparecen, aunque el lector no contenga filtro alguno de tenant.
3. **Paginación por cursor estable**: la prueba inserta elementos entre dos páginas y verifica que no hay saltos ni duplicados (ETS-008).
4. **Autorización de lecturas**: sin `REFERENCIA.ELEMENTO.LISTAR` no hay listado — las consultas se autorizan igual que los comandos (ESI-003/12 regla 4).
5. **Presupuesto de rendimiento**: la consulta declara su presupuesto de latencia y la prueba de calidad lo verifica contra el seed (doc 27).

## 3. Reglas normativas

1. Los filtros son **cerrados y tipados**: la entrada define exactamente qué se puede filtrar; prohibido el "filtro genérico" de campo+operador libre (ESI-003/21 regla 2).
2. El tamaño de página tiene tope de plataforma (plano plataforma, ESI-003/08); pedir más no es error, devuelve el tope.
3. La proyección expone **solo lo que el contrato ETS-008 declara**: nada de columnas "de más" porque estaban a mano.

## Impacto sobre la implementación

Instancia canónica de la plantilla T02 (ESI-002/18); patrón de todo listado futuro, incluidas las bandejas de trabajo de usuario (ETS-011).

## Dependencias

Docs 04 y 15; ESI-003/12 y /21; ETS-008 (contrato y paginación), ETS-009 (RLS), ETS-011 (plano de lectura).

## Riesgos

- Lectores futuros degenerando en constructores de consultas dinámicas; mitigación: regla de filtros cerrados con el ejemplar como referencia de revisión.

## Decisiones habilitadas

- Plantilla T02 verificada contra una instancia real.
- Prueba patrón de estabilidad de cursor reutilizable.

## Decisiones bloqueadas

- Prohibido cargar agregados para listar.
- Prohibida la paginación por desplazamiento (`OFFSET`) en listados.
- Prohibidos filtros genéricos de campo libre.

## Reusable Pattern

Los DGP futuros copian: la tabla §1 como formulario de toda consulta, las cinco demostraciones §2 como pruebas obligatorias de todo listado (separación de planos, RLS, cursor estable, autorización, presupuesto), y las tres reglas §3 tal cual.

## Anti-Patterns

- Consultas que reutilizan repositorios de escritura "para no duplicar".
- Endpoints de listado sin permiso declarado "porque solo leen".
- Proyecciones que exponen el modelo físico en lugar del contrato.
