# ENGINEERING_CHARTER.md

> **DeltaOps — Engineering Charter · v1.0**
> Constitución Oficial de Ingeniería de DeltaOps.
> Gobierna toda la fase Engineering Specification (ESI) y toda implementación futura.
> Documento normativo. Sin código, sin tecnologías, sin frameworks.

---

## 1. Propósito de la fase Engineering Specification (ESI)

La fase Enterprise Technical Specification (ETS-001…012) está **completada y aprobada**. DeltaOps queda completamente definido en lo funcional, arquitectónico y empresarial. Comienza la fase **ESI**.

| | Arquitectura del Producto (ETS) | Ingeniería del Producto (ESI) |
|---|---|---|
| Pregunta que responde | **Qué** es DeltaOps y **cómo está diseñado** | **Con qué** y **cómo se construye** lo ya diseñado |
| Decide sobre | dominio, módulos, contratos, datos, pipelines, patrones | tecnologías, estándares, herramientas, entornos, procesos |
| Naturaleza | diseño — creativa y ya cerrada | ejecución — disciplinada y abierta |
| Puede rediseñar el producto | sí (ya concluyó) | **jamás** |

Un documento ESI que rediseñe dominio, contratos, eventos o arquitectura es inválido por definición: se descarta y se reescribe. La ESI **traduce** — no reinterpreta.

---

## 2. Jerarquía documental oficial

```
Visión del Producto
      ↓
     ETS   (ETS-001 … ETS-012 — congelados)
      ↓
     ESI   (especificaciones de ingeniería)
      ↓
Código Fuente
      ↓
   Pruebas
      ↓
  Despliegue
      ↓
  Operación
```

**Regla de subordinación absoluta:** ningún nivel puede contradecir al nivel superior. Un conflicto detectado en un nivel inferior no se resuelve localmente: se escala al nivel donde nació el error y se corrige ahí, propagando hacia abajo. El código que contradice un ESI es un defecto; un ESI que contradice un ETS es nulo; un ETS que contradijera la Visión habría requerido gobierno en su momento — hoy están congelados.

Corolarios:
- La documentación de nivel superior es la fuente de verdad ante cualquier duda de implementación.
- "El código ya lo hace distinto" nunca es argumento: el código se corrige o el cambio se gobierna (§9).
- Toda pieza de código debe poder rastrearse hacia arriba: operación del catálogo (ETS-008), patrón del manual (ETS-012), documento ESI que la habilitó.

---

## 3. Principios oficiales de Ingeniería

1. **Architecture First** — la arquitectura definida en ETS precede y gobierna toda decisión de ingeniería; nada se implementa "mientras se decide la arquitectura", porque la arquitectura ya está decidida.
2. **Implementation by Specification** — no se implementa nada que no esté especificado (catálogo ETS-008, patrones ETS-012, ESI correspondiente); la especificación faltante se escribe antes, no después.
3. **Contract First** — el contrato (API, evento, clave de configuración) existe y está aprobado antes de la primera línea que lo implemente; los tipos de frontera se generan del contrato, jamás a mano.
4. **Configuration First** — la variabilidad por tenant es configuración gobernada (ETS-005), nunca ramas de código; `si tenant == X` está prohibido en toda la plataforma.
5. **Test First** — la prueba nace con la pieza y en su plantilla (ETS-012/25); el comportamiento esperado se escribe como prueba antes o junto con la implementación, jamás después "si da tiempo".
6. **Security by Design** — deny-by-default, dos murallas de aislamiento multi-tenant, clasificación de datos (ETS-006/13), auditoría estructural imposible de omitir; la seguridad no se agrega: se hereda del diseño.
7. **Performance by Design** — los presupuestos de latencia (ETS-004/11) y las decisiones físicas (ETS-010) son requisitos verificables desde el primer despliegue; el rendimiento no se "optimiza al final".
8. **Observability by Design** — trazas, métricas y correlación llegan de los pipelines (ETS-011/27) automáticamente; ninguna pieza se considera operable sin sus señales.
9. **Automation First** — todo lo repetible se automatiza: generación desde contratos, verificación de dependencias, matrices de prueba, despliegues; la disciplina manual es un defecto de tooling, no una virtud.
10. **Documentation as Code** — la documentación técnica vive en el repositorio, se versiona con el código, se revisa en el mismo PR y se genera de fuentes ejecutables (metadatos, contratos) siempre que sea posible.
11. **Quality First** — la puerta de calidad (ETS-012/28) es innegociable; la presión de calendario reduce alcance, jamás calidad; no existe el "merge con deuda invisible".
12. **AI Assisted Development** — la IA es fuerza de implementación de primera clase bajo las reglas de §6 y §11; se aprovecha al máximo dentro de la arquitectura, jamás por encima de ella.

