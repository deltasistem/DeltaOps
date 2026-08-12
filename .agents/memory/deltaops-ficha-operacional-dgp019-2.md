---
name: Ficha Operacional 360° DGP-019.2
description: Lecciones de componer un panel operacional sobre la ficha de Activos — RBAC de presentación, contratos de catálogo y montaje eager de Tabs.
---

## RBAC de presentación es transversal a TODA la experiencia
La regla "CONSULTA no ve ninguna escritura" aplica a la página completa (cabecera, transiciones de estado, CTAs de todas las pestañas), no solo al componente nuevo.
**Why:** al gatear solo el panel nuevo, la revisión e2e halló Editar/Registrar preexistentes sin gate; el requisito es de experiencia, no de componente.
**How to apply:** al añadir gating por rol a una vista, auditar todos los CTAs de escritura del árbol completo y gatearlos con la señal canónica del módulo dueño de cada acción (ocultar, no deshabilitar; backend sigue siendo autoridad).

## Capacidades de presentación: mapear los permisos REALES del contrato
Un helper de capacidades frontend debe conceder por los permisos literales que el backend autoriza (p.ej. `modulo.ordenes.write` ⇒ crear), además de capacidades cortas y comodines, con semántica trivalente (sin señal ⇒ delegar en rol; señal parcial no deniega lo que otro permiso válido concede).
**Why:** conceder solo por nombres inventados (`modulo.x.gestionar-y`) produce subautorización: usuarios autorizados dejan de ver la acción.
**How to apply:** verificar el mapa capacidad→permiso en el módulo backend real antes de escribir el helper; tests con payloads explícitos reales (read+write, solo read, capacidad corta).

## TECNICO no es solo-lectura en Activos
`principalActivos` mapea TECNICO→operador con write/operar: Editar y transiciones de estado SON legítimas para TECNICO. Solo CONSULTA es lector puro.
**Why:** un guion e2e que asuma "técnico = restringido" produce falsos FAIL.

## Tabs del DS montan eager: un tab roto tumba la ficha entera
Todos los paneles de `Tabs` se renderizan al montar; un throw en cualquier tab (p.ej. `.map` sobre un objeto) crashea toda la página.
**How to apply:** normalizar formas de respuesta en la frontera del hook con guardas `Array.isArray`, y test de regresión con la forma REAL del endpoint.

## Contratos de opciones de catálogo no son uniformes
Activos `catalogo.opciones` devuelve `{value,label}`; la UI y Dynamic Forms esperan `{valor,etiqueta}` (Zod lanza en render si llegan undefined). Otros listados (inventario/planes) usan otro endpoint con envoltura `{opciones}` ya alineada.
**How to apply:** normalizar en la frontera (`useCatalogo`) mapeando al contrato real verificado en vivo; nunca relajar el schema Zod para silenciar.

## Revisión visual independiente encuentra defectos fuera del alcance
El revisor visual (§26) comparó con páginas hermanas y destapó un crash latente del listado que los tests y el smoke de la ficha no veían.
**How to apply:** en revisiones visuales, incluir siempre 1-2 rutas hermanas del módulo como referencia de consistencia — es detección de regresiones barata.
