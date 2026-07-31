# 25_TESTING_STRATEGY.md

> **DeltaOps — ETS-011 · v1.0** · Estrategia de testing del Core: qué se prueba, dónde y con qué severidad.
> Documento de diseño. Sin código.

---

## 1. La pirámide del Core

| Nivel | Prueba | Contra qué | Volumen |
|---|---|---|---|
| **Dominio** | Agregados, motores (04), policies (05): toda regla de negocio, todo invariante, toda transición | Pura memoria — sin fakes siquiera: el dominio no tiene puertos (R2) | El más alto: aquí vive el negocio |
| **Caso de uso** | Secuencia completa del pipeline con fakes de todos los puertos: idempotencia, autorización, validación, UoW, eventos emitidos | Fakes en memoria (06 §3.5) | Alto: un juego por comando/consulta |
| **Contrato de puerto** | La MISMA suite corre contra el fake y contra el adaptador real — el fake honesto por definición (07 §2.5) | Fake + real (BD efímera, objetos efímeros) | Uno por puerto |
| **Módulo (integración)** | El módulo entero con adaptadores reales: comando → BD real → outbox → consumidor → proyección | Infraestructura efímera | Selectivo: flujos críticos |
| **Sistema (e2e)** | Contra la API pública, escenarios de negocio multi-módulo (compra→recepción→stock), incluida sincronización móvil | Despliegue completo de prueba | El más bajo: escenarios U-criterio |

## 2. Suites obligatorias transversales

1. **Matriz de autorización**: actor × operación × alcance, generada de los metadatos de casos de uso (03 §3.6) — toda operación con sus casos permitido/denegado/fuera-de-alcance.
2. **Matriz de configuración**: cada Policy (05) probada con configuración presente, ausente (deniega por defecto, 05 §3.4) y en versiones distintas (congelación 15).
3. **Idempotencia**: todo comando reejecutado con la misma clave devuelve el resultado original sin duplicar nada — suite generada, no artesanal.
4. **Aislamiento de tenant**: pruebas de fuga cross-tenant contra RLS y contra el alcance del Core (dos murallas, dos suites — ETS-010/01).
5. **Consumidores**: todo consumidor recibe eventos duplicados y desordenados entre agregados y produce el mismo derivado (10 §2.1).
6. **Contratos de API**: las respuestas contra los esquemas ETS-008 (generadas del contrato); N-1 sigue pasando tras cambios (ETS-008/17).

## 3. Reglas normativas

1. **Ninguna prueba de negocio exige infraestructura** (01 §3.6): si la exige, la Regla de Dependencia está rota — la prueba es el detector.
2. **El determinismo es del diseño**: reloj e identidad son puertos (06); las pruebas los fijan — sin esperas, sin azar, sin fechas del sistema.
3. **Los datos de prueba hablan el idioma del dominio**: constructores de escenarios por módulo ("una OT abierta con dos repuestos reservados"), reutilizados por todos los niveles.
4. **Cobertura con criterio**: el dominio aspira a exhaustiva; los adaptadores se cubren por las suites de contrato; nadie persigue porcentajes en código de cableado (arranque).
5. **Las pruebas de rendimiento** validan presupuestos (ETS-004/11) con volúmenes de año cinco en rutas críticas antes de liberar (ETS-010/20) — parte de la definición de terminado de cada catálogo.

---

## Impacto sobre la implementación
El esqueleto de pruebas (fakes, suites de contrato, matrices generadas, constructores de escenarios) se construye con la plataforma, antes que los módulos; ningún módulo se declara terminado sin sus cinco niveles.

## ETS relacionados
ETS-008 (18 checklist, 17 N/N-1) · ETS-010 (01 RLS, 18 idempotencia) · ETS-004 (11 presupuestos) · ETS-011 (03-07, 23).

## Riesgos
- Fakes que divergen del real con el tiempo → suite de contrato compartida obligatoria; el fake que no la pasa no se usa.
- Matrices generadas que nadie revisa cuando fallan → las matrices son bloqueantes en CI; un fallo es un defecto, no un ruido.

## Decisiones habilitadas
Esqueleto de pruebas de plataforma, generación de matrices desde metadatos, infraestructura efímera de CI.

## Decisiones bloqueadas
Frameworks de prueba concretos y la infraestructura de CI — implementación.
