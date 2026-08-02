# 14_RESULT_PATTERN.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Resultados: el desenlace como valor, el flujo de negocio visible.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. La forma del Resultado (Kernel, ETS-011/02)

```
RESULTADO (exactamente tres variantes, cerradas):
  CONFIRMADO   { identidad afectada, versión resultante, datos mínimos de respuesta }
  RECHAZADO    { código de catálogo, parámetros, causa nombrada }
  APARTADO     { identidad del hecho apartado, causa de revisión }
```

## 2. Reglas de implementación

1. **El Resultado es del Kernel y es único**: no hay Resultados por módulo ni variantes locales "mejoradas"; los datos específicos de la operación van en el contenido de la variante, jamás en variantes nuevas. Tres desenlaces hoy, tres desenlaces siempre — ampliar el juego de variantes es cambio de Kernel (el más gobernado, ETS-011/28).
2. **El Resultado se construye una vez, en el punto de decisión, y viaja intacto**: el dominio decide → el caso de uso lo transporta → el pipeline lo confirma → el adaptador lo traduce. Nadie en el camino lo "mejora", reinterpreta o degrada.
3. **Obligatorio consumirlo exhaustivamente**: todo código que recibe un Resultado maneja las tres variantes de forma explícita; "solo me interesa el confirmado" no existe — la exhaustividad se verifica con el mecanismo más fuerte que el lenguaje elegido ofrezca, y en revisión donde el lenguaje no alcance.
4. **Rechazo ≠ excepción, siempre** (ETS-011/26): un Resultado rechazado es un valor de retorno normal, esperado y probado; las excepciones del lenguaje quedan reservadas para fallas de infraestructura y defectos — jamás para control de flujo de negocio.
5. **La composición es explícita**: cuando un caso de uso encadena decisiones (motor A, luego Policy B), el corto circuito ante rechazo se escribe visible — la primera decisión negativa es el Resultado del comando; no hay magia de encadenamiento que oculte el flujo.
6. **La respuesta idempotente ES el Resultado serializado** (11 §regla 8): lo que se guarda y lo que se re-responde es el mismo valor — otra razón para que el Resultado sea estable y completo desde su construcción.
7. **En consultas no hay Resultado de tres variantes**: una consulta responde datos o error (denegación, forma); el juego de tres desenlaces es exclusivo de los comandos — usarlo en lectores es señal de que el lector está decidiendo (prohibido, 03 §regla 3).

## 3. Prueba obligatoria

Las pruebas de dominio y caso de uso afirman contra la variante exacta y su contenido (código, causa, identidad) — jamás contra "no lanzó excepción". La suite del Kernel prueba el Resultado mismo: construcción, serialización al sobre del contrato y equivalencia bit a bit para idempotencia.

---

## Impacto sobre la implementación
El Resultado hace el flujo de negocio legible y probable: cualquier lector del código ve los tres caminos, y el compilador/revisor obliga a atenderlos todos.

## ETS relacionados
ETS-011 (02 Kernel, 13 desenlaces, 26 rechazo-no-excepción) · ETS-008 (sobre de respuesta) · ETS-012 (02, 11, 15).

## Riesgos
- Envolturas locales del Resultado por comodidad sintáctica → prohibidas; la comodidad se resuelve en la traducción oficial del Kernel al stack, una vez.
- Variante apartado ignorada por rara → la exhaustividad de la regla 3 la mantiene siempre atendida.

## Decisiones habilitadas
Flujo de negocio auditable en código, idempotencia bit a bit, traducción única al sobre HTTP.

## Decisiones bloqueadas
Representación sintáctica (tipos suma, clases selladas, uniones) — la primera traducción del Kernel la fija.
