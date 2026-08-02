# 21 — Checklist del Módulo

> **DeltaOps — ESI-004 · v1.0** · La lista cerrada que decide si un módulo está completo — instanciada por el ejemplar.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Este checklist complementa al de desarrollo (ESI-002/25, por pieza/PR): aquí se verifica **el módulo entero** antes de declararlo terminado. El módulo de referencia lo pasa primero; todo módulo futuro lo pasa después.

## 2. El checklist (completitud del módulo)

### A — Estructura y registro
- [ ] Anatomía conforme al doc 02; ninguna carpeta extra, ninguna pieza fuera de lugar.
- [ ] Declaración completa y simétrica con la estructura (doc 03); el arranque valida sin errores.
- [ ] Capacidades, permisos y tipos de evento del módulo catalogados antes de referenciarse.

### B — Dominio y aplicación
- [ ] Toda regla de negocio ubicada según la taxonomía (agregado/Policy/servicio, doc 11 §2.3) y probada en su nivel (doc 08/19).
- [ ] Todo comando con `clave_idempotencia`, prueba de duplicado y prueba de concurrencia (docs 05/13).
- [ ] Todas las denegaciones distinguibles con error canónico propio (capacidad/permiso/Policy/invariante).

### C — Datos y eventos
- [ ] Migraciones en su capítulo, expandir-migrar-contraer si tocan lo existente (ETS-010).
- [ ] Eventos con carga mínima, versión y emisión desde el agregado (doc 14).
- [ ] Proyecciones idempotentes y reconstruibles, con verificación de divergencia (doc 15).
- [ ] Seed del módulo: escenarios con nombre, dos tenants, todos los estados (ESI-002/12).

### D — Operación
- [ ] Catálogos de log y auditoría declarados y al día (docs 16/17).
- [ ] Métricas propias según la tríada, alertas con respuesta escrita (doc 18).
- [ ] Expediente documental completo (doc 20).

### E — Verificación
- [ ] Los cuatro niveles de prueba presentes con el reparto del doc 19.
- [ ] La puerta de CI en verde sin exenciones; cobertura del Charter §9.
- [ ] Prueba E2E del flujo principal (Golden Path del módulo, doc 22) pasando contra el sistema completo.

## 3. Reglas

1. El checklist se responde **con evidencia enlazada** (pruebas, capturas de puerta), no con afirmaciones.
2. Todo punto no aplicable se marca "N/A + porqué" — la omisión consciente del doc 02 §3.
3. Lo mecanizable se mecaniza (ESI-002/25): los puntos de estructura, simetría y puerta ya son automáticos; este documento registra el resto.

## Impacto sobre la implementación

Cierra el DGP del módulo de referencia (su última tarea es pasar este checklist) y se convierte en la sección fija "completitud" de todo DGP de módulo futuro.

## Dependencias

Docs 02-20 y 22; ESI-002/12, /14 y /25; ETS-010; Charter §9.

## Riesgos

- Checklist respondido de memoria al final en lugar de mantenido durante la construcción; mitigación: el DGP lo referencia por bloques desde sus tareas; llegar al final con sorpresas es señal de proceso roto.

## Decisiones habilitadas

- Definición operativa y verificable de "módulo terminado".
- Comparabilidad entre módulos: todos completos bajo el mismo criterio.

## Decisiones bloqueadas

- Prohibido declarar terminado un módulo con puntos en rojo sin N/A justificado.
- Prohibido responder el checklist sin evidencia.

## Reusable Pattern

Los DGP futuros incluyen este checklist íntegro como sección de cierre; solo cambian las instancias (nombres de piezas). Los bloques A-E son estables.

## Anti-Patterns

- "Terminado funcionalmente, faltan detalles" — el checklist ES la definición de terminado.
- Checklists paralelos por equipo que fragmentan el criterio.
- Marcar N/A por conveniencia sin justificación revisable.
