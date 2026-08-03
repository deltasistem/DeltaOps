# 03 — Artifact Lifecycle

> **DeltaOps — ESI-010 · v1.0** · El ciclo de vida de los artefactos de ingeniería: qué tipos existen, qué estados recorren y quién gobierna cada transición — integrando los regímenes ya congelados.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Catálogo de artefactos

Todo lo que la ingeniería produce pertenece a un tipo con ciclo de vida normado por su serie fuente:

| Artefacto | Ciclo de vida | Norma fuente |
|---|---|---|
| **Documento normativo** (ETS, Charter, ESI) | Borrador → vigente → congelado → extendido por serie nueva (jamás mutado) | ESI-002/27; doc 15 |
| **DGP** | Derivado de normas → vigente → actualizado por decisión | ESI-005/27, ESI-007/25, ESI-008/27, ESI-009/27 |
| **ADR (decisión)** | Propuesta → decidida → vigente → reemplazada (con sucesora explícita) | ESI-002/27; doc 07 |
| **Código** | Rama → PR → principal → versión etiquetada → N-1 → fuera de soporte | ESI-009/02-05, /11 |
| **Contrato publicado** (API, evento, exporte) | Diseñado → publicado → N/N-1 → deprecado con ventana → retirado | ESI-003; ESI-009/11; doc 13 |
| **Esquema de datos** | Expansión → migración → contracción (tras ventana) | ESI-003; ESI-009/10 |
| **Versión de producto** | Candidata → liberada → N-1 → fuera de soporte | ESI-009/10-11 |
| **Toggle** | Registrado → activo → vencido→ retirado (con su código) | ESI-009/12 |
| **Prueba** | Escrita con el cambio → vigente → cuarentena con plazo → reparada o retirada | ESI-009/08 |
| **Deuda registrada** | Declarada → priorizada → pagada o prescrita por decisión | ESI-009/17 |
| **Waiver** | Concedido con dueño y caducidad → vencido → cerrado | ESI-007/18 |
| **Pantalla** | Contrato de ocho rubros → diseñada → EC/XR en verde → viva bajo score | ESI-008/05, /25 |

## 2. Reglas de integración

1. **Ningún artefacto sin ciclo**: lo que se produce y no aparece en el catálogo se asimila a un tipo existente o dispara la pregunta al proceso (doc 22); el artefacto sin régimen es el lugar donde el gobierno se fuga.
2. **Todos los ciclos comparten cuatro propiedades**, ya establecidas por sus fuentes: **dueño identificable**, **estado visible**, **transiciones con rastro** y **final explícito** (nada vive para siempre por omisión — el patrón dueño+caducidad de ESI-007/18 generalizado de hecho por las series).
3. **Los estados terminales se ejecutan**: retirar el toggle vencido, contraer el esquema tras la ventana, cerrar el waiver, prescribir la deuda — la acumulación de artefactos en estados finales no ejecutados es la entropía medible del sistema (doc 25 la expone).
4. **El artefacto cita su norma**: cada instancia (un ADR, un contrato, un toggle) referencia el régimen que la gobierna; el registro correspondiente (docs 06-13) la indexa.

## Impacto sobre la implementación

Los registros de esta serie exponen el estado de los artefactos con los instrumentos ya normados (tableros de higiene ESI-009/18, registros de ESI-007); ninguna mecánica nueva.

## Dependencias

ESI-002/27; ESI-003; ESI-007/18; ESI-008/05, /25; ESI-009/02-05, /08, /10-12, /17; docs 06-13, 15, 22, 25.

## Riesgos

- El catálogo tratado como taxonomía académica sin efecto; mitigación: cada fila apunta a un régimen congelado con consecuencias reales, y el tablero (doc 25) mide los estados finales no ejecutados.

## Decisiones habilitadas

- Auditoría del inventario vivo de ingeniería por tipo y estado.
- Detección de entropía (artefactos estancados) con métrica.

## Decisiones bloqueadas

- Prohibidos artefactos sin tipo, dueño y ciclo.
- Prohibido inventar ciclos nuevos para tipos ya normados.
- Prohibida la acumulación indefinida en estados terminales.

## Reusable Pattern

Catálogo de artefactos con dueño+estado+rastro+final explícito: la generalización integradora del régimen de vida gobernada de la casa.

## Anti-Patterns

- El documento "temporal" sin estado que sobrevive años.
- El contrato deprecado que nunca se retira.
- Registrar el artefacto y no ejecutar jamás su transición final.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: los regímenes de ciclo de ESI-002, ESI-003, ESI-007, ESI-008, ESI-009 (tabla §1).
- **DGP que originará**: ninguno; los tableros ya normados exponen los estados.
- **ADR relacionados**: ADR de catálogo único de artefactos con vida gobernada.
- **Módulos que reutilizarán este patrón**: todos sus artefactos caen en el catálogo sin excepción.
