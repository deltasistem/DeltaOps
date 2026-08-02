# 21_AI_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de IA: propone, jamás dispone — llevado a reglas de escritura.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. El flujo canónico (ETS-011/21)

```
1. DISPARO     evento de dominio o solicitud explícita activa una capacidad de IA
2. PREPARAR    consumidor arma el contexto (SOLO datos del tenant, clasificación respetada)
3. EVALUAR     puerto ProveedorDeIA: contexto → propuesta (versión de capacidad registrada)
4. PERSISTIR   la sugerencia como hecho: propuesta + evidencia + versión + estado pendiente
5. PRESENTAR   según Policy del tenant (mostrar, requerir revisión, no mostrar)
6. DESENLACE   aceptar/rechazar/ignorar = comando HUMANO normal; lo aceptado lleva asistido_ia
```

## 2. Reglas de implementación

1. **La IA nunca ejecuta comandos**: ninguna capacidad de IA invoca casos de uso de negocio; produce sugerencias persistidas. El único camino de una sugerencia a un efecto es un comando con actor humano (o un proceso explícitamente configurado por el tenant como auto-aprobación — que sigue siendo un comando normal, con la Policy como autorizadora y auditado como tal).
2. **El contexto se arma con lista blanca**: la preparación (paso 2) declara qué datos usa cada capacidad — campos y clasificaciones inspeccionables (ETS-006/13); nada Restringido sale hacia el puerto sin estar en la declaración. El armado jamás improvisa "todo lo que encuentre".
3. **Toda sugerencia carga su expediente**: qué capacidad, qué versión, qué evidencia (identidades de los datos usados), cuándo — persistido con la sugerencia (paso 4). "¿Por qué sugirió esto?" se responde con datos guardados, nunca re-preguntando al proveedor.
4. **El puerto es asíncrono, con presupuesto y degradación limpia** (ETS-011/21): proveedor caído o lento = no hay sugerencias nuevas, y nada más; ningún flujo de negocio espera a la IA en línea dentro de un comando.
5. **`asistido_ia` viaja hasta el final**: el comando derivado de una sugerencia aceptada lleva la marca y la identidad de la sugerencia; eventos, auditoría y métricas la conservan — la medición de valor de la IA (aceptación por capacidad, ETS-011/27) sale de ahí gratis.
6. **Las capacidades son configuración gobernada**: activación por tenant, umbral de presentación y auto-aprobación son Policies (ETS-005); una capacidad nueva pasa por registro (definición, lista blanca de datos, versión) antes de producir la primera sugerencia.
7. **Sin aprendizaje cruzado entre tenants**: el contexto es del tenant, la sugerencia es del tenant; cualquier mejora de capacidad que use datos agregados es una decisión de gobierno explícita fuera de este flujo — jamás un efecto colateral del código.

## 3. Prueba obligatoria

Con fake del proveedor: disparo → sugerencia persistida con expediente completo; proveedor caído → flujo de negocio intacto, sin sugerencia, sin error al usuario; aceptación → comando con `asistido_ia` y auditoría; lista blanca violada en preparación (dato Restringido inyectado) → falla ruidosa, no envío.

---

## Impacto sobre la implementación
La IA se integra sin privilegios: consumidores, un puerto, hechos persistidos y comandos normales — el sistema funciona idéntico con la IA apagada, y todo lo sugerido es explicable y medible.

## ETS relacionados
ETS-011 (21, 27) · ETS-005 (capacidades como configuración) · ETS-006 (13 lista blanca) · ETS-012 (08, 10).

## Riesgos
- Atajos "la IA ya lo validó, ejecutemos directo" → regla 1 es absoluta; la auto-aprobación existe solo como Policy explícita del tenant.
- Contextos crecientes sin gobierno → lista blanca declarada y revisada como parte del registro de la capacidad.

## Decisiones habilitadas
Capacidades activables por tenant, medición de aceptación, explicabilidad de sugerencias, apagado sin impacto.

## Decisiones bloqueadas
Proveedores y modelos concretos de IA — tras el puerto, decisión posterior al stack.
