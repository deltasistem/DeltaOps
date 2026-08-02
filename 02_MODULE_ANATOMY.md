# 02 — Anatomía Oficial

> **DeltaOps — ESI-005 · v1.0** · La estructura interna obligatoria de todo módulo de negocio: idéntica en forma al módulo de referencia, variable solo en contenido.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La anatomía normativa

Todo módulo vive en `apps/backend/modulos/<codigo_modulo>/` con la anatomía exacta de ESI-004/02:

| Zona | Contiene | Regla |
|---|---|---|
| `dominio/` | Agregados, objetos de valor, Policies, servicios de dominio, eventos | Cero imports de infraestructura |
| `aplicacion/` | Casos de uso (comandos), consultas, consumidores | Solo puertos del Kernel y dominio propio |
| `adaptadores/` | Repositorios, lectores, proyecciones, adaptadores de integración | Único lugar con tecnología concreta |
| `borde/` | Rutas, esquemas de petición/respuesta | Solo traduce; jamás decide |
| `declaracion/` | Registro del módulo, capacidades, permisos, eventos, auditoría, líneas de log | La verdad declarativa |
| `pruebas/` | Espejo de las cuatro zonas + E2E | Reparto de ESI-004/19 |

## 2. Lo que varía por módulo (y solo esto)

1. **Cardinalidad**: el ejemplar tiene 1 agregado; un módulo real tendrá varios (p. ej. Órdenes de Trabajo: la OT, el plan de mantenimiento). Cada agregado replica el patrón completo; la anatomía no cambia, se repite.
2. **Subcarpetas por agregado** cuando hay más de uno: `dominio/<agregado>/`, manteniendo las zonas.
3. **Adaptadores de integración** (doc 19) solo si el dominio los exige; el ejemplar no los tiene y esa ausencia es la norma por defecto.

## 3. Reglas

1. **La simetría es verificable**: la puerta compara la estructura contra la plantilla T09; carpetas extra o piezas fuera de zona rompen la verificación.
2. **Nada de capas nuevas**: no existen `helpers/`, `utils/`, `common/` dentro de un módulo; lo que no cabe en una zona está mal ubicado o pertenece a plataforma.
3. **El tamaño no cambia la forma**: un módulo grande tiene más archivos en las mismas zonas, nunca zonas nuevas.

## Impacto sobre la implementación

La plantilla T09 genera esta anatomía; la verificación mecánica de simetría (ESI-004/28 §3.2) aplica a todo módulo desde su primer PR.

## Dependencias

ESI-004/02 (anatomía del ejemplar) y /28 (deriva vigilada); ESI-002/18 (plantillas); ESI-003/06 (declaración).

## Riesgos

- Módulos con muchos agregados volviéndose ilegibles; mitigación: subcarpetas por agregado §2.2 y el límite natural del contexto delimitado — si no cabe, la conversación es de ETS-003, no de carpetas.

## Decisiones habilitadas

- Navegación uniforme: cualquier ingeniero ubica cualquier pieza de cualquier módulo sin conocer el dominio.
- Generadores y verificadores únicos para todos los módulos.

## Decisiones bloqueadas

- Prohibidas zonas o capas no contempladas en la tabla §1.
- Prohibidas carpetas de utilidades dentro de módulos.
- Prohibido variar la anatomía por preferencia de equipo.

## Reusable Pattern

La tabla §1 más las reglas de cardinalidad §2: anatomía fija, repetición por agregado. Todo DGP incluye el árbol instanciado de su módulo como primer entregable.

## Anti-Patterns

- Reorganizar por "tipo técnico" global (todas las rutas juntas, todos los repos juntos) rompiendo la cohesión modular.
- Zona `dominio/` con imports de ORM "por comodidad".
- Espejos de prueba incompletos (zonas sin su carpeta de pruebas).

## Knowledge Graph

- **ETS que consume**: ETS-003 (alcance por contexto), ETS-011 (puertos y capas).
- **ESI que consume**: ESI-004/02, ESI-002/18, ESI-003/06.
- **DGP que originará**: la tarea "generar esqueleto del módulo" de cada DGP-módulo.
- **ADR relacionados**: ADR de arquitectura hexagonal por módulo (ETS-011).
- **Módulos que reutilizarán este patrón**: todos; la anatomía es invariante.
