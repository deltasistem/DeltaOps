# 04_CORE_DOMAIN_SERVICES.md

> **DeltaOps — ETS-011 · v1.0** · Domain Services en el Núcleo: su lugar arquitectónico, contrato y disciplina.
> El catálogo de motores es ETS-003/04 (documento `04_DOMAIN_SERVICES.md`); aquí se define cómo viven dentro del Core. Este archivo lleva prefijo `CORE_` para no sobrescribir aquel.
> Documento de diseño. Sin código, sin clases.

---

## 1. Lugar arquitectónico

Los Domain Services viven en la **capa de dominio** de su módulo (01 §2): son negocio puro que no cabe en un solo agregado (coordinación de varios agregados del mismo módulo, cálculo transversal, decisión con configuración resuelta). Cada motor de ETS-003/04 (Asignaciones, Preventivos, Checklist, Combustible, Inventario, Costos, Indicadores, Reglas, Permisos, IA, Folios…) se materializa como Domain Service de su módulo ETS-007.

## 2. Contrato normativo

| Regla | Contenido |
|---|---|
| **Sin estado** | Un Domain Service no guarda nada entre invocaciones; el estado es de los agregados |
| **Sin puertos de infraestructura** | Recibe los agregados/datos ya cargados por el caso de uso; jamás consulta repositorios ni servicios externos — puro y probable en memoria |
| **Configuración como argumento** | Recibe la configuración resuelta y versionada (15); jamás la resuelve él |
| **Decide, no persiste** | Devuelve decisiones (nuevos estados, eventos a emitir, rechazos); el caso de uso y el Unit of Work persisten |
| **Dentro del módulo** | Un Domain Service solo toca agregados de su módulo; la coordinación entre módulos es por eventos (10), nunca por un "servicio de dominio transversal" |
| **Determinista** | Mismo insumo, misma decisión; el tiempo y el azar entran como argumentos (reloj/identidad son del contexto, 02) |

## 3. Dos géneros de motor

- **Motores de decisión síncrona** (dentro del comando): Folios, Permisos, validación de asignaciones, saldo de inventario — el caso de uso los invoca en su transacción.
- **Motores de reacción** (consumidores de eventos): Preventivos que escuchan lecturas, Indicadores, Costos consolidados, Reglas de umbral — corren en procesos consumidores (10) pero su lógica de decisión sigue siendo un Domain Service puro; el consumidor es solo el caso de uso interno que lo envuelve (03 §5). **La misma regla de negocio jamás se implementa dos veces** para los dos géneros.

## 4. Frontera con Policies

Cuando la decisión varía por configuración del tenant (¿se permite stock negativo?, ¿qué tolerancia de vencimiento?), el Domain Service consulta una **Policy** (05) que encapsula esa variabilidad; el motor conserva la mecánica invariable. Motor = cómo se decide; Policy = con qué parámetros y variantes.

---

## Impacto sobre la implementación
Cada motor de ETS-003/04 se implementa como servicio puro en la capa de dominio de su módulo, probado exhaustivamente en memoria; los consumidores de eventos lo envuelven sin duplicar lógica.

## ETS relacionados
ETS-003 (04 catálogo de motores, 05 agregados) · ETS-007 (03 módulos) · ETS-011 (03 casos de uso, 05 policies, 10 despachador, 15 configuración).

## Riesgos
- Motores que consultan repositorios "por comodidad" pierden pureza y testeabilidad → regla §2; el lint de dependencias (23) lo detecta.
- Duplicar la regla entre el camino síncrono y el reactivo → regla §3: un solo motor, dos envolturas.

## Decisiones habilitadas
Implementación motor por motor con pruebas en memoria; asignación de cada motor a su módulo; envolturas consumidoras.

## Decisiones bloqueadas
Forma concreta (funciones/objetos del lenguaje) y el orden de implementación de motores.
