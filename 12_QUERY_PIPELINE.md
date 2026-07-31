# 12_QUERY_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de consultas: el camino de lectura, separado del de escritura de punta a punta.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las etapas

```text
SOBRE DE CONSULTA + CONTEXTO DE EJECUCIÓN
  1. TELEMETRÍA      traza y métrica de la consulta (27)
  2. AUTORIZACIÓN    pipeline 14: permiso de la consulta + alcance
                     organizacional (qué nodos puede ver)
  3. VALIDACIÓN      solo de forma: filtros, paginación, rangos
                     admitidos (sin reglas de negocio — leer no decide)
  4. LECTOR          puerto de read model (06): la consulta ya tiene
                     su forma proyectada; una búsqueda, cero agregación
  5. RESPUESTA       datos + FRESCURA declarada (retraso del cursor
                     del proyector) + paginación por cursor
```

## 2. Reglas normativas

1. **Sin dominio, sin Unit of Work, sin efectos**: una consulta jamás muta nada de negocio (el registro de acceso a datos Restringidos es telemetría/auditoría del pipeline, no del caso de uso — 17).
2. **Solo read models**: ninguna consulta de negocio toca tablas de la verdad (ETS-009/15 §4); si una pregunta nueva no tiene read model, se proyecta uno (ETS-010/10) — no se "consulta rapidito" la verdad.
3. **El alcance organizacional es parte de la consulta, no un filtro opcional**: la autorización inyecta los nodos visibles del actor y el lector los aplica siempre (además de la muralla RLS física, ETS-010/01) — dos murallas también al leer.
4. **Frescura honesta**: toda respuesta de derivado declara su retraso (ETS-008/02); el pipeline la obtiene del cursor del proyector — jamás se inventa ni se omite.
5. **Consultas as-of** declaran su eje temporal (negocio vs registro, ETS-010/16 §3.2) como parámetro contratado.
6. **Presupuesto**: fracciones de segundo (ETS-004/11); una consulta lenta es un read model mal formado o un índice ausente (ETS-010/20 §4), nunca una razón para cachés improvisados en el adaptador.

## 3. Lectores especiales

- **Búsqueda** (19) y **reportes** (20) son consultas de este mismo pipeline con lectores propios.
- **Exportaciones y paquetes móviles de bajada** (ETS-008/12): consultas internas de gran volumen — mismo pipeline, ejecución sobre réplicas, entrega asíncrona cuando el tamaño lo exige.

---

## Impacto sobre la implementación
Un lector por consulta del catálogo (ETS-008/04) contra su read model; el pipeline compartido inyecta alcance y frescura; nada de acceso a la verdad desde consultas.

## ETS relacionados
ETS-008 (04 catálogo, 02 frescura) · ETS-009 (08, 15) · ETS-010 (10 proyecciones, 11 vistas) · ETS-011 (11 contraparte de comandos, 14 alcance).

## Riesgos
- Consultas "excepcionales" contra la verdad en emergencias → prohibición §2.2; la emergencia se resuelve proyectando, no perforando.
- Frescura ignorada por las UIs → el contrato la exige y la UX la muestra (ETS-004).

## Decisiones habilitadas
Lectores por consulta, paneles de frescura, ejecución en réplicas.

## Decisiones bloqueadas
Forma concreta de los lectores y la política de réplica por consulta — implementación (con ETS-010/20).
