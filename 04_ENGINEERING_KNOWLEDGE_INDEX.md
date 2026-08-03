# 04 — Engineering Knowledge Index

> **DeltaOps — ESI-010 · v1.0** · El índice de conocimiento de ingeniería: el mapa de todo el corpus congelado y la regla de "una pregunta, una ruta".
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El corpus

| Serie | Dominio | Pregunta que responde |
|---|---|---|
| **ETS-001…012** | Producto y estrategia | ¿Qué construimos, para quién, por qué? |
| **ENGINEERING_CHARTER** | Principios | ¿Con qué valores decidimos? |
| **ESI-001** | Estrategia tecnológica | ¿Sobre qué tecnología y con qué criterios? |
| **ESI-002** | Plataforma de ingeniería | ¿Cómo se organiza el repositorio, la puerta, el proceso de decisiones? |
| **ESI-003** | Fundación backend | ¿Cómo son el Kernel, los comandos, contratos, persistencia, eventos? |
| **ESI-004** | Módulo de referencia | ¿Cómo se construye un módulo ejemplar, con qué anatomía y pruebas? |
| **ESI-005** | Módulos de negocio | ¿Qué módulos existen, con qué fronteras, permisos, offline, DGP? |
| **ESI-006** | Plataforma compartida | ¿Qué servicios comunes existen y cómo se consumen? |
| **ESI-007** | Seguridad y gobierno | ¿Cómo se protege, aísla, audita y gobierna el acceso? |
| **ESI-008** | Plataforma de experiencia | ¿Cómo se presenta el sistema: shell, pantallas, marcos, posturas? |
| **ESI-009** | Entrega y calidad | ¿Cómo viaja un cambio de la idea a producción? |
| **ESI-010** | Sistema operativo | ¿Cómo opera todo junto? (esta serie) |

Cada serie cierra con su grafo consolidado (ESI-006/27, ESI-007/24, ESI-008/26, ESI-009/26); el grafo global (doc 26) los enlaza.

## 2. Una pregunta, una ruta

Reglas de resolución para cualquier consulta de ingeniería:

1. **¿Qué debe hacer el producto?** → ETS; nunca se responde desde el código.
2. **¿Cómo se hace X técnicamente?** → la serie ESI de su dominio (tabla §1), entrando por su doc 01 o su grafo de cierre.
3. **¿Por qué se decidió X?** → el registro de decisiones (doc 07) y los ADR citados por la norma.
4. **¿Qué existe ya?** (módulo, servicio, contrato, patrón, capacidad) → el registro correspondiente (docs 06-13); jamás se responde "creo que no existe" sin consultarlo.
5. **¿En qué estado está X?** → el ciclo del artefacto (doc 03) y su tablero.
6. **¿Qué toca si cambio X?** → el mapa de dependencias (doc 05) y el radio del grafo (doc 26).
7. **La pregunta sin ruta es un hallazgo**: se registra como hueco del índice (doc 22) — el índice también aprende.

## 3. Reglas del índice

1. **El índice apunta, no norma**: cero contenido normativo propio; toda entrada es referencia resoluble.
2. **La entrada al sistema es este índice**: onboarding de personas y configuración de agentes de IA (doc 16) empiezan aquí — una sola puerta de entrada al corpus.
3. **El índice se actualiza con cada serie o decisión nueva** como paso del proceso (ESI-002/27), igual que los grafos de cierre.

## Impacto sobre la implementación

El índice se usa desde el primer día como puerta de entrada; su materialización navegable es parte del tablero documental ya normado.

## Dependencias

Todo el corpus (tabla §1); docs 03, 05-13, 22, 26.

## Riesgos

- El índice desactualizado enseñando rutas muertas; mitigación: actualización como paso obligatorio del proceso de cambio normativo, y toda cita irresoluble es defecto (régimen de los grafos).

## Decisiones habilitadas

- Resolución de cualquier pregunta de ingeniería en minutos, con ruta.
- Onboarding uniforme de humanos y agentes.

## Decisiones bloqueadas

- Prohibido responder preguntas de corpus "de memoria" contra el índice.
- Prohibido contenido normativo dentro del índice.
- Prohibidas entradas sin referencia resoluble.

## Reusable Pattern

"Una pregunta, una ruta" sobre un corpus con grafos de cierre: el índice como puerta única de entrada al conocimiento congelado.

## Anti-Patterns

- El wiki paralelo donde vive "la verdad práctica".
- Buscar en el chat lo que el índice resuelve.
- Duplicar resúmenes de series dentro del índice.

## Knowledge Graph

- **ETS que consume**: ETS-001…012 (indexados).
- **ESI que consume**: ESI-001…009 y sus grafos de cierre (indexados).
- **DGP que originará**: ninguno; el índice es instrumento documental.
- **ADR relacionados**: ADR de índice como puerta única de entrada.
- **Módulos que reutilizarán este patrón**: todos los equipos y agentes entran al corpus por aquí.
