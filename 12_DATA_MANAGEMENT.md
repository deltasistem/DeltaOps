# 12_DATA_MANAGEMENT.md

> **DeltaOps — ESI-002 · v1.0** · Datos de desarrollo, seed y fixtures: datos deterministas para un sistema determinista.
> Sin código.

---

## 1. Los tres tipos de datos de ingeniería

| Tipo | Qué es | Dónde vive |
|---|---|---|
| **Seed de desarrollo** | el mundo de trabajo estándar: tenants, usuarios, catálogos, entidades de negocio en estados variados | comando oficial de seed; se ejecuta en bootstrap (05) y a demanda |
| **Fixtures de prueba** | datos mínimos por prueba, construidos con los builders oficiales de las plantillas de prueba (ETS-012/25) | junto a las pruebas; jamás compartidos entre suites como estado global |
| **Escenarios** | conjuntos con nombre para situaciones específicas (backlog grande, tenant recién nacido, datos para demo) | catálogo de escenarios versionado; `datos escenario <nombre>` (11) |

## 2. Diseño del seed oficial

1. **Determinista**: mismo seed → misma base, bit a bit donde sea posible (ids UUIDv7 generados con semilla fija); dos máquinas sembradas son comparables.
2. **Multi-tenant por diseño**: al menos DOS tenants con datos distinguibles a simple vista (nombres inconfundibles) — la fuga de tenancy se ve, además de fallar las matrices (11 §regla 2).
3. **Cubre el ciclo de vida**: entidades en TODOS los estados relevantes de sus máquinas de estados (ETS-003), incluidas las incómodas (rechazadas, vencidas, apartadas en bandeja) — el seed que solo tiene casos felices produce pantallas que mienten.
4. **Pasa por los casos de uso, no por SQL directo**: el seed ejecuta comandos del catálogo (con `clave_idempotencia`), garantizando datos legales por construcción — outbox, auditoría y proyecciones incluidas. Excepción única: volúmenes masivos para rendimiento, generados con el mismo respeto a invariantes y marcados como sintéticos.
5. **En español**: los datos hablan el lenguaje ubicuo (órdenes, activos, planes con nombres realistas del dominio de mantenimiento).
6. **Evoluciona con el producto**: cada módulo nuevo agrega su capítulo de seed en el MISMO PR que introduce sus casos de uso — el seed desactualizado falla la puerta si la siembra no corre.

## 3. Reglas de fixtures (refuerzo de ETS-012/25)

1. Cada prueba construye lo suyo con builders; prohibido depender del seed de desarrollo en pruebas unitarias o de integración (el seed es para humanos y E2E).
2. Los builders producen entidades legales por defecto y permiten torcer solo lo que la prueba necesita (claridad de intención).
3. Los E2E usan escenarios con nombre, sembrados al inicio de la corrida — reproducibles y aislados por corrida.

## 4. Datos en QA/UAT (regla dura de 09)

- **QA**: siembra sintética automatizada (el mismo seed + escenarios de volumen); se resiembra sin ceremonia.
- **UAT**: escenarios realistas ricos, sintéticos o anonimizados de forma irreversible bajo procedimiento oficial documentado; **PII real jamás sale de PROD**. El procedimiento de anonimización (cuando se necesite) será pieza gobernada con dueño, no un script casual.
- **PROD**: jamás se siembra; los datos reales solo se tocan por operaciones del producto o migraciones gobernadas (ETS-010/21).

---

## Impacto sobre la implementación
El comando de seed, los dos tenants estándar, el catálogo de escenarios y los builders nacen con el esqueleto y el primer módulo; sembrar por casos de uso convierte al seed en la primera prueba de humo permanente del sistema.

## Dependencias
05 (bootstrap siembra) · 11 (comandos y multi-tenant local) · 09 (política por entorno) · ETS-012/25 (builders y fixtures) · ETS-003 (estados a cubrir).

## Riesgos
- Seed lento al crecer los módulos → presupuesto de tiempo de siembra medido; los volúmenes grandes viven en escenarios opcionales, no en el seed base.
- Anonimización casera insuficiente → prohibida hasta que exista el procedimiento oficial; mientras tanto, UAT usa sintético rico.

## Decisiones habilitadas
Bootstrap completo con datos, demos reproducibles, E2E estables por escenarios, pruebas de rendimiento con volúmenes marcados.

## Decisiones bloqueadas
Contenido concreto del seed por módulo (nace con cada módulo bajo DGP) y procedimiento de anonimización — pieza futura gobernada.
