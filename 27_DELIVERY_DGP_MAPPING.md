# 27 — Relación con DGP (Entrega)

> **DeltaOps — ESI-009 · v1.0** · Cómo el modelo de entrega se materializa en DGP: un DGP propio de plataforma de entrega y el régimen de entrega presente en todos los demás.
> Documento de diseño técnico. Sin código, sin implementación.

*(Nota de serie: `27_DGP_MAPPING.md` pertenece a ESI-005 y está congelado; este documento cumple el rol equivalente para ESI-009 con nombre desambiguado, como `27_EXPERIENCE_DGP_MAPPING.md` lo hizo para ESI-008.)*

## 1. El DGP de Plataforma de Entrega

| Bloque de entrega | Contenido | Documentos fuente |
|---|---|---|
| Repositorio | Protección de la principal, catálogo de ramas, verificación de commits y contratos de PR, plantillas DR/QC | 02-06, 24 |
| Verificación | Catálogo de puertas configurado, contextos de pipeline con presupuestos, pisos de pruebas, cuarentena, baterías intocables | 07-09 |
| Liberación | Cadena de entornos, derivación de versión, registro de toggles, mecánica de despliegue y exposición, compuerta RC | 10-13, 25 |
| Operación | Mecanismos y ensayo de reversa, canales y simulacros de incidentes, circuito de hotfix | 14-16 |
| Gobierno | Registro de deuda, derivación de métricas y tablero, score E1-E8, cadencia y plantillas DoR/DoD/criterios | 17-23 |

Es el DGP que selecciona las herramientas concretas — siempre contra el modelo, nunca definiéndolo (doc 01 §1).

## 2. El régimen de entrega en todo DGP y todo trabajo

1. **Toda entrega declara el contrato de nueve rubros** (Objetivo, ETS, ESI, DGP, Riesgos, Evidencias, Pruebas, Rollback, Observabilidad) — en el PR (doc 05) como instancia operativa.
2. **Todo DGP de módulo o plataforma declara**: sus categorías reforzadas de revisión (superficies sensibles propias), sus niveles de prueba exigidos y jornadas E2E aportadas (doc 08), sus señales de observabilidad estándar, y sus umbrales locales cuando el DGP de entrega delega (tamaños, presupuestos).
3. **Las definiciones son de la casa**: DoR, DoD, criterios, QC/RC no se redefinen por DGP — se instancian; los DGP solo añaden, jamás relajan (doc 22 §3.1).

## 3. Orden y encaje

1. **La plataforma de entrega precede a la fábrica**: repositorio y verificación (bloques 1-2) existen antes del primer módulo — el módulo de referencia (ESI-004) se construye ya bajo este régimen y lo valida, como valida al resto de plataformas.
2. **Liberación y operación maduran con la primera liberación real**: la cadena completa, la reversa ensayada y los simulacros están operativos antes del primer tenant productivo — no antes del primer commit.
3. **El gobierno crece con los equipos**: métricas, score y cadencia se activan desde el primer ciclo con umbrales iniciales que la evidencia calibra (doc 28).
4. **Hermano de los transversales**: el DGP de entrega se suma a los de seguridad (ESI-007/25) y experiencia (ESI-008/27) como tercera plataforma transversal; los tres comparten el molde y no se bloquean entre sí.

## Impacto sobre la implementación

El portafolio queda: **plataforma de entrega (repositorio+verificación)** → Kernel y plataformas (bajo el régimen) → módulo de referencia validando todo → olas; liberación/operación completas antes del primer tenant.

## Dependencias

Docs 01-25; ESI-002 (proceso); ESI-004 (módulo de referencia); ESI-005/27; ESI-007/25; ESI-008/27.

## Riesgos

- Perfeccionar la plataforma de entrega durante meses antes de construir producto; mitigación: el orden §3 exige solo repositorio+verificación al inicio — el resto madura con hitos reales, no por anticipación.

## Decisiones habilitadas

- Selección de herramientas concretas como decisiones del DGP, tardías y reversibles.
- DGP de módulos con régimen de entrega formularizado (instanciar, no inventar).

## Decisiones bloqueadas

- Prohibido construir módulos fuera del régimen de repositorio y verificación.
- Prohibido relajar definiciones de la casa en DGP locales.
- Prohibido el primer tenant productivo sin liberación y operación completas.

## Reusable Pattern

Un DGP propio por bloques madurando con hitos + régimen transversal instanciado en todos: el mismo encaje que seguridad y experiencia — el tercer transversal con el molde de la casa.

## Anti-Patterns

- El "pipeline perfecto" de seis meses sin producto.
- Cada equipo eligiendo su herramienta de CI "mientras tanto".
- El DGP de módulo que redefine "terminado" a su conveniencia.

## Knowledge Graph

- **ETS que consume**: ETS-012 (los hitos comerciales que ordenan la maduración §3).
- **ESI que consume**: ESI-002; ESI-004; ESI-005/27; ESI-007/25; ESI-008/27 (el molde transversal).
- **DGP que originará**: el DGP de plataforma de entrega; el régimen §2 en todos los DGP.
- **ADR relacionados**: ADR de entrega como tercera plataforma transversal; ADR de maduración por hitos.
- **Módulos que reutilizarán este patrón**: todos instancian el régimen §2; ninguno entrega por fuera.
