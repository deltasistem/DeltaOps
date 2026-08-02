# 04 — Registro de la Capacidad de Referencia

> **DeltaOps — ESI-004 · v1.0** · `capacidad_de_referencia`: la capacidad neutra que demuestra el gobierno por tenant.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La capacidad

| Atributo | Valor |
|---|---|
| Código | `capacidad_de_referencia`, en el catálogo de capacidades como entrada técnica-patrón (misma excepción única del doc 03) |
| Dueño | Módulo `referencia` — exactamente uno (ESI-003/07 regla 2) |
| Piezas cubiertas | El comando y la consulta del módulo la declaran como capacidad requerida |
| Estado por tenant | En el seed: **habilitada para el tenant A, deshabilitada para el tenant B** — deliberadamente asimétrica |

## 2. Qué demuestra

1. **La cadena completa de evaluación** (ESI-003/12): con el tenant B, invocar el comando produce la denegación por capacidad — error canónico distinto de 403 — **antes** de evaluar permisos. Con el tenant A, la evaluación continúa hacia permisos.
2. **Verificación declarativa**: ni el caso de uso ni la consulta contienen chequeo alguno de capacidad; la plataforma lo hace por la declaración.
3. **Invalidación de caché**: la prueba E2E (doc 19) habilita la capacidad al tenant B por configuración (ETS-005) y verifica que el cambio surte efecto dentro de la ventana de frescura sin reiniciar procesos.
4. **Simetría con la UI**: el contrato de sesión (ETS-008) expone la capacidad, y el frontend de referencia (cuando exista) oculta la funcionalidad al tenant B con la misma fuente.
5. **Fallo cerrado**: la prueba de plataforma corta el acceso al estado de capacidades y verifica la denegación explícita, no un pase silencioso.

## 3. Reglas normativas

1. El seed asimétrico (A sí, B no) es **obligatorio y permanente**: es la única forma de que las pruebas del patrón cubran ambas ramas sin montaje artificial.
2. La capacidad es indivisible: no se subdivide en "sub-capacidades"; si un módulo real necesita granularidad, define varias capacidades en su catálogo de producto (ETS-002), cada una con su dueño.

## Impacto sobre la implementación

El DGP del módulo incluye el alta de la capacidad en el catálogo y el estado asimétrico en el seed. Las pruebas de los docs 19/25 dependen de esa asimetría.

## Dependencias

ESI-003/07 (runtime de capacidades) y /12 (cadena de evaluación); ETS-002 (catálogo), ETS-005 (configuración por tenant); ESI-002/12 (seed).

## Riesgos

- Seed "corregido" por alguien que ve la asimetría como error; mitigación: el capítulo de seed la documenta como intencional (ESI-002/12: escenarios con nombre).
- Confusión capacidad ↔ permiso en módulos futuros; mitigación: este módulo exhibe ambas denegaciones por separado, con pruebas nombradas.

## Decisiones habilitadas

- Probar el gobierno comercial por tenant sin dominio real.
- Patrón de seed asimétrico para toda capacidad futura.

## Decisiones bloqueadas

- Prohibido chequear capacidad manualmente dentro de piezas del módulo.
- Prohibido igualar el estado de la capacidad en ambos tenants del seed.
- Prohibidas sub-capacidades.

## Reusable Pattern

Los DGP futuros reutilizan: la tabla §1 como formulario de alta de capacidad, el seed asimétrico como técnica estándar de prueba, y la prueba de invalidación de caché §2.3 como prueba obligatoria de toda capacidad nueva.

## Anti-Patterns

- Capacidades sin dueño único o compartidas entre módulos.
- Pruebas que solo cubren el tenant habilitado.
- Habilitar capacidades "en caliente" editando datos a mano en lugar de por la configuración ETS-005.