---

## 4. Autoridad de decisión

| Nivel | Puede decidir | No puede decidir |
|---|---|---|
| **ETS** (congelado) | dominio, módulos, contratos, eventos, datos, pipelines, patrones obligatorios | — (fase cerrada; cambios solo por §5) |
| **ESI** | tecnologías, versiones, herramientas, estándares de código, entornos, procesos de entrega, traducción oficial de los patrones al stack | nada que altere dominio, contratos, eventos, arquitectura o patrones ETS |
| **Desarrollador** | detalles internos de una pieza dentro de su plantilla: nombres locales conforme a ETS-012/24, estructura interna de un método, orden de pruebas de su pieza, mejoras de refactor dentro de las cajas (ETS-012/26) | contratos, eventos, dependencias entre capas/módulos, puertos nuevos, claves de configuración, esquemas, cualquier desviación de plantilla |
| **IA** | lo mismo que un desarrollador — ni más ni menos; toda salida de IA se somete a la misma puerta de calidad | todo lo que un desarrollador no puede; además, jamás decide ante ambigüedad: la señala |
| **Aprobación arquitectónica** (requerida) | cambios a cualquier ETS, puertos nuevos, etapas de pipeline, cambios al Kernel, fusión/división de módulos, excepciones a reglas de dependencia, cambios a esta Constitución | — |

**Regla de la duda:** quien no sabe si tiene autoridad para una decisión, no la tiene — se escala. Escalar es barato; desarmar una decisión no autorizada ya implementada es caro.

---

## 5. Congelamiento arquitectónico

**La arquitectura del producto DeltaOps se declara oficialmente congelada.** ETS-001…012 son la referencia inmutable de la fase de ingeniería.

Todo cambio arquitectónico, sin excepción, deberá:
1. **Justificarse** — problema concreto que la arquitectura vigente no resuelve, con evidencia (no preferencia).
2. **Documentarse** — como propuesta formal de cambio, con impacto analizado en todos los niveles inferiores.
3. **Referenciar el ETS correspondiente** — documento, sección y texto exacto que se propone modificar.
4. **Ser aprobado explícitamente** — por la autoridad arquitectónica; el silencio no es aprobación; la urgencia no es aprobación.

Aprobado el cambio, el ETS se versiona (jamás se edita silenciosamente), los ESI afectados se actualizan, y solo entonces se toca el código. El congelamiento no significa perfección: significa que la arquitectura solo cambia por la puerta, nunca por erosión.

---

## 6. Rol oficial de la IA

La IA (ChatGPT, Replit AI, Cursor, Copilot, Claude o cualquier otra) es un implementador bajo constitución — nunca un arquitecto de facto.

**La IA NO:**
- No diseña el negocio — el dominio está definido en ETS-003 y su lenguaje es ley.
- No modifica el dominio — agregados, motores, Policies e invariantes solo cambian por gobierno humano (§5, §9).
- No redefine eventos — los eventos son historia y contrato (ETS-009/18); su forma solo evoluciona por versionado gobernado.
- No cambia contratos — el catálogo ETS-008 y las claves ETS-005 solo cambian por el proceso de cambios (§9).

