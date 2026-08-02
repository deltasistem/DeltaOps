# 11 — Domain Service de Referencia

> **DeltaOps — ESI-004 · v1.0** · El servicio de dominio: lógica de negocio pura que no pertenece a un solo agregado.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El servicio del módulo

| Atributo | Valor |
|---|---|
| Nombre | Asignador de Códigos de Referencia |
| Responsabilidad | Decidir el código natural del siguiente elemento según el patrón del dominio y la última secuencia usada del tenant |
| Por qué es servicio y no método del agregado | La regla involucra información externa al elemento (la secuencia del tenant) pero sigue siendo una decisión de negocio pura — no cabe en el agregado ni en el caso de uso |
| Pureza | Determinista: recibe la secuencia actual y devuelve el código; no lee BD, no genera aleatoriedad, no consulta el reloj por su cuenta |

## 2. Qué demuestra

1. **Cuándo existe un servicio de dominio**: solo cuando una decisión de negocio cruza agregados o requiere datos que ningún agregado posee, y aun así debe ser pura. Es la pieza **más rara** del sistema, y el ejemplar lo dice explícitamente: la mayoría de los módulos reales no necesitarán ninguno.
2. **La diferencia con el caso de uso**: el servicio decide (negocio), el caso de uso orquesta (carga la secuencia, invoca al servicio, persiste el resultado).
3. **La diferencia con la Policy**: la Policy es una regla parametrizable por tenant vía configuración (doc 09); el servicio es una regla fija del producto. Parametrizable → Policy; fija y multi-dato → servicio; propia de un agregado → agregado.
4. **Probabilidad pura**: sus pruebas son unitarias de tabla (entrada → salida), sin fakes siquiera.

## 3. Reglas normativas

1. Un servicio de dominio **no tiene dependencias inyectadas de infraestructura**: solo recibe valores y devuelve valores. Si necesita un puerto, no es un servicio de dominio.
2. Se nombra por la decisión de negocio, en español, como sustantivo de agente ("Asignador de…"), no "manager"/"handler".
3. Vive en `dominio/` (doc 02) y cuenta como dominio a todos los efectos de frontera.
4. **La carga de justificación es alta**: todo servicio de dominio nuevo en un DGP debe justificar por qué la lógica no cabe en un agregado ni es una Policy. La opción por defecto es no tenerlo.

## Impacto sobre la implementación

Cierra la taxonomía de piezas de decisión (agregado / Policy / servicio de dominio) que los DGP usan para ubicar cada regla. El generador no produce servicios por defecto: se añaden deliberadamente.

## Dependencias

Docs 09, 10; ETS-003 (modelo de dominio), ETS-011 (pureza del dominio).

## Riesgos

- Proliferación de "servicios" como excusa para dominio anémico; mitigación: regla 4 (justificación obligatoria) y la taxonomía §2.3 en el checklist de revisión.

## Decisiones habilitadas

- Criterio cerrado para ubicar cualquier regla de negocio futura.
- Pruebas de tabla como estándar para decisiones puras.

## Decisiones bloqueadas

- Prohibidos servicios de dominio con puertos o IO.
- Prohibidos nombres genéricos (manager, handler, helper).
- Prohibido crear servicios sin justificar por qué no es agregado ni Policy.

## Reusable Pattern

Los DGP futuros reutilizan la taxonomía de decisión §2.3 (agregado / Policy / servicio) como árbol de decisión normativo, y el formulario §1 para los raros casos que ameriten un servicio.

## Anti-Patterns

- `XxxService` como bolsa de procedimientos sobre datos anémicos.
- Servicios de dominio que llaman repositorios "solo esta vez".
- Convertir en servicio lo que es un método natural del agregado por pereza de modelarlo.
