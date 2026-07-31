# 19_SEARCH_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de búsqueda: cómo todo lo buscable se indexa y se encuentra, con alcance y sin tocar la verdad.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las dos mitades

```text
INDEXACIÓN (consumidor, 10)
  evento despachado → ¿la entidad es buscable? → proyectar DOCUMENTO
  DE BÚSQUEDA (texto + facetas + referencias + clasificación) →
  puerto Índice de Búsqueda (06) → lectura_busqueda (hoy; motor
  dedicado mañana, ETS-010/21)

CONSULTA (pipeline de consultas, 12)
  búsqueda global o por módulo → autorización inyecta alcance (14)
  → índice responde referencias rankeadas → resultado con tipo,
  título, extracto y deep link — el detalle se abre con su propia
  autorización
```

## 2. Reglas normativas

1. **El índice es un derivado desechable**: se reconstruye por replay (10 §2.6); jamás es fuente de nada; su frescura se declara como la de todo derivado.
2. **Documento de búsqueda mínimo**: lo necesario para encontrar y mostrar el resultado (título, extracto, facetas, contexto organizacional, clasificación) — el contenido Restringido no se indexa en texto plano; se indexa su existencia con su clasificación y el alcance filtra (ETS-006/13).
3. **El alcance se aplica en la consulta al índice**, no después: filtrar tras buscar filtra páginas vacías y filtra información por conteos — los nodos visibles y la clasificación entran en la consulta misma (14 §2.4).
4. **Qué es buscable lo declara cada módulo** (metadatos): entidad, campos indexables, facetas — el pipeline es genérico; el catálogo de buscables es generable.
5. **Búsqueda ≠ listado**: las listas operativas con filtros exactos son consultas de read models (12); la búsqueda es descubrimiento por relevancia (texto libre, facetas) — no se fuerza una donde la otra.
6. **Español primero**: análisis de texto en español (acentos, plurales) como base (ETS-010/08 §2 GIN con diccionario español); multi-idioma cuando el tenant lo exija (ETS-004).

---

## Impacto sobre la implementación
Indexador genérico (consumidor estándar) + declaraciones por módulo; la consulta de búsqueda entra al catálogo (ETS-008/04) con su contrato de facetas y alcance.

## ETS relacionados
ETS-010 (02 lectura_busqueda, 08 GIN, 21 motor futuro) · ETS-006 (13 clasificación) · ETS-011 (10, 12, 14).

## Riesgos
- Indexar de más (contenido sensible en extractos) → revisión de clasificación por documento de búsqueda declarado.
- Relevancia pobre degrada la confianza en la búsqueda global → métricas de uso (clics por búsqueda) y ajuste iterativo; el motor dedicado es la salida prevista si el nativo no alcanza.

## Decisiones habilitadas
Indexador genérico, declaraciones de buscables, contrato de búsqueda global.

## Decisiones bloqueadas
Motor de búsqueda dedicado (solo con dolor medido, ETS-010/21 §2) y el ranking fino.