**La IA SÍ:**
- Implementa — piezas completas conforme a las plantillas de ETS-012, dentro del árbol de ETS-011/24.
- Documenta — documentación técnica derivada del código y los metadatos.
- Optimiza — dentro de las cajas, sin alterar contratos observables (refactor según ETS-012/26).
- Propone mejoras técnicas — como propuestas al proceso de cambios, jamás como hechos consumados.
- Detecta riesgos — inconsistencias, violaciones de dependencia, huecos de prueba, deuda; su deber es señalarlos, no repararlos por cuenta propia si la reparación excede su autoridad.
- Genera pruebas — en las plantillas obligatorias, incluidas las matrices transversales.
- Genera documentación técnica — sujeta a la misma revisión que el código.

---

## 7. Reglas de implementación

Toda implementación — humana o asistida — deberá respetar, sin excepción y de forma verificable:

| Principio | Materialización obligatoria |
|---|---|
| **DDD** | lenguaje ubicuo de ETS-003 en código, eventos y nombres; agregados como frontera de consistencia |
| **Clean Architecture** | cuatro capas de ETS-011/01; el dominio no conoce nada externo |
| **Hexagonal** | toda necesidad externa es un puerto (ETS-011/06); todo puerto con fake y suite de contrato |
| **CQRS** | comandos por pipeline y UoW; consultas solo sobre read models; jamás mezclados |
| **SOLID** | responsabilidad única por pieza nombrable, puertos estrechos, inversión de dependencia real |
| **YAGNI** | solo lo catalogado en ETS-008; nada "por si acaso" |
| **KISS** | una plantilla por género de pieza (ETS-012); la creatividad va en el dominio |
| **DRY** | lo universal en Kernel/plataforma una vez; entre módulos, duplicar antes que acoplar |
| **Dependency Rule** | R1-R5 y M1-M5 (ETS-011/23) verificadas mecánicamente en CI; el build falla ante violación |
| **API First** | contrato en catálogo antes que código; fronteras generadas |
| **Configuration First** | variabilidad como Policies + configuración versionada (ETS-005) |
| **Offline First** | el canal móvil es ciudadano pleno: sync, paquetes de configuración congelados, tercer desenlace "apartado" |
| **Append Only** | los hechos no se editan: eventos inmutables, outbox que no se borra, correcciones como hechos compensatorios nuevos |
| **Event Driven** | todo efecto entre módulos viaja por eventos con outbox y consumidores con cursor; jamás llamadas directas entre módulos |

---

## 8. Proceso oficial de desarrollo

```
Análisis        entender la operación/pieza contra ETS + ESI; detectar huecos de especificación
   ↓
ESI             confirmar (o crear) la especificación de ingeniería que habilita el trabajo
   ↓
Implementación  por plantilla (ETS-012), con Test First, dentro del árbol y las reglas
   ↓
Pruebas         pirámide completa + matrices transversales; CI verde total
   ↓
Revisión        checklist obligatorio de PR (ETS-012/28): puntos bloqueantes y de justificación
   ↓
Merge           solo con puerta completa; no existen merges "con pendientes"
   ↓
Release         versionado, con notas generadas y compatibilidad N/N-1 verificada
   ↓
Producción      despliegue gobernado, observado desde el primer minuto; regresión = incidente con dueño
```

Ningún paso se salta ni se reordena. El trabajo que llega a un paso sin haber completado el anterior regresa, no avanza.

---

## 9. Gestión de cambios

