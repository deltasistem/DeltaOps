# 05 — Dependency Injection

> **DeltaOps — ESI-003 · v1.0** · Composición explícita: el grafo se arma una vez, en el arranque, a mano.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Modelo oficial: composición manual en la raíz

DeltaOps usa **inyección por constructor con composición manual en la raíz del arranque**. No se adopta un framework de DI con contenedor mágico, autowiring ni resolución por reflexión.

**Por qué:** el grafo de dependencias de una aplicación modular con Kernel y puertos (ETS-011) es finito y estable; componerlo a mano lo hace legible en un solo archivo por proceso, revisable en PR, imposible de romper en caliente y trivial de replicar en pruebas. Un contenedor dinámico oculta el grafo y convierte errores de composición en fallos de runtime; la composición manual los convierte en fallos de arranque inmediatos (doc 02, regla 3).

## 2. Ámbitos de vida

| Ámbito | Piezas | Regla |
|---|---|---|
| **Proceso** | Configuración validada, pool de BD, dispatcher, catálogos del Kernel, clientes de integraciones, logging | Se construyen una vez en el bootstrap; inmutables después |
| **Petición / mensaje** | Contexto de ejecución (doc 09), UoW con su transacción, repositorios ligados a esa UoW | Se construyen al entrar, se destruyen al salir; jamás se comparten entre peticiones |
| **Efímero** | Comandos, consultas, resultados | Valores puros, sin gestión |

La frontera crítica es proceso ↔ petición: nada con estado de petición (contexto, transacción) puede quedar capturado en una pieza de ámbito proceso. La revisión de PR y las pruebas de concurrencia vigilan esta regla.

## 3. Reglas normativas

1. **Solo inyección por constructor.** Prohibidas la inyección por atributo, los localizadores de servicios y los imports de instancias globales.
2. **Se inyectan puertos, no implementaciones.** Un caso de uso declara que necesita el puerto de repositorio de su agregado; el arranque decide la implementación (real o fake según ETS-011 y ESI-002/18 T05).
3. **Los módulos declaran, el arranque compone.** Cada módulo expone su lista de piezas y necesidades mediante el contrato de registro (doc 06); no se cablea a sí mismo.
4. **Las pruebas componen su propio grafo** con fakes del Kernel; no existe un "modo test" del contenedor de producción.
5. **Sin dependencias circulares.** Si dos piezas se necesitan mutuamente, el diseño está mal: se resuelve con eventos o rediseñando la frontera, nunca con inyección perezosa.

## 4. Relación con FastAPI

El sistema de dependencias del framework HTTP se usa solo en el borde, para extraer el contexto de la petición y entregar el caso de uso ya compuesto. No es el contenedor de la aplicación: los módulos no lo conocen (doc 01, principio 1).

## Impacto sobre la implementación

El DGP de arranque define la raíz de composición por proceso (API, worker). Las plantillas T01/T05 (ESI-002/18) nacen con inyección por constructor y puertos.

## Dependencias

Docs 02, 06 y 09; ETS-011 (puertos y fakes); ESI-001 (stack aprobado).

## Riesgos

- Crecimiento de la raíz de composición hasta volverse ilegible; mitigación: la raíz se organiza por módulo, espejo de la estructura física (doc 25).
- Fugas de estado de petición a ámbito proceso; mitigación: regla 2 de ámbitos verificada en revisión y pruebas de concurrencia.

## Decisiones habilitadas

- Escribir plantillas y generadores que produzcan piezas inyectables por constructor.
- Componer grafos de prueba con fakes sin infraestructura.

## Decisiones bloqueadas

- Prohibido adoptar frameworks de DI con autowiring.
- Prohibidos singletons globales importables y localizadores de servicios.
- Prohibida la resolución de dependencias en caliente durante el servicio.
