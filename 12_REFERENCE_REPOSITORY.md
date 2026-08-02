# 12 — Repository de Referencia

> **DeltaOps — ESI-004 · v1.0** · El repositorio del Elemento de Referencia: contrato en el dominio, mapeo en el adaptador.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El contrato (puerto, en el módulo)

| Operación | Semántica |
|---|---|
| Obtener por identificador | Devuelve el agregado completo o "no existe" (que, cruzando tenants, es indistinguible de inexistente — ETS-009) |
| Obtener por código natural | Búsqueda por identidad de negocio, único por tenant |
| Contar activos del tenant | El dato que la Policy necesita (doc 09), como operación nombrada — no un filtro genérico |
| Guardar | Persiste el agregado con verificación de versión optimista y recolección de sus eventos |

Cuatro operaciones. **Ni una más**: cada operación existe porque un caso de uso la necesita, con nombre de negocio (ESI-003/21 regla 2).

## 2. El adaptador (implementación)

1. Construido sobre la base de repositorio de plataforma (ESI-003/21): versión optimista, recolección de eventos y fechas de registro vienen resueltas; el adaptador aporta solo el mapeo agregado ↔ tablas según ETS-010.
2. Opera dentro de la UoW activa (doc 13); no abre sesiones, no confirma, no revierte.
3. Sin filtro de tenant escrito: RLS de sesión es la muralla (ESI-003/20); la prueba de adaptador lo verifica intentando leer datos del otro tenant.
4. El fake en memoria implementa el mismo contrato — incluida la versión optimista y la unicidad del código — y pasa **la misma batería de pruebas de contrato** que el adaptador real. Un contrato, dos implementaciones, una batería.

## 3. Qué demuestra

1. **La batería de pruebas de contrato compartida**: la técnica central — si el fake y el real pasan las mismas pruebas, las pruebas con fakes del caso de uso son fiables.
2. **Operaciones nombradas frente a consultas genéricas**: "contar activos del tenant" en lugar de `contar(filtro)`.
3. **El "no existe" uniforme entre tenants**: sin fugas de existencia.

## Impacto sobre la implementación

Instancia canónica de las plantillas T05 (puerto+fake) y T06 (adaptador). La batería de contrato compartida se vuelve infraestructura de prueba de plataforma reutilizada por todos los módulos.

## Dependencias

Docs 09, 10, 13; ESI-003/20 y /21; ETS-009 (RLS, versión), ETS-010 (mapeo), ETS-011 (fakes).

## Riesgos

- Baterías de contrato que solo corren contra el fake (rápido) y nunca contra el real (lento); mitigación: la puerta de CI ejecuta ambas; el peldaño local puede correr solo fakes (ESI-002/14).

## Decisiones habilitadas

- Estándar de batería de contrato para todo puerto futuro.
- Pruebas de aislamiento de tenant a nivel adaptador como patrón.

## Decisiones bloqueadas

- Prohibidas operaciones de repositorio sin caso de uso que las demande.
- Prohibido que el adaptador gestione transacciones.
- Prohibido un fake que no pase la batería de contrato completa.

## Reusable Pattern

Los DGP futuros copian: el formulario de contrato §1 (operaciones nombradas mínimas), la estructura del adaptador §2 sobre la base de plataforma, y la técnica de batería de contrato compartida §3.1 — obligatoria para todo puerto nuevo.

## Anti-Patterns

- Repositorios con métodos "por si acaso".
- Fakes simplificados que mienten (sin versión optimista, sin unicidad).
- Filtros de tenant manuales "como refuerzo" que enmascaran errores de RLS.