| Tipo de cambio | Qué es | Proceso de aprobación |
|---|---|---|
| **Funcional** | comportamiento visible nuevo o distinto (operación, regla, pantalla) | nace en el nivel producto: actualización de ETS aplicable → ESI → implementación; jamás nace en el código |
| **Técnico** | tecnología, herramienta, estándar, optimización sin cambio observable | se decide en ESI; si es refactor puro, basta el proceso de ETS-012/26 |
| **De arquitectura** | capas, módulos, Kernel, pipelines, puertos, patrones | congelamiento (§5): justificar, documentar, referenciar ETS, aprobación explícita |
| **De seguridad** | permisos, clasificación, aislamiento, auditoría, criptografía | prioridad máxima de revisión; aprobación arquitectónica siempre; jamás se relaja un control sin gobierno, ni siquiera "temporalmente" |
| **Urgente** | producción degradada o riesgo activo | vía rápida con TODO el proceso comprimido, no eliminado: el cambio urgente se implementa con la mínima intervención segura, se aprueba por la autoridad disponible, y en las 48 horas siguientes se regulariza (documentación, pruebas, revisión completa). La urgencia jamás justifica romper contratos, murallas de tenant o auditoría |

Regla universal: **todo cambio deja rastro** — quién, qué, por qué, con qué aprobación. El cambio sin expediente se revierte.

---

## 10. Definición oficial de Done

Una pieza de trabajo está **Done** únicamente cuando cumple TODO lo siguiente:

1. **Código** — implementado conforme a su plantilla (ETS-012), dentro del árbol (ETS-011/24), pasando la verificación mecánica de dependencias; fronteras regeneradas, no editadas.
2. **Pruebas** — todas las de su plantilla presentes (tabla de casos, caso de uso con fakes, suite de contrato según aplique); registrada en las matrices transversales; cero pruebas desactivadas.
3. **Cobertura** — exhaustiva por tabla de casos en dominio y motores; tres desenlaces en casos de uso; traducción y errores en adaptadores (criterio por género, ETS-012/25 — no un porcentaje ciego).
4. **Documentación** — metadatos completos (permiso, claves, eventos, errores); documentación derivada regenerada; decisiones no obvias registradas.
5. **Seguridad** — sin secretos en código; datos Restringidos sin fuga a logs/errores/índices/IA; toda escritura por comando y UoW; matriz de autorización actualizada.
6. **Observabilidad** — la pieza emite sus señales heredadas (traza, métricas, correlación) y sus alertas tienen dueño si introduce bandejas o cursores nuevos.
7. **Performance** — dentro de su presupuesto declarado (ETS-004/11), medido, no supuesto; consultas nuevas sobre read models con frescura declarada.
8. **Revisión** — checklist de PR (ETS-012/28) completo; puntos bloqueantes en verde; justificaciones escritas donde se requieren.
9. **Aprobación** — merge aprobado por revisor con autoridad; los cambios que requieren aprobación arquitectónica la tienen, explícita y registrada.

Lo que no cumple los nueve, **no está Done** — está en progreso, sin importar cuánto "funcione".

---

## 11. Normas obligatorias para IA

Toda IA que participe en DeltaOps queda sujeta a estas normas, sin excepción ni interpretación:

1. **Nunca romper contratos** — API, eventos, claves de configuración y códigos de error son inmutables salvo proceso de cambios (§9); ante un contrato que "estorba", la IA señala, no rompe.
2. **Nunca crear dependencias prohibidas** — las reglas R1-R5 y M1-M5 son absolutas; la IA no importa "solo esta vez" a través de una frontera, ni propone excepciones como solución de primera instancia.
3. **Nunca ignorar el lenguaje ubicuo** — los nombres son los de ETS-003 y los patrones de ETS-012/24; la IA no traduce, abrevia ni "mejora" el vocabulario del dominio.
4. **Nunca duplicar lógica** — antes de escribir, la IA verifica si la pieza existe (motor, Policy, caso de uso); la regla DRY del §7 aplica con su matiz: duplicar entre módulos es preferible a acoplar, duplicar dentro de un módulo es defecto.
5. **Nunca escribir código fuera de la arquitectura** — toda pieza nace en su lugar del árbol, con su plantilla, sus metadatos y sus pruebas; el código huérfano de plantilla se rechaza aunque funcione.
6. **Nunca decidir ante ambigüedad** — cuando la especificación calla o parece contradecirse, la IA se detiene y pregunta/señala; una suposición silenciosa de IA es más peligrosa que una humana porque escala más rápido.
7. **Nunca inventar datos, valores por defecto o fallbacks silenciosos** — la regla de explicitud ante fallas (ETS-012/15) aplica también al proceso de desarrollo de la propia IA.
8. **Siempre declarar su trabajo** — el trabajo asistido o generado por IA es identificable en el PR; se revisa con el mismo rigor (o mayor volumen de muestreo) que el humano; la marca `asistido_ia` del producto tiene su espejo en el proceso.

