# 13_DEPENDENCY_MANAGEMENT.md

> **DeltaOps — ESI-002 · v1.0** · Gestión de dependencias: pocas, justificadas, bloqueadas y frescas.
> Sin código.

---

## 1. Principios

1. **Toda dependencia es deuda asumida a sabiendas**: agregar una librería de producción exige justificación (¿resuelve algo que no debemos escribir?) y al menos un ADR ligero; la dependencia "porque estaba a mano" se rechaza en revisión.
2. **Lockfiles siempre y para todo** (ESI-001/02): uv para Python, lockfile del gestor JS para el frontend; la resolución libre no existe — ni en local, ni en CI, ni en imagen.
3. **El stack oficial primero**: antes de agregar una librería se verifica si el stack de ESI-001 ya cubre la necesidad; duplicar capacidades (dos clientes HTTP, dos librerías de fechas) está prohibido sin ADR que supersede.
4. **Dependencia directa ≠ transitiva**: solo las directas se declaran; fijar transitivas a mano es excepción documentada con vencimiento (mientras dura un incidente aguas arriba).

## 2. Criterios de admisión de una dependencia nueva

| Criterio | Umbral |
|---|---|
| Licencia | compatible (lista de licencias aprobadas en el repo); copyleft fuerte requiere análisis explícito |
| Mantenimiento | actividad reciente, mantenedores identificables, historial de CVEs gestionado |
| Peso | proporcional al problema: no se adopta un framework para usar una función |
| Alternativa interna | escribirlo costaría significativamente más que adoptarlo Y mantenerlo |
| Superficie | sin telemetría propia, sin ejecución en instalación sospechosa (cadena de suministro) |

## 3. Actualización continua (Renovate, ESI-001/10)

1. **Renovate propone por goteo**: parches y menores agrupados con cadencia regular; mayores en PRs individuales con notas de migración leídas por un humano.
2. **Todo PR de actualización pasa la puerta completa** — la suite es la red; la actualización sin suite verde no se mergea.
3. **Presupuesto de frescura**: ninguna dependencia directa con más de una versión mayor de atraso sin expediente; el atraso silencioso se vuelve visible en la revisión trimestral (27).
4. **Seguridad manda**: los avisos críticos/altos disparan actualización inmediata fuera de cadencia (ESI-001/08 §regla 1).

## 4. Bajas y sustituciones

- La dependencia que deja de usarse se elimina en el mismo PR que elimina su último uso — el lockfile no acumula fósiles.
- Sustituir una dependencia relevante (ORM, framework, librería de fechas) es decisión de stack: ADR que supersede (ESI-001/11) y plan de migración; jamás convivencia indefinida de ambas.

## 5. Paquetes internos (02)

Los paquetes del monorepo se consumen por workspace, sin versión propia ni publicación; sus dependencias externas siguen estas mismas reglas y se declaran donde se usan — el paquete interno no es un lugar para esconder dependencias.

---

## Impacto sobre la implementación
El esqueleto nace con lockfiles, lista de licencias aprobadas, Renovate configurado y el árbol mínimo del stack oficial; toda incorporación posterior sigue el criterio de admisión.

## Dependencias
ESI-001/02-03 (stacks y gestores) · ESI-001/08 (auditoría y cadena de suministro) · ESI-001/10 (Renovate y puerta) · 27 (revisión periódica).

## Riesgos
- Inflación gradual de dependencias chicas → criterio de admisión + revisión trimestral con conteo; la tendencia creciente se discute con datos.
- Mayores pospuestos hasta volverse migraciones épicas → presupuesto de frescura (regla 3.3) hace el atraso visible y acotado.

## Decisiones habilitadas
Política de licencias inicial, cadencia de Renovate, expedientes de atraso, árbol inicial del esqueleto.

## Decisiones bloqueadas
Lista concreta de licencias aprobadas y cadencias exactas — ADR ligero en el esqueleto.
