# 10 — Accessibility

> **DeltaOps — ESI-008 · v1.0** · La accesibilidad: exigible por construcción — los marcos la garantizan, las pantallas no pueden romperla, el checklist la verifica.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Postura

DeltaOps adopta el estándar internacional vigente de accesibilidad (nivel AA como piso, por la indirección de estándares de ESI-007/28 §3.3) y lo hace **estructural**: la accesibilidad vive en los marcos y tokens, de modo que la pantalla que usa el sistema es accesible por defecto y romperla exige esfuerzo detectable.

## 2. Reglas

1. **Contraste por construcción**: los pares de tokens semánticos garantizan contraste AA (doc 08 §2.3); el color jamás es el único portador de significado (todo estado crítico/advertencia lleva forma o texto además de color — la planta tiene luz mala y hay daltonismo real, ETS-011).
2. **Todo operable sin puntero**: navegación completa por teclado en oficina, foco visible siempre, orden de foco lógico definido por el layout (doc 07); los marcos de diálogo (doc 16) atrapan y devuelven el foco correctamente por contrato.
3. **Semántica declarada para tecnologías de apoyo**: los marcos emiten estructura semántica (encabezados, regiones, tablas con cabeceras, estados de controles anunciables); la pantalla que instancia hereda la semántica — no la reconstruye.
4. **Objetivos táctiles y tiempos humanos**: tamaños mínimos táctiles en campo/planta (tokens), sin interacciones que exijan precisión fina ni tiempo límite; donde la sesión expira (ESI-007/05), el trabajo en curso se preserva (doc 19 §2.5).
5. **Contenido comprensible**: lenguaje operativo llano en el idioma del tenant, errores en términos de la tarea (doc 13), sin jerga técnica en superficie; la localización es estructural (textos por catálogo, nunca incrustados) aunque el idioma inicial sea uno.
6. **Movimiento respetuoso**: animaciones con propósito (doc 12), respetando la preferencia de movimiento reducido del usuario; nada parpadea ni se mueve en bucle en pantallas de trabajo.

## 3. Declaración (los ocho rubros)

- **Commands/Queries/Capacidades/Servicios/Permisos/KPIs/IA**: transversal — no aplican como pantalla; la verificación entra por checklist (doc 25) y score (doc 24).
- **Offline**: sin relación; la accesibilidad no depende de la red.

## Impacto sobre la implementación

Los requisitos entran a la definición de cada marco (foco, semántica, tamaños) en el DGP de experiencia; las verificaciones mecánicas (contraste, semántica, foco) se suman a la puerta y al checklist.

## Dependencias

Docs 07-08, 12-13, 16, 19, 24-25; ETS-011; ESI-007/05, /28.

## Riesgos

- La accesibilidad tratada como auditoría final en vez de propiedad estructural; mitigación: al vivir en marcos y tokens, la pantalla la hereda; lo verificable mecánicamente está en la puerta y lo demás en la revisión de experiencia — el mismo doble régimen del resto del sistema.

## Decisiones habilitadas

- Cumplimiento de requisitos de accesibilidad de clientes enterprise (mapeable, ESI-007/14).
- Producto usable con guantes, con sol, con daltonismo y con lector de pantalla.

## Decisiones bloqueadas

- Prohibido el color como único portador de significado.
- Prohibidas pantallas inoperables por teclado (oficina) o con objetivos sub-mínimos (campo/planta).
- Prohibidos textos incrustados fuera del catálogo de contenido.

## Reusable Pattern

Accesibilidad estructural: garantías en tokens y marcos + verificación mecánica en puerta + revisión humana de lo no mecanizable — heredada, no añadida.

## Anti-Patterns

- El "modo accesible" aparte (la accesibilidad es el modo).
- Remediar con atributos de apoyo lo que la estructura hace mal.
- Cumplir contraste en oficina e ignorarlo en el sol de la planta.

## Knowledge Graph

- **ETS que consume**: ETS-011 (condiciones reales que exigen accesibilidad).
- **ESI que consume**: ESI-002/17 (puerta); ESI-007/14 (mapeo de cumplimiento), /28 (indirección de estándares).
- **DGP que originará**: requisitos por marco en el DGP de experiencia; validaciones en puerta.
- **ADR relacionados**: ADR de accesibilidad estructural AA.
- **Módulos que reutilizarán este patrón**: todos heredan de los marcos; ninguno "añade accesibilidad" después.
