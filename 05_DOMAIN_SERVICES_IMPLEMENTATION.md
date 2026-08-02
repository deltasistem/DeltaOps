# 05_DOMAIN_SERVICES_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Domain Services: los motores como funciones de decisión puras.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. La forma del motor

Todo Domain Service (motor, ETS-003 y ETS-011/04) se implementa como una **función de decisión pura con nombre de negocio**:

```
ENTRADA:  hechos relevantes (datos del agregado / evento) + configuración resuelta (valores, no puertos)
PROCESO:  la regla de negocio, en vocabulario ubicuo, determinista
SALIDA:   una decisión con nombre (Resultado o valor de dominio) — jamás un efecto
```

El motor **decide**; el caso de uso ejecuta la decisión (persistir, emitir eventos). El motor no sabe si su decisión será ejecutada.

## 2. Reglas de implementación

1. **Cero puertos, cero infraestructura**: un motor no recibe repositorios, relojes ni resolutores; recibe datos. Si "necesita consultar algo", el caso de uso se lo carga antes — esa necesidad es parte de la firma de entrada.
2. **La configuración entra como argumento, ya resuelta y congelada** (ETS-011/04 §config): el motor no conoce la cascada; conoce los valores. La misma entrada + la misma configuración = siempre la misma decisión.
3. **Sin estado entre invocaciones**: el motor es intercambiable por una tabla de decisión gigante; cualquier "memoria" que parezca necesitar es estado de un agregado.
4. **Un motor, dos envolturas** (ETS-011/04): la decisión síncrona (durante un comando) y la reacción a evento (en un consumidor) invocan la MISMA implementación; jamás dos versiones de la misma regla.
5. **El vocabulario es el del dominio** (ETS-003): entradas, salidas y nombres internos usan el lenguaje ubicuo; si un experto de mantenimiento no reconoce el nombre de la decisión, el nombre está mal.
6. **Decisiones con nombre, no booleanos crudos**: el motor devuelve `AsignaciónAprobada` / `AsignaciónRechazada(causa)` — no `true/false`; la causa viaja con la decisión y termina en el código de error o en el evento.
7. **Los motores no se llaman entre sí en cadena libre**: si una decisión necesita otra decisión, el caso de uso compone explícitamente — el grafo de decisiones es visible en la orquestación, no escondido dentro de un motor.
8. **Complejidad ciclomática alta es normal aquí y solo aquí**: el motor es el único lugar donde el negocio real (con todos sus casos) vive; se paga con la batería de pruebas más densa del sistema.

## 3. Prueba obligatoria

Cada motor tiene su tabla de casos: combinaciones de hechos × configuraciones → decisión esperada, incluyendo los bordes que el negocio dictó (ETS-003) y los que la configuración habilita (ETS-005). Ejecuta en memoria pura, en milisegundos, sin fixture de infraestructura. La tabla de casos ES la especificación viva de la regla.

---

## Impacto sobre la implementación
Los motores concentran el valor del sistema; su pureza los vuelve el activo más barato de probar y el más caro de equivocar — la revisión de dominio se concentra aquí.

## ETS relacionados
ETS-003 (catálogo de motores) · ETS-011 (04, 05 frontera con Policies, 25) · ETS-005 (configuración como entrada).

## Riesgos
- Un puerto colándose "por comodidad" a un motor → causal de rechazo; la carga de datos es del caso de uso.
- Reglas duplicadas entre envoltura síncrona y reactiva → regla 4; una sola implementación, verificada en revisión.

## Decisiones habilitadas
Tablas de decisión como pruebas, evolución de reglas con diff legible por negocio, reutilización síncrona/reactiva.

## Decisiones bloqueadas
Representación concreta (funciones, objetos-función) en el lenguaje elegido — la primera traducción la fija.
