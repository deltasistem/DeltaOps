# 25 — Organización Física del Backend

> **DeltaOps — ESI-003 · v1.0** · Dónde vive cada pieza del Foundation dentro de la estructura congelada del repositorio.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Marco

ESI-002/03 congela la estructura de `apps/backend` en cuatro zonas: `kernel/`, `plataforma/`, `modulos/` y `arranque/`, con `pruebas/` en espejo. Este documento asigna cada componente de ESI-003 a su zona. No introduce zonas nuevas.

## 2. Asignación normativa

| Zona | Contenido según ESI-003 |
|---|---|
| `kernel/` | Tipos base, contratos de puertos (UoW, repositorio, dispatcher, archivos, observabilidad, sesiones), catálogo de errores, catálogos de capacidades/permisos/eventos, contrato del contexto, Policies base, fakes oficiales (docs 04, 09, 15) |
| `plataforma/` | Implementaciones: composición base de DI, UoW SQLAlchemy, base de repositorio y lector, dispatcher/outbox/bandejas, middleware y tubería de workers, autenticación y sesiones, evaluadores de capacidad/permiso, logger, observabilidad, sondas de salud, andamiaje de background, puerto de archivos, base de adaptador externo (docs 05, 10-24) |
| `modulos/` | Solo negocio: por módulo, su dominio, aplicación, adaptadores (repositorios concretos, lectores), rutas y declaración de registro (doc 06). Vacío de plataforma |
| `arranque/` | Raíces de composición por proceso (API, worker), lista de módulos, secuencia de bootstrap, declaración de dependencias con criticidad (docs 02, 05, 18) |
| `pruebas/` | Espejo por zona: pruebas del Kernel puras; de plataforma con infraestructura efímera; de módulos con fakes; E2E por flujos (ESI-002/03) |

## 3. Estructura interna de la plataforma

Dentro de `plataforma/`, una carpeta por runtime con el nombre en español del dominio técnico (p. ej. persistencia, mensajeria, borde, seguridad, observabilidad, trabajos, archivos, integraciones). Reglas:

1. **Una carpeta, un runtime de esta serie**: la correspondencia carpeta ↔ documento ESI-003 se mantiene visible para que el diseño y el código se lean en paralelo.
2. **Prohibidas carpetas `utils/`, `helpers/`, `common/`** (ESI-002/03): lo que no tiene hogar claro tiene diseño pendiente.
3. **La plataforma no importa de `modulos/` jamás**; `arranque/` es el único que importa de ambos. Regla verificada mecánicamente en la puerta (ESI-002/14).
4. **Los fakes viven en el Kernel**, junto al contrato que implementan, porque son parte del contrato (ETS-011); las pruebas de todos los módulos los reutilizan.

## 4. Simetría declaración ↔ estructura

La declaración de registro de un módulo (doc 06) debe ser deducible de su estructura física y viceversa. Toda pieza física sin declarar es código muerto; toda declaración sin pieza es un arranque roto. Ambas cosas las detecta la puerta.

## Impacto sobre la implementación

Da a los DGP el mapa exacto de destino de cada componente. El generador de módulo (T09, ESI-002/18-19) produce la estructura y la declaración a la vez.

## Dependencias

ESI-002/03 (estructura congelada); docs 02, 04-06 y 10-24 de esta serie; ETS-011/012.

## Riesgos

- Deriva entre carpetas reales y este mapa; mitigación: la correspondencia se revisa en la puerta y el mapa se actualiza por el proceso único de cambio de reglas (ESI-002/27).
- Piezas "provisionales" colocadas donde caben; mitigación: prohibición de cajones de sastre y revisión con checklist.

## Decisiones habilitadas

- Generadores que crean piezas directamente en su hogar correcto.
- Verificación mecánica de las reglas de dependencia entre zonas.

## Decisiones bloqueadas

- Prohibido crear zonas nuevas en `apps/backend`.
- Prohibido que `plataforma/` importe de `modulos/`.
- Prohibidos los cajones de sastre en cualquier zona.
