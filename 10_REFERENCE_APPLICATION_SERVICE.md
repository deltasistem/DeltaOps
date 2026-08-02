# 10 — Application Service de Referencia

> **DeltaOps — ESI-004 · v1.0** · El caso de uso como orquestador puro: carga, pregunta, ordena, confirma — y nada más.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Contrato del caso de uso "Activar Elemento de Referencia"

| Aspecto | Diseño |
|---|---|
| Entrada | Contexto de ejecución (ESI-003/09) + comando validado en forma (doc 08) |
| Dependencias inyectadas | UoW, repositorio de elementos (puerto), proveedor de parámetros de Policy (puerto ETS-005), reloj | 
| Salida | Resultado del contrato: estado nuevo y versión, o error canónico |
| Ceremonia | Toda la del pipeline (doc 07), en el orden exacto del doc 05 §2 |

## 2. La regla de oro que este ejemplar fija

El caso de uso **orquesta y no decide**:

1. **Carga** lo que el dominio necesitará (elemento, cuenta de activos del tenant, parámetro del límite). Todas las lecturas de decisión ocurren **dentro de la UoW**, para que la decisión y la escritura vean el mismo mundo.
2. **Pregunta** a la Policy y **ordena** al agregado. Los "no" salen de ellos como errores canónicos; el caso de uso no los re-decide ni los suaviza.
3. **Registra**: el agregado emite su evento; la UoW lo lleva al outbox (doc 13).
4. **No traduce**: los errores canónicos suben tal cual a la frontera (ESI-003/15); el caso de uso no conoce HTTP.

Prueba de pureza: el caso de uso completo se prueba con los fakes del Kernel (ETS-011) sin infraestructura, y esa prueba cubre todos sus caminos (doc 19).

## 3. Reglas normativas

1. **Un caso de uso por comando**: sin casos de uso "gestores" que atienden varios comandos con banderas.
2. **Sin llamadas entre casos de uso**: si dos comandos comparten pasos, el paso común es dominio (servicio de dominio, doc 11) o es un evento; jamás un caso de uso invocando a otro.
3. **Tamaño como señal**: un caso de uso que crece más allá de la orquestación legible indica dominio anémico — la lógica se está quedando en el lugar equivocado.
4. **Nada de estado propio**: el caso de uso es de ámbito petición (ESI-003/05) y no recuerda nada entre invocaciones.

## Impacto sobre la implementación

Forma canónica de la plantilla T01; el generador produce esta estructura con los huecos de dominio marcados. La prueba con fakes es parte de la plantilla.

## Dependencias

Docs 05, 07-09, 11-13; ESI-003/05, /09, /15, /20; ETS-011 (fakes y planos).

## Riesgos

- Casos de uso anémicos al extremo contrario (pura delegación sin cargar lo necesario), rompiendo la coherencia transaccional; mitigación: la regla "lecturas de decisión dentro de la UoW" está en el checklist de revisión (doc 26).

## Decisiones habilitadas

- Pruebas de aplicación completas sin infraestructura, rápidas, en el peldaño local (ESI-002/14).
- Distinción mecánica orquestación/decisión en revisión.

## Decisiones bloqueadas

- Prohibido decidir reglas de negocio en el caso de uso.
- Prohibidas llamadas entre casos de uso.
- Prohibido traducir errores a HTTP dentro del caso de uso.

## Reusable Pattern

Los DGP futuros copian: el contrato §1 como formulario, la regla de oro §2 (cargar-preguntar-ordenar-registrar) como estructura de todo caso de uso, y la prueba de pureza con fakes como criterio de aceptación.

## Anti-Patterns

- "Servicios de aplicación" con decenas de métodos — el caso de uso es una operación.
- Lecturas de decisión fuera de la transacción (deciden sobre un mundo que ya cambió).
- Casos de uso que consultan HTTP, sesión o framework directamente.
