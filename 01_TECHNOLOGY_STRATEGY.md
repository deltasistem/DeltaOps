# 01_TECHNOLOGY_STRATEGY.md

> **DeltaOps — ESI-001 · v1.0** · Estrategia tecnológica: cómo se elige, no solo qué se elige.
> Documento de ingeniería. Sin código, sin configuración. Subordinado a ETS-001…012 y al ENGINEERING_CHARTER.

---

## 1. Visión general

DeltaOps se implementará como **monolito modular** (ETS-007, ETS-011/24) sobre un stack deliberadamente **aburrido, maduro y mayoritario**: tecnologías de propósito general con más de una década de producción, comunidades masivas y soporte de largo plazo. La arquitectura ya provee la sofisticación (pipelines, outbox, CQRS, multi-tenant); la tecnología debe proveer estabilidad y no protagonismo. Ninguna elección de este ESI altera un solo contrato, evento o patrón de los ETS: el stack sirve a la arquitectura, jamás la reinterpreta (Charter §1).

## 2. Principios de selección

1. **La arquitectura manda**: se elige lo que mejor materializa las garantías ya normadas (outbox transaccional, RLS, at-least-once, generación desde contratos) — no lo más novedoso.
2. **Aburrido antes que brillante**: tecnología con problemas conocidos y soluciones documentadas vale más que tecnología con promesas.
3. **Una tecnología por necesidad**: sin duplicidades (un solo framework de backend, un solo gestor de estado de servidor, una sola cola de trabajo); la segunda opción para la misma necesidad exige ADR (11).
4. **Sustituible tras puertos**: toda pieza externa queda detrás de un puerto (ETS-011/06); el costo de reemplazo debe ser un adaptador, jamás una reescritura.
5. **Open source primero**: sin dependencia dura de servicios propietarios; lo gestionado (nube) es opción de despliegue, no de diseño.
6. **Un lenguaje por plano**: un lenguaje de backend, un lenguaje de frontend — la fragmentación de lenguajes es costo permanente sin beneficio para un producto de este tamaño (KISS).

## 3. Criterios de selección (aplicados a toda decisión de esta serie)

| Criterio | Umbral exigido |
|---|---|
| **Madurez** | ≥ 5 años en producción amplia; historial de manejo de vulnerabilidades |
| **Comunidad** | ecosistema masivo, documentación de primera, talento contratable en el mercado hispanohablante |
| **LTS / ciclo de vida** | política de versiones publicada; soporte de seguridad ≥ 24 meses por versión mayor |
| **Costo** | licencia libre (OSI); costo operativo lineal y predecible; sin peajes por tenant o por asiento |
| **Compatibilidad futura** | trayectoria de compatibilidad demostrada (migraciones mayores documentadas y graduales) |
| **Escalabilidad** | suficiente para NT/NP normados (ETS-007/009/010) escalando vertical + réplicas, sin re-arquitectura |
| **Ajuste arquitectónico** | soporta nativamente lo que los ETS exigen (transacciones serias, tipado de contratos, generación) |

## 4. Compatibilidad futura y estrategia de salida

- Toda versión adoptada se registra con su fecha de fin de soporte; la actualización de versiones mayores es trabajo planificado del roadmap (12), no emergencia.
- La estrategia de salida de cada pieza está escrita en su ADR: qué puerto la encapsula, qué costaría sustituirla, qué señal obligaría a hacerlo.
- Los datos son siempre exportables en formatos abiertos (SQL estándar, JSON, archivos) — ninguna tecnología captura los datos del producto.

## 5. Costo, madurez, comunidad, escalabilidad — postura oficial

- **Costo**: el stack completo de desarrollo es de licencia libre; el costo de producción es infraestructura (cómputo, almacenamiento, red) y crece con tenants, no con features.
- **Madurez**: se adopta la versión estable actual con soporte largo, jamás betas/RC en producción.
- **Comunidad**: ante empate técnico, gana la comunidad más grande — el costo real de una tecnología es el tiempo de resolver sus problemas.
- **Escalabilidad**: el objetivo es escalar el monolito modular (vertical + réplicas de lectura + consumidores desacoplados) hasta los volúmenes NP; la extracción de módulos (ETS-011/28) es la válvula futura ya diseñada, no una necesidad del stack.

---

## Impacto sobre la implementación
Todos los documentos 02-10 de esta serie aplican estos criterios y cada decisión queda registrada como ADR (11); ninguna tecnología entra al proyecto sin pasar por esta tabla.

## Dependencias
ETS-007/009/010 (garantías y volúmenes que el stack debe satisfacer) · ENGINEERING_CHARTER (§3, §4, §13) · ETS-012 (patrones que la traducción oficial materializará).

## Riesgos
- Deriva hacia novedades por entusiasmo → el ADR obligatorio y el principio "aburrido antes que brillante" son el freno.
- Subestimar el fin de soporte de versiones → registro de fechas EOL y trabajo planificado en el roadmap.

## Decisiones habilitadas
Selección de cada stack específico (02-10), ADRs con formato único, roadmap tecnológico.

## Decisiones bloqueadas
Configuración concreta de cada herramienta y traducción de plantillas ETS-012 al stack — ESI posteriores.
