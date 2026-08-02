# 04_APPLICATION_SERVICES_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Application Services: orquestar sin decidir, con forma idéntica.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. La plantilla única del caso de uso

Todo Application Service (caso de uso, ETS-011/03) tiene exactamente esta anatomía:

```
DECLARACIÓN (metadatos, leídos por la plataforma):
  - operación del catálogo que implementa
  - permiso requerido
  - claves de configuración que consume
  - eventos que puede producir
  - errores del catálogo que puede devolver

CUERPO (lo único que se escribe a mano):
  1. Cargar     el/los datos necesarios por puertos (repositorio, resolutor ya resuelto)
  2. Decidir    delegar TODO juicio a agregado / motor / Policy
  3. Recoger    el Resultado y los eventos que el dominio produjo
  4. Entregar   al Unit of Work (la plataforma lo invoca; el caso de uso solo declara qué persistir)
```

## 2. Reglas de implementación

1. **Un caso de uso por operación del catálogo** — correspondencia 1:1 verificable; ni casos de uso "utilitarios" compartidos ni operaciones sin caso de uso.
2. **El caso de uso no contiene un solo `si` de negocio**: todo condicional que exprese una regla pertenece al agregado, a un motor o a una Policy. Los únicos condicionales admisibles son de orquestación (¿existe el agregado? → rechazo de catálogo).
3. **Dependencias solo por puertos, recibidas por construcción**: el caso de uso declara qué puertos necesita y los recibe; jamás los localiza, instancia ni configura (composición en `arranque/`, ETS-011/24).
4. **Sin estado propio**: el caso de uso es de una sola ejecución conceptual; nada se recuerda entre invocaciones. Todo lo que parezca "memoria del servicio" es estado del agregado o read model.
5. **La configuración llega resuelta**: el caso de uso recibe los valores ya resueltos y congelados (ETS-011/15); jamás llama al resolutor con lógica propia de cascada.
6. **El tiempo y la identidad se piden a puertos** (reloj, generador): dos ejecuciones con los mismos datos y los mismos puertos falsos producen exactamente el mismo Resultado.
7. **Corto de verdad**: un caso de uso que supera ~una pantalla de lectura está decidiendo (mover a dominio) u orquestando de más (dividir el comando). La longitud es criterio de revisión.
8. **Los internos de plataforma tienen la misma forma**: cierre de periodos, mantenimiento de derivados, procesos programados — casos de uso normales con actor sistema, mismos metadatos, mismas pruebas (ETS-011/03).

## 3. Prueba obligatoria

Cada caso de uso corre completo con todos sus puertos falsos: dado un estado inicial en memoria y un comando, se afirma el Resultado, los eventos producidos y el estado final. Sin red, sin disco, sin espera. Si no puede probarse así, la pieza está mal cortada — se corrige la pieza, no la prueba.

---

## Impacto sobre la implementación
El caso de uso es la unidad de trabajo diario del constructor; su monotonía es deliberada: leer uno es haberlos leído todos, y la revisión se concentra en el dominio.

## ETS relacionados
ETS-011 (03, 06, 08, 15, 25) · ETS-008 (catálogo 1:1) · ETS-012 (02, 05, 06).

## Riesgos
- Lógica de negocio filtrándose "solo esta vez" al caso de uso → regla 2 es causal de rechazo de PR (28).
- Casos de uso llamándose entre sí → prohibido; lo compartido es dominio o es un proceso por eventos.

## Decisiones habilitadas
Esqueletos generados desde el catálogo, métricas por operación automáticas, revisión enfocada.

## Decisiones bloqueadas
Mecanismo concreto de inyección de dependencias — se decide con el stack, respetando la regla 3.
