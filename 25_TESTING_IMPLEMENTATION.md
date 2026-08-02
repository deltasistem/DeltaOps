# 25_TESTING_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Estrategia de Testing en implementación: la pirámide de ETS-011/25 como práctica diaria.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Qué prueba escribe cada quien (resumen operativo)

| Nivel | Ejecuta con | Quién la escribe | Cuándo |
|---|---|---|---|
| Dominio | memoria pura | quien escribe el agregado/motor/Policy | con la pieza, no después |
| Caso de uso | fakes de todos los puertos | quien escribe el caso de uso | con el caso de uso |
| Contrato de puerto | fake Y real, misma suite | dueño del puerto | al definir el puerto |
| Integración de módulo | canal real + base real | quien escribe adaptadores | con el adaptador |
| E2E | sistema completo | flujos críticos U (ETS-004) | por hito, pocos y valiosos |
| Transversales | plataforma | plataforma (los módulos se registran) | los módulos solo declaran |

## 2. Reglas de implementación

1. **La prueba nace con la pieza y en su plantilla**: dominio = tabla de casos (05 §3); caso de uso = estado inicial + comando → Resultado + eventos + estado (04 §3); puerto = suite de contrato compartida (08 §3). No hay pruebas de forma libre para piezas con plantilla.
2. **Ninguna prueba de negocio toca infraestructura**: si una prueba de dominio o caso de uso necesita base de datos, red o disco, la prueba no se arregla — se arregla la pieza (regla de oro 10). La velocidad del ciclo (< segundos para todo el negocio) es un requisito, no un lujo.
3. **Determinismo obligatorio**: reloj, identidad y azar por fakes controlados; una prueba intermitente se trata como bug de máxima prioridad — se arregla o se elimina, jamás se reintenta hasta que pase.
4. **Las suites transversales son de registro, no de escritura** (ETS-011/25): matriz de autorización, matriz de configuración, idempotencia, aislamiento de tenant, consumidores (duplicado/replay/veneno), contratos de API — la plataforma las ejecuta contra toda operación/consumidor registrado. Un módulo nuevo las hereda al declararse; no puede optar por salirse.
5. **Se prueba el contrato, no la implementación**: las afirmaciones miran Resultados, eventos, estados y sobres — jamás llamadas internas espiadas ni orden de invocaciones privadas. Refactorizar sin romper pruebas es el indicador de que se probó lo correcto.
6. **Cobertura con criterio, no con porcentaje único**: dominio y motores, exhaustivos por tabla de casos; casos de uso, sus tres desenlaces; adaptadores, traducción y errores; lo generado (capa 1 de validación), una vez por generador. Perseguir el 100 % en adaptadores triviales roba tiempo del dominio, donde la exhaustividad sí paga.
7. **Los fakes son producto, no utilería**: viven junto al puerto, se versionan con él y pasan su suite de contrato en cada build (07 §regla 6); un fake divergente invalida silenciosamente miles de pruebas — por eso su suite corre primero.
8. **E2E pocos y de flujo real**: los criterios U de ETS-004 marcan los flujos que merecen E2E (crear→asignar→ejecutar→cerrar con evidencia; sincronización offline; cierre de periodo). E2E que re-prueban lo que la pirámide ya cubre se rechazan: son costo sin información.

## 3. La puerta de CI

Orden de ejecución: suites de fakes → dominio → casos de uso → verificación de dependencias (23 §regla 6) → regeneración de contratos → transversales → integración → E2E. Todo rojo bloquea el merge; no existen pruebas "conocidas como rotas" conviviendo con el build verde.

---

## Impacto sobre la implementación
Probar deja de ser una fase: es la forma de las piezas; las transversales dan a cada módulo nuevo miles de casos gratis, y el ciclo en memoria mantiene el flujo de trabajo en segundos.

## ETS relacionados
ETS-011 (25) · ETS-004 (criterios U para E2E) · ETS-012 (04-08 plantillas de prueba por pieza, 28 checklist).

## Riesgos
- Pruebas espía acopladas a internos → regla 5; se detectan porque el refactor las rompe sin romper comportamiento.
- Transversales tratadas como opcionales por lentas → su presupuesto de velocidad es requisito de plataforma; se optimiza la suite, no se apaga.

## Decisiones habilitadas
Refactor seguro, módulos nuevos con herencia de garantías, CI como única puerta de calidad.

## Decisiones bloqueadas
Framework de pruebas concreto — la primera traducción lo fija junto con las plantillas.
