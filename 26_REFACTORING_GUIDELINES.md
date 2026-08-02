# 26_REFACTORING_GUIDELINES.md

> **DeltaOps — ETS-012 · v1.0** · Estrategia de Refactorización: mejorar la forma sin tocar el comportamiento, dentro de las líneas.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Qué es refactorizar en DeltaOps

Cambiar la forma interna de una pieza **sin cambiar su contrato observable**: mismo catálogo, mismos Resultados, mismos eventos, mismos sobres, misma semántica de configuración. Si algo de eso cambia, no es refactor — es evolución (27) y sigue su gobierno.

## 2. Reglas de refactorización

1. **La red de seguridad primero**: solo se refactoriza lo que tiene pruebas de contrato verdes (25 §regla 5); si la pieza no las tiene, el paso uno del refactor es escribirlas contra el comportamiento actual — jamás refactorizar a ciegas "porque es obvio".
2. **Refactor y comportamiento jamás viajan juntos**: un PR refactoriza O cambia comportamiento, nunca ambos; el revisor de un refactor debe poder verificar "cero cambio observable" leyendo el diff, y las pruebas existentes deben pasar SIN modificarse (si hubo que tocar pruebas de contrato, algo observable cambió).
3. **Los límites arquitectónicos no se refactorizan localmente**: mover piezas entre capas, fusionar módulos, cambiar firmas de puertos o alterar el árbol (23) es decisión de arquitectura registrada (ETS-011/28) — el refactor cotidiano ocurre DENTRO de las cajas, no entre ellas.
4. **Dirección permitida de la mejora**: hacia las plantillas del manual — extraer decisión del caso de uso al dominio, angostar un puerto, adelgazar un adaptador, dividir un motor confuso en decisiones nombradas. Un "refactor" que aleja la pieza de su plantilla es una regresión de forma y se rechaza.
5. **La regla de la fricción tres veces**: la duplicación entre módulos se tolera (regla de oro 4); solo cuando el MISMO concepto exige corrección coordinada por tercera vez se evalúa promoverlo a Kernel/plataforma — y eso es gobierno (ETS-011/28), no un refactor de viernes.
6. **Refactor oportunista con presupuesto**: al tocar una pieza por trabajo normal se permite dejarla mejor (nombres, extracción local) si cabe en el mismo PR sin engordarlo; lo que excede va a la lista de deuda explícita con dueño — jamás un "ya que estamos" que duplica el diff.
7. **Lo publicado no se refactoriza**: eventos históricos, códigos de error, claves de configuración y contratos de API son historia o interfaz pública — mejorarlos es versionar (27), nunca renombrar in situ (24 §3.2).
8. **Métrica de éxito**: después del refactor, las pruebas pasan intactas, la verificación de dependencias pasa, y la pieza está más cerca de su plantilla. Los tres, o no era refactor.

## 3. Señales que obligan a refactorizar (no opcionales)

Caso de uso que supera una pantalla (04 §regla 7) · condicional de negocio en caso de uso o adaptador · puerto que engordó sin consumidores nuevos · pieza cuya prueba exige infraestructura · duplicación intra-módulo (esa sí es deuda inmediata). Estas señales aparecen en revisión y generan trabajo obligatorio, no sugerencias.

---

## Impacto sobre la implementación
El refactor tiene reglas de juego: siempre posible dentro de las cajas gracias a las pruebas de contrato, y jamás una puerta trasera para cambiar arquitectura o contratos sin gobierno.

## ETS relacionados
ETS-011 (23, 25, 28) · ETS-012 (25 red de seguridad, 27 la frontera con evolución, 28 checklist).

## Riesgos
- "Gran refactor" acumulado como proyecto épico → la mejora continua con presupuesto (regla 6) existe para que el big-bang nunca sea necesario.
- Refactors que reescriben pruebas para que pasen → regla 2: pruebas de contrato intactas o no es refactor.

## Decisiones habilitadas
Mejora continua segura, deuda visible con dueño, revisión de refactors objetiva.

## Decisiones bloqueadas
Herramientas de refactorización asistida — con el stack; las reglas de juego las sobreviven.
