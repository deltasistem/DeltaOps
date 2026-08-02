# 20_DGP_PREPARATION.md

> **DeltaOps — ESI-002 · v1.0** · Preparación para los futuros DGP: los paquetes de generación que dirigirán la construcción.
> Sin código.

---

## 1. Qué será un DGP

Un **DGP (DeltaOps Generation Package)** será una instrucción de construcción gobernada: un paquete que ordena implementar un conjunto acotado de piezas del producto, citando las fuentes normativas exactas. Los DGP son a la implementación lo que los ETS fueron a la arquitectura y los ESI a la plataforma: la vía única y ordenada. Ninguna pieza del producto se construirá sin un DGP que la ordene.

## 2. Anatomía prevista de un DGP

| Sección | Contenido |
|---|---|
| Alcance | qué piezas se construyen (por código de catálogo: comandos ETS-008, plantillas T-nn de 18) y qué queda explícitamente fuera |
| Fuentes normativas | citas exactas: qué documentos ETS/ESI norman cada pieza — el contexto oficial completo (17 §3.2) |
| Orden y dependencias | secuencia de construcción cuando importa (p. ej. puerto antes que adaptador; migración antes que repositorio) |
| Criterios de aceptación | qué debe estar verde para dar el DGP por cumplido: suites, matrices transversales, checklist 25, seed actualizado (12 §2.6) |
| Decisiones delegadas | los pocos grados de libertad que el implementador puede decidir solo (con ADR ligero si trascienden la pieza) |

## 3. Lo que esta plataforma deja listo para los DGP

1. **Vocabulario estable de referencia**: toda pieza futura es nombrable por códigos ya existentes (comando del catálogo ETS-008, plantilla T-nn, módulo del catálogo ETS-002) — los DGP no describirán formas, las citarán.
2. **La vía de creación**: `generar` + plantilla + puerta (19/18/ESI-001-10); el DGP ordena QUÉ, la plataforma ya fijó CÓMO.
3. **El entorno de verificación**: cualquier implementador (humano o IA) verifica su DGP con los comandos oficiales (16) en el entorno local completo (11) con datos (12).
4. **El marco para agentes**: 17 define cómo un agente ejecuta un DGP con revisión humana; los DGP serán el formato natural de instrucción para agentes.
5. **El registro de decisiones**: lo que un DGP decida dentro de sus grados de libertad queda en ADRs de la serie única (ESI-001/11).

## 4. Reglas de frontera (protegen la coherencia)

1. **Un DGP no puede contradecir ETS/ESI**: si la implementación revela un conflicto o vacío normativo, se detiene esa pieza y el conflicto se resuelve como defecto de documentación en el nivel que corresponda (01 §4) — jamás se "resuelve" en el código.
2. **Un DGP no redefine plataforma**: si necesita un comando, plantilla o herramienta nueva, primero pasa por el gobierno de esta serie (27) — el DGP consume plataforma, no la muta de contrabando.
3. **Los DGP son secuenciables y acotados**: un DGP grande es un DGP mal cortado; el tamaño de referencia es lo que un implementador entrega por la puerta en días, no semanas (coherente con 04 §1).
4. **Trazabilidad total**: cada PR cita su DGP; cada DGP lista sus PRs resultantes — del requisito a la pieza mergeada hay una cadena legible.

## 5. Secuencia esperada (orientativa, no vinculante)

Esqueleto de plataforma (bootstrap, zonas, plantillas, generadores, puerta) → Kernel → plataforma de aplicación (pipelines, UoW, outbox) → primer módulo de referencia completo (el aula de 06) → módulos siguientes según prioridad de producto. La secuencia definitiva la fijarán los propios DGP.

---

## Impacto sobre la implementación
Cuando lleguen los DGP, no habrá que inventar nada de proceso: alcance por códigos, forma por plantillas, vía por generadores, juicio por la puerta y registro por ADRs — la construcción empieza el día que empiece.

## Dependencias
18/19 (formas y vías) · 16 (verificación) · 17 (agentes) · 27 (gobierno que arbitra fronteras) · catálogos ETS-002/008 (vocabulario).

## Riesgos
- DGP usados como vehículo de cambios de arquitectura "urgentes" → regla 1 del §4; la detención por conflicto es el comportamiento correcto, no una falla.
- Inflación de grados de libertad delegados → los DGP tempranos delegan poco; se amplía con madurez demostrada.

## Decisiones habilitadas
Formato definitivo del DGP (primer DGP como plantilla de sí mismo, T15), planificación del Sprint 1 (26), dirección de agentes a escala.

## Decisiones bloqueadas
Contenido y secuencia definitiva de los DGP — fase siguiente del programa; nada se construye hasta el primer DGP.
