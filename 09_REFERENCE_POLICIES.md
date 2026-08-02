# 09 — Policies de Referencia

> **DeltaOps — ESI-004 · v1.0** · La Policy canónica: una regla de negocio parametrizable por tenant, evaluada en el dominio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La Policy del módulo

| Atributo | Valor |
|---|---|
| Nombre | Límite de Elementos Activos |
| Pregunta que responde | ¿Puede este tenant activar un elemento más, dado cuántos tiene activos? |
| Parámetro por tenant | Número máximo de elementos activos (entero positivo o "sin límite") |
| Gobierno | Plataforma de configuración ETS-005: el parámetro lo administra el negocio, con valores en el seed distintos por tenant (A: 5, B: sin límite) |
| Contrato | Definido en el dominio del módulo sobre la base de Policy del Kernel (ETS-005/011) |
| Evaluación | Dentro del caso de uso, con datos ya cargados, antes de ordenar la transición (doc 07) |

## 2. Qué demuestra

1. **Regla parametrizable sin código por tenant**: el mismo binario sirve límites distintos; cambiar el parámetro es configuración (ETS-005), no despliegue.
2. **La Policy no es un permiso**: el actor puede tener el permiso de activar y aun así recibir la denegación de negocio por límite — cuarta denegación distinguible, con su error canónico propio (se suma a las tres del doc 05).
3. **La Policy es determinista y pura**: recibe los datos que necesita (cuántos activos hay, cuál es el límite); no lee la BD ni conoce repositorios. Quien carga es el caso de uso (doc 10).
4. **Valores límite probados**: en el límite exacto, justo debajo, sin límite, y parámetro ausente — que **falla cerrado** con error de configuración, jamás asume "sin límite" (ESI-003/07 regla 5, misma filosofía).

## 3. Reglas normativas

1. Toda Policy declara su **valor por defecto de producto** en el catálogo ETS-005; "parámetro ausente" solo puede ocurrir por corrupción de configuración y por eso es error, no default silencioso.
2. Las Policies se nombran por la regla, no por el mecanismo ("Límite de Elementos Activos", no "validador de cuota").
3. Una Policy pertenece a un módulo; las reglas transversales a módulos no existen — serían señal de fronteras mal trazadas (ETS-002/003).

## Impacto sobre la implementación

Instancia canónica de la plantilla T04 (ESI-002/18). El DGP de todo módulo con reglas parametrizables sigue este formulario y estas pruebas.

## Dependencias

Docs 05, 07, 10; ETS-005 (plataforma de configuración), ETS-011 (contrato base); ESI-002/12 (seed con parámetros distintos).

## Riesgos

- Policies usadas como cajón para lógica que pertenece al agregado; mitigación: la Policy solo responde su pregunta parametrizada; las invariantes universales (no activar ARCHIVADO) viven en el agregado — la frontera queda demostrada aquí.

## Decisiones habilitadas

- Plantilla T04 con formulario, defaults y pruebas de valores límite.
- Cuarta familia de denegación estandarizada para la UI.

## Decisiones bloqueadas

- Prohibido que una Policy lea la base de datos.
- Prohibido el default silencioso ante parámetro ausente.
- Prohibidas Policies compartidas entre módulos.

## Reusable Pattern

Los DGP futuros copian: el formulario §1, la separación invariante-universal (agregado) vs regla-parametrizable (Policy), y la batería de pruebas de valores límite §2.4 como obligatoria para toda Policy.

## Anti-Patterns

- Reglas de tenant hardcodeadas con condicionales por identificador de tenant.
- Policies que orquestan (cargan datos, llaman puertos).
- Parámetros de Policy leídos de variables de entorno (violaría la prueba ácida de ESI-002/07).
