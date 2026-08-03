# 16 — Dependency Matrix

> **DeltaOps — DGP-000 · v1.0** · La matriz de dependencias del programa: las dependencias estructurales entre frentes de construcción, tipificadas y con regla de mantenimiento.
> Documento de planificación de construcción. Sin código, sin implementación.

## 1. Posición

El mapa de dependencias arquitectónico está congelado (ESI-010/05: capas y direcciones legales). Esta matriz lo proyecta sobre la **construcción**: qué frente necesita qué de cuál, para ordenar DGP dentro y entre olas. Tipos de dependencia: los de doc 07 (dura / de contrato / de capacidad).

## 2. La matriz estructural

| Frente | Depende de | Tipo | Qué necesita |
|---|---|---|---|
| Kernel (W1) | Plataforma de entrega (W0) | Dura | Flujo, puertas, entornos |
| Fundamento backend (W1) | Kernel | De contrato | Identidad, tenancy, permisos publicados |
| Chasis de experiencia (W1) | Plataforma de entrega | Dura | Solo la fábrica; paralelo al Kernel (doc 09) |
| Suelo de seguridad (W1) | Kernel | De contrato | Superficies de identidad y auditoría |
| Módulo de referencia (W2) | Toda W1 | Dura | El suelo completo ejercitable (M1) |
| Activos (W3) | Módulo de referencia | Dura | El molde validado (M2) |
| Órdenes de trabajo (W3) | Activos | De contrato | El contrato de activos publicado |
| Preventivo (W3) | Órdenes de trabajo | De contrato | Generación de órdenes contratada |
| Servicios Ola 1 (W3) | Kernel | De contrato | Paralelo a módulos con fronteras ESI-006 |
| Inventario/almacenes (W4) | Corazón W3 | De contrato + dura en operación | Contratos de consumo de repuestos; Hito B |
| Compras/proveedores (W4) | Inventario | De contrato | Reposición contratada |
| Analítica/KPIs (W5) | Corazón W3 | De contrato | Contratos de lectura estables |
| IA de producto (W5) | Analítica + servicios | De contrato | Datos y superficies bajo régimen ESI-006/13 |
| Integraciones externas (W5) | Contratos externos (ESI-010/13 §3.3) | Dura | Régimen de contrato externo operando |
| Escala (W6) | Todo lo anterior | Dura | M4/M5 demostrados |

## 3. Reglas de mantenimiento

1. **La matriz fina vive en el registro** (doc 12 §2.5): cada DGP declara sus dependencias concretas al especificarse; esta matriz estructural es el marco que esas declaraciones deben respetar — la dependencia declarada que contradice la matriz escala como conflicto de planificación.
2. **La matriz respeta el mapa congelado**: ninguna dependencia de construcción puede implicar una dirección arquitectónica ilegal (ESI-010/05 §2.3); construir "al revés por ahora" no existe.
3. **Cambios a la matriz estructural son decisión registrada** (doc 28) con recálculo del camino crítico (doc 08 §2.4).
4. **La dependencia circular es defecto de partición**: dos frentes mutuamente dependientes se re-parten o se fusionan en un DGP — el programa no planifica círculos.

## Impacto sobre la implementación

QG-1 valida las dependencias de cada DGP contra esta matriz; la cadencia ordena la cola de autorización con ella.

## Dependencias

ESI-006/13; ESI-010/05, /13; docs 04, 07-09, 12, 28.

## Riesgos

- La matriz divergiendo de la realidad conforme los DGP se especifican; mitigación: la matriz fina derivada del registro se compara contra la estructural en cadencia — la divergencia es agenda, no sorpresa.

## Decisiones habilitadas

- Orden de autorización de DGP con base estructural objetiva.
- Detección temprana de dependencias ilegales o circulares.

## Decisiones bloqueadas

- Prohibidas dependencias de construcción que violen el mapa congelado.
- Prohibidos cambios estructurales sin decisión y recálculo del camino crítico.
- Prohibida la planificación con dependencias circulares.

## Reusable Pattern

Matriz estructural normativa + matriz fina derivada del registro + validación en QG-1: las dependencias como datos gobernados en dos niveles.

## Anti-Patterns

- La dependencia descubierta en la semana de integración.
- El DGP que "resuelve" una dependencia dura con un mock permanente.
- Mantener la matriz en la cabeza del planificador.

## Knowledge Graph

- **ETS que consume**: ninguno directo.
- **ESI que consume**: ESI-010/05 (mapa congelado proyectado); ESI-006 (fronteras de servicios).
- **DGP que originará**: todos declaran dependencias dentro de este marco.
- **ADR relacionados**: ADR de matriz de dependencias en dos niveles.
- **Módulos que reutilizarán este patrón**: sus dependencias se planifican con la misma tipificación.
