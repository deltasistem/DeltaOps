# 05 — Dependency Map

> **DeltaOps — ESI-010 · v1.0** · El mapa de dependencias del sistema: qué se apoya en qué — series, plataformas, módulos y transversales — y la regla de que la dependencia legal ya está declarada.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El mapa por capas

De abajo hacia arriba; todo apoyo cruza solo hacia abajo o hacia contratos:

| Capa | Piezas | Depende de |
|---|---|---|
| **Producto/Principios** | ETS-001…012, Charter | — (raíz) |
| **Estrategia y plataforma técnica** | ESI-001, ESI-002 | ETS, Charter |
| **Fundación backend** | Kernel, comandos/consultas, persistencia, eventos (ESI-003) | ESI-001/002 |
| **Fábrica de módulos** | Anatomía y referencia (ESI-004); módulos de negocio (ESI-005) | ESI-003; entre módulos solo por contratos (ESI-005/04) |
| **Servicios compartidos** | Notificaciones, búsqueda, exportes, IA, KPIs, configuración… (ESI-006) | ESI-003; consumidos por módulos y experiencia |
| **Transversales** | Seguridad (ESI-007), Experiencia (ESI-008), Entrega (ESI-009) | Atraviesan todas las capas sin pertenecer a ninguna |
| **Sistema operativo** | ESI-010 | Integra todo por referencia |

## 2. Reglas de integración

1. **Las dependencias legales ya están normadas**: fronteras de módulos (ESI-005/04), consumo de servicios compartidos (ESI-006/02), contratos del Kernel (ESI-003), superficies sobre contratos (ESI-008/05); este mapa las consolida — no crea permisos nuevos ni excepciones.
2. **La dependencia no declarada es ilegal**: el acoplamiento fuera de contratos es hallazgo de puerta de arquitectura (ESI-009/07) y de revisión (DR-04); el mapa es el patrón contra el que la puerta compara.
3. **El sentido importa**: los módulos dependen de servicios compartidos y jamás al revés; los transversales imponen normas hacia todas las capas pero no contienen lógica de negocio; el Kernel no conoce a los módulos.
4. **El mapa alimenta el "afectado-primero"** (ESI-009/09 §2.2): el grafo de paquetes del monorepo es la instancia mecánica de este mapa; su divergencia con el mapa normativo es un defecto a investigar.
5. **El impacto se recorre por el mapa**: cambiar un contrato, un servicio o una norma exige recorrer sus dependientes (radio, doc 26 §4); el registro de contratos (doc 13) dice quiénes son.

## Impacto sobre la implementación

El mapa es el patrón de las puertas de arquitectura y del análisis de impacto; su instancia mecánica ya existe en el grafo del monorepo.

## Dependencias

ESI-002/02; ESI-003; ESI-005/04; ESI-006/02; ESI-007…009 (transversales); docs 11-13, 26.

## Riesgos

- El mapa normativo y el grafo real divergiendo en silencio; mitigación: la verificación de deriva en el contexto programado del pipeline (ESI-009/09 §2.1) compara ambos — la divergencia es defecto, no matiz.

## Decisiones habilitadas

- Análisis de impacto de cualquier cambio con recorrido definido.
- Verificación mecánica de arquitectura contra un patrón único.

## Decisiones bloqueadas

- Prohibidas dependencias fuera del mapa y sus contratos.
- Prohibida la dependencia de servicios compartidos hacia módulos.
- Prohibida lógica de negocio en los transversales.

## Reusable Pattern

Mapa por capas + dependencia legal declarada + instancia mecánica verificable: la arquitectura como patrón comparable, no como aspiración.

## Anti-Patterns

- El atajo "temporal" entre módulos sin contrato.
- El servicio compartido que conoce casos particulares de un módulo.
- Mantener el mapa en una pizarra y la realidad en otra.

## Knowledge Graph

- **ETS que consume**: ETS-002/003 (el dominio que ordena las capas de negocio).
- **ESI que consume**: ESI-002/02; ESI-003; ESI-005/04; ESI-006/02; ESI-007…009.
- **DGP que originará**: ninguno; las puertas ya normadas lo verifican.
- **ADR relacionados**: ADR de mapa de capas con verificación de deriva.
- **Módulos que reutilizarán este patrón**: todos declaran su posición y dependencias contra el mapa.
