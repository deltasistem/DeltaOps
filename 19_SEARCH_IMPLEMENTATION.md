# 19_SEARCH_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Búsquedas: un derivado más, con alcance en la consulta.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Las dos mitades (ETS-011/19)

```
INDEXAR    consumidor estándar: evento → documento de búsqueda → puerto ÍndiceDeBúsqueda
BUSCAR     consulta del catálogo: texto + filtros → pipeline de consulta → lector sobre el índice
```

## 2. Reglas de implementación

1. **Los módulos declaran, el consumidor de indexación proyecta**: cada módulo declara sus tipos buscables (qué campos, de qué eventos) en forma inspeccionable; el consumidor de plataforma construye los documentos — no hay N consumidores de indexación artesanales.
2. **Documento de búsqueda mínimo**: identidad, tipo, texto indexable, campos de filtro y las claves de alcance organizacional — jamás la entidad completa. El resultado de búsqueda lleva al usuario a la consulta canónica (03); el índice no es fuente de datos de pantalla.
3. **El alcance se aplica EN la consulta al índice** (ETS-011/19): las claves de alcance son parte del documento y el lector de búsqueda filtra por el alcance inyectado por el pipeline — nunca se busca amplio y se filtra después en memoria (fuga por conteos y facetas).
4. **Clasificación consciente** (ETS-006/13): el contenido Restringido no se indexa como texto; se indexan sus metadatos permitidos. La regla es del documento declarado, verificada al registrar el tipo buscable.
5. **Búsqueda ≠ listado** (ETS-011/19): las listas de pantalla con filtros exactos son consultas de read model (03); la búsqueda es texto libre y relevancia. Un implementador que usa el índice para poblar una tabla filtrable está en el documento equivocado.
6. **El índice es desechable por contrato**: reconstruir = replay del consumidor de indexación (10 §regla 6); ninguna información vive SOLO en el índice. Las migraciones de mapeo del índice se hacen por reconstrucción, no por mutación in situ.
7. **Análisis en español primero** (ETS-011/19): la normalización lingüística (acentos, plurales, vocabulario técnico de mantenimiento) es configuración del índice declarada, no post-procesamiento en código.
8. **Degradación honesta**: índice no disponible → la búsqueda responde no-disponible-reintentable (ETS-008/07); jamás un barrido a las tablas de verdad como fallback silencioso.

## 3. Prueba obligatoria

Consumidor de indexación: suite estándar (10 §3) + clasificación (lo Restringido no aparece como texto indexado). Lector de búsqueda: matriz de alcance (un actor solo encuentra lo suyo, incluidos conteos) contra fake del índice; relevancia y análisis lingüístico contra el índice real en integración.

---

## Impacto sobre la implementación
La búsqueda cuesta un documento declarado por tipo buscable; indexación, alcance, reconstrucción y degradación llegan de la plataforma.

## ETS relacionados
ETS-011 (19, 10, 12) · ETS-006 (13) · ETS-008 (operación de búsqueda, errores) · ETS-012 (03, 10).

## Riesgos
- El índice degenerando en base de datos paralela → regla 2: documento mínimo, siempre.
- Filtrado de alcance post-consulta "porque el índice no lo soporta" → regla 3 es absoluta; si el índice no filtra por alcance, el índice elegido está mal.

## Decisiones habilitadas
Tipos buscables declarativos, reconstrucción sin ventana de mantenimiento, búsqueda multi-tenant segura.

## Decisiones bloqueadas
Motor de búsqueda concreto y sintaxis de mapeos — con el stack, tras el puerto.
