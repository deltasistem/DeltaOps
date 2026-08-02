# 09_ADAPTER_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Adapters: traducir en la frontera, sin opinar.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Las dos familias y su única responsabilidad

| Familia | Traduce | Ejemplos (ETS-011/07) |
|---|---|---|
| **Entrada** | canal → comando/consulta del contrato, y Resultado → sobre del canal | API, sync móvil, consumidores de eventos, jobs, receptores de integración |
| **Salida** | firma del puerto → tecnología concreta, y falla física → error del puerto | persistencia, binarios, canales de notificación, índice, IA, conectores |

Un adaptador **traduce**. No decide, no valida negocio, no orquesta, no recuerda.

## 2. Reglas de implementación

1. **Delgado por definición medible**: un adaptador contiene mapeo de datos, invocación y traducción de errores — nada más. Un condicional de negocio dentro de un adaptador es un defecto de colocación, se mueve, no se comenta.
2. **Adaptadores de entrada construyen el comando completo y neutro**: identidad del actor, canal, clave de idempotencia, correlación — todo el Contexto de Ejecución (Kernel) se arma aquí; el pipeline y el caso de uso reciben lo mismo venga de donde venga (igualdad de canales).
3. **Traducción de errores es SU trabajo, en ambas direcciones**: entrada — Resultado → código HTTP/sobre del canal según ETS-008/07; salida — excepción física → error del puerto (08 §regla 4). Nadie más traduce; nadie re-traduce.
4. **Sin fugas hacia adentro ni hacia afuera**: ningún tipo del framework del canal entra al núcleo; ningún tipo del Kernel se serializa crudo hacia afuera sin pasar por el contrato ETS-008 (los sobres del contrato son la única representación externa).
5. **Los tipos de frontera se generan del contrato** (API First): el adaptador de API no define formas a mano — las toma de la generación desde el catálogo ETS-008; divergencia contrato/código es imposible por construcción.
6. **Idempotencia también en salida**: los adaptadores de salida hacia sistemas externos (notificación, integración) incluyen la clave que el sistema receptor pueda usar para deduplicar; el reintento es la norma, no la excepción (at-least-once, ETS-011/10).
7. **Configuración de conexión por arranque, no por código**: endpoints, credenciales y afinaciones llegan del entorno/secretos al construir el adaptador en `arranque/` — jamás constantes en el cuerpo.
8. **Un consumidor de eventos ES un adaptador de entrada**: recibe el sobre, construye la invocación (proyección o comando de reacción), traduce el desenlace (avance de cursor o bandeja). Las mismas reglas 1-4 le aplican.

## 3. Prueba obligatoria

Los adaptadores se prueban en la capa de integración (ETS-011/25): entrada — se ejercita el canal real contra el núcleo con fakes de salida, afirmando sobres y códigos exactos del contrato; salida — la suite de contrato del puerto contra la tecnología real. La lógica que un adaptador NO tiene es exactamente la que no hay que probarle.

---

## Impacto sobre la implementación
Los adaptadores son la única zona que conoce tecnologías; su delgadez mantiene todo lo demás portable y hace que cambiar de canal o proveedor sea un evento local.

## ETS relacionados
ETS-011 (07, 10, 11, 26) · ETS-008 (sobres, códigos, generación) · ETS-012 (08 puertos, 02 recepción de comandos).

## Riesgos
- "Lógica pequeñita" acumulándose en adaptadores hasta volverlos un segundo dominio → regla 1 con revisión estricta; el checklist de PR lo pregunta explícitamente.
- Tipos generados editados a mano → regeneración obligatoria en CI; el diff manual falla el build.

## Decisiones habilitadas
Canales nuevos sin tocar el núcleo, proveedores intercambiables, generación de fronteras desde el catálogo.

## Decisiones bloqueadas
Frameworks concretos de canal y clientes de tecnología — la decisión de stack posterior; este documento la sobrevive.
