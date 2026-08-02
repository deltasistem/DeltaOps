# 06_POLICIES_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Policies: preguntas estables, respuestas configurables.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. La forma de la Policy

Una Policy (ETS-011/05) se implementa en dos mitades que nunca se mezclan:

```
LA PREGUNTA (código, estable):        "¿puede cerrarse esta orden sin evidencia?"
  - firma fija: hechos + configuración resuelta → veredicto con causa
LA RESPUESTA (configuración, variable): lo que cada tenant/nodo configuró (ETS-005)
  - versionada, resuelta por cascada, congelada en el comando
```

El implementador escribe preguntas. Las respuestas jamás se escriben en código.

## 2. Reglas de implementación

1. **Deny-by-default materializado**: si la configuración que la Policy necesita no existe o no resuelve, el veredicto es negativo con código de catálogo específico (configuración faltante) — nunca un valor por defecto inventado en código (regla de oro 5).
2. **Veredicto con causa explicable**: toda Policy devuelve el porqué en términos de la configuración aplicada (qué clave, qué versión, qué valor) — insumo directo de la explicabilidad (ETS-011/15 §procedencia).
3. **Sin cadenas de Policies** (ETS-011/05): una Policy no invoca otra; si el veredicto depende de dos preguntas, el caso de uso las compone y la composición es visible.
4. **La frontera con el motor de reglas es nítida**: bloquear un comando = Policy (síncrona, dentro del pipeline); reaccionar a un hecho = regla del motor de reglas (asíncrona, consumidor). El implementador que duda consulta esa frontera, no la improvisa.
5. **Pregunta nueva = gobierno**: agregar una Policy es agregar variabilidad al producto — pasa por el proceso de configuración (ETS-005): definición de clave, valores admisibles, valor por defecto de plataforma, migración. Jamás aparece una Policy sin su clave registrada.
6. **Misma pureza que los motores**: la Policy recibe hechos + configuración resuelta; cero puertos, cero estado, determinista. Comparte plantilla de prueba (tabla de casos × configuraciones).
7. **La Policy no muta el comando**: veredicto y causa, nada más; no "corrige" datos, no completa valores, no transforma la entrada.

## 3. Prueba obligatoria

Matriz de configuración obligatoria (ETS-011/25): cada Policy se prueba contra el espectro de respuestas admisibles de su clave — incluidas la ausencia de configuración (deny-by-default) y las combinaciones límite entre niveles de cascada. La matriz vive junto a la definición de la clave y se actualiza con ella.

---

## Impacto sobre la implementación
Las Policies vuelven código estable un producto variable: los tenants cambian comportamiento sin despliegues, y el implementador nunca escribe un condicional por tenant.

## ETS relacionados
ETS-005 (plataforma de configuración) · ETS-011 (05, 13 capa 3, 15 resolución) · ETS-012 (05 motores, 16 configuración).

## Riesgos
- `si tenant == X` disfrazado (por nombre, por grupo, por flag exótico) → cualquier condicional por identidad de tenant es rechazo automático de PR.
- Policies acumulando lógica que es invariante del negocio → si nunca varía por tenant, no es Policy: es dominio (regla del motor o del agregado).

## Decisiones habilitadas
Variabilidad por configuración sin despliegue, explicabilidad de decisiones, matrices de prueba por clave.

## Decisiones bloqueadas
Formato físico de definiciones de configuración — normado por ETS-005/010; el stack se decide después.
