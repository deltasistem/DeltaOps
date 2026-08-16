---
name: Correcciones pre-deploy (tenant productivo y reproyección)
description: Lecciones durables — tenant productivo limpio por re-import, doble generación de parser en la demo, reproyectar no drena outbox.
---

## Tenant productivo limpio se reconstruye desde fuentes, no se migra
- Para separar datos reales de demo, la vía correcta fue crear el tenant productivo (`delta`) y re-importar los 6 XLSX originales con el flujo oficial de históricos. **Un tenant recién creado no tiene catálogos**: sembrar los catálogos base del módulo por API es prerrequisito de la importación (si no, KRN-VAL-001).
- **Why:** el import es determinista (uuidv5 por tenant) e idempotente; reconstruir desde fuentes es reversible y no toca al tenant demo.
- **How to apply:** en producción repetir: crear tenant → sembrar catálogos base → importar fuentes → drenar outbox.

## Conteos que no cuadran entre corridas de import = comparar por clave natural
- Los «hechos extra» de la autoridad demo (≈1.135 lecturas / 336 tanqueos) eran residuos de una generación anterior del parser (p. ej. horómetros=0 desde el archivo de combustible), no datos nuevos: el parser vigente los excluye y todo lo que produce está contenido en la demo por clave natural (equipo, fecha, valor).
- **Why:** los ids deterministas incluyen el contenido parseado; dos generaciones de parser ⇒ dos familias de ids coexistiendo en el write model, invisibles a la deduplicación.
- **How to apply:** antes de asumir «hechos nuevos», comparar generaciones por clave natural; el dataset canónico es el que produce el parser vigente desde las fuentes.

## Reproyectar ≠ drenar
- Los comandos oficiales de reproyección reconstruyen read models por replay del event log, pero NO procesan el kernel_outbox: los handlers de bitácora canónica (timeline por evento) solo corren al drenar. Tras una importación masiva hay que verificar outbox en cero además de los conteos de read models; eventos sin manejadores en ningún runtime se marcan procesados con warning (comportamiento normal).