---

## 12. Normas para desarrolladores

**Responsabilidades:**
- Conocer esta Constitución, los ETS de su área y el manual ETS-012 antes de escribir; la ignorancia de la norma no exime.
- Ser dueño de sus piezas de punta a punta: código, pruebas, metadatos, señales y documentación — Done de nueve puntos (§10).
- Escalar a tiempo: la duda de autoridad (§4), la ambigüedad de especificación y el conflicto entre niveles se escalan el mismo día, no se resuelven en silencio.
- Supervisar a la IA que use: el desarrollador responde por todo lo que somete a revisión, lo haya escrito quien lo haya escrito.

**Buenas prácticas obligatorias:**
- PRs pequeños: una operación o una pieza por PR; el PR gigante es en sí una observación de revisión.
- Test First y ciclo en memoria: el flujo de trabajo diario corre las pruebas de negocio en segundos; la infraestructura se toca en integración.
- Refactor continuo con presupuesto (ETS-012/26): dejar la pieza mejor al pasar, sin engordar el diff.
- Deuda siempre visible: lo que se pospone entra al registro con dueño y fecha; la deuda invisible es falta grave.

**Obligaciones:**
- Jamás mergear con puerta incompleta, jamás desactivar pruebas para pasar, jamás editar artefactos generados, jamás escribir directo a la base de datos de ningún entorno gobernado.
- Reportar toda violación de esta Constitución que observe — el silencio ante la erosión es participación en ella.

**Criterios de calidad:** una pieza es de calidad cuando un colega la ubica sin buscar (árbol y nombres), la entiende sin preguntar (plantilla y lenguaje ubicuo), la modifica sin miedo (pruebas de contrato) y la opera sin sorpresas (señales y presupuestos).

---

## 13. Objetivos de la fase ESI

Los documentos ESI tendrán como única finalidad:

1. **Seleccionar tecnologías** — lenguajes, plataformas, motores y servicios que satisfagan las garantías ya normadas (ETS-007/009/010), con criterios explícitos y comparables.
2. **Definir patrones de implementación** — la traducción oficial y única de las plantillas de ETS-012 al stack elegido; una vez por pieza, para siempre.
3. **Definir estándares de ingeniería** — estilo, tooling, CI/CD, entornos, versionado, gestión de secretos y todo lo que el §3 exige automatizar.
4. **Preparar el desarrollo** — esqueleto del proyecto, plantilla de módulo, orden de construcción (plataforma primero, ETS-012/12 §3), y el plan de los primeros incrementos.

**Nunca rediseñar DeltaOps.** Un ESI no agrega operaciones, no cambia eventos, no inventa módulos, no "aprovecha" para mejorar el dominio. Si la ingeniería descubre un problema real de diseño, lo escala por el proceso de cambios (§5, §9) — esa es la única puerta, y esta Constitución es su cerradura.

---

*DeltaOps — Engineering Charter v1.0. Toda implementación futura obedece este documento. Los conflictos entre este documento y cualquier documento de nivel inferior se resuelven a favor de este documento; los conflictos con un ETS se resuelven a favor del ETS.*
