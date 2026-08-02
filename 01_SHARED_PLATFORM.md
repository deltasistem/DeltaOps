# 01 — Concepto de Shared Platform Service

> **DeltaOps — ESI-006 · v1.0** · Qué es un servicio compartido de plataforma: funcionalidad transversal de negocio que ningún módulo posee y todos consumen.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Definición

Un **Shared Platform Service** es una pieza de funcionalidad **de cara al usuario y transversal a los dominios** (notificaciones, adjuntos, comentarios, búsqueda, exportes…) que:

1. No pertenece a ningún contexto delimitado de ETS-003 — no hay dominio "adjuntos".
2. Es consumida por múltiples módulos con la misma semántica.
3. Se construye **una vez**, en la plataforma, con el mismo patrón de ingeniería que un módulo (ESI-004/005): anatomía, declaración, pruebas, expediente.

Ocupa el estrato intermedio del sistema:

| Estrato | Ejemplos | Norma |
|---|---|---|
| Plataforma técnica (Kernel) | UoW, RLS, outbox, middleware | ESI-003 (congelada) |
| **Servicios compartidos** | Notificaciones, adjuntos, búsqueda, tareas | **Esta serie** |
| Módulos de negocio | Activos, OT, Inventario… | ESI-005 |

## 2. Propiedades obligatorias

1. **Neutralidad de dominio**: el servicio no conoce qué es una OT; opera sobre **referencias a entidades** (módulo + tipo + identificador) y contratos genéricos. Si un servicio necesita entender el dominio, esa parte pertenece al módulo.
2. **Acoplamiento unidireccional**: los módulos conocen los contratos de los servicios; los servicios **jamás** conocen módulos concretos. La colaboración entrante es por contrato genérico; la saliente, por eventos publicados del servicio.
3. **Publicación completa**: todo servicio publica capacidades, eventos, contratos, configuración, KPIs, permisos y consumidores — los siete rubros son obligatorios y se documentan en su ficha del catálogo (doc 02).
4. **Multitenant y auditado por construcción**, como cualquier módulo (ESI-005/15-17).
5. **Prescindible por diseño donde sea opcional**: un módulo funciona con el servicio deshabilitado para el tenant (la capacidad manda); las dependencias duras se declaran y son excepcionales.

## 3. El criterio de admisión al estrato

Una funcionalidad es servicio compartido si y solo si: (a) al menos **dos módulos** la necesitan con la misma semántica; (b) es neutral de dominio §2.1; (c) tiene identidad de producto propia (el usuario la percibe como una sola cosa en todo el sistema). Lo que falle (a) vive en su módulo hasta que un segundo la necesite (regla de promoción, ESI-005/01 §3); lo que falle (b) no es compartible; lo que falle (c) es probablemente plataforma técnica (ESI-003).

## Impacto sobre la implementación

Crea el estrato de servicios compartidos como familia de piezas con estándar propio (esta serie) y patrón heredado (ESI-004/005); sus DGP son independientes de los DGP-módulo.

## Dependencias

ETS-002 (funcionalidad transversal), ETS-003 (qué NO es dominio); ESI-003 (Kernel), ESI-004 (patrón), ESI-005 (estándar de módulo).

## Riesgos

- El estrato como cajón de sastre ("todo lo difícil es compartido"); mitigación: el criterio de admisión §3 es bloqueante y el catálogo (doc 02) es cerrado con proceso de alta.

## Decisiones habilitadas

- Construir una vez notificaciones, adjuntos, comentarios, etc., para todos los módulos.
- Experiencia de usuario uniforme en lo transversal.

## Decisiones bloqueadas

- Prohibido que un servicio compartido conozca módulos concretos.
- Prohibido duplicar en un módulo funcionalidad ya catalogada como compartida.
- Prohibido admitir servicios fuera del criterio §3.

## Reusable Pattern

La tabla de estratos §1, las cinco propiedades §2 y el criterio de admisión §3 son la definición citable; toda ficha del catálogo la referencia.

## Anti-Patterns

- Servicios "compartidos" con `if modulo == ...` por dentro.
- Subir al estrato funcionalidad de un solo consumidor "por si acaso".
- Resolver en módulos lo que el catálogo ya ofrece (fragmentación de UX).

## Knowledge Graph

- **ETS que consume**: ETS-002 (necesidades transversales), ETS-003 (fronteras de dominio), ETS-009 (multitenancy).
- **ESI que consume**: ESI-003 (Kernel), ESI-004 (patrón), ESI-005 (estándar de módulos).
- **DGP que originará**: la familia de DGP de servicios compartidos (uno por servicio del catálogo, doc 26).
- **ADR relacionados**: ADR de estratificación plataforma/servicios/módulos (este documento §1).
- **Módulos que reutilizarán este patrón**: todos los módulos de negocio consumen este estrato; ninguno lo reimplementa.
