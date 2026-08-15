---
name: Afinamiento final LITE-10
description: Lecciones de la fase de UX/responsive, navegación por proceso y preparación a producción
---

- **Recomponer navegación puede perder puntos de entrada silenciosamente**: al reagrupar ítems por proceso se omitió Lecturas para todos los roles. **Cómo aplicar:** todo reagrupamiento de navegación exige test de regresión por rol/capacidad que enumere TODAS las superficies accesibles antes y después.
- **"Sin overflow horizontal" no es responsive**: la barra nowrap con selectores/perfil sin truncado desborda a 360px con textos largos. La composición móvil real mueve controles al drawer o los compacta con max-width+elipsis; probar con nombre/centro/empresa LARGOS.
- **Las suites de integración PG contra la BD compartida BORRAN el tenant demo incluidos los históricos reales** — no solo los datos demo. Recuperación: `seed:demo` + re-importación idempotente vía el importador oficial (ids deterministas ⇒ 0 duplicados). **Cómo aplicar:** jamás correr suites *.pg/*.integration contra la BD de desarrollo compartida; aislarlas o re-importar después.
- **El drain single-batch del outbox no alcanza para backlogs grandes** (~20k eventos): materializar con endpoints /reproyectar oficiales y re-drenar con el runtime del módulo dueño (subscribers idempotentes); un runtime ajeno que reclama primero marca eventos como procesados sin proyectarlos.
- **Campos extra dentro de un sub-objeto .strict() del contrato = error críptico en UI** («Diagnóstico inválido»): el helper frontend hacía spread de todo en `diagnostico`; el backend ya tenía campos de primera clase (tiempoReal/observaciones). Verificar el inputSchema real antes de "empaquetar" datos.
- **CORS endurecido sin romper same-origin**: allowlist por env (CORS_ORIGINS), reflejo solo en dev/test, cerrado por defecto en prod; peticiones sin Origin siempre pasan.
- **Testers E2E de otra experiencia**: admin de plataforma (admin@deltaops.dev) NO ve la experiencia tenant; las fichas usan id interno, no el código del activo — instruir navegación por búsqueda en el listado.
