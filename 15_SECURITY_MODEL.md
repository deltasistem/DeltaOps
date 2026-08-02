# 15 — Modelo de Seguridad

> **DeltaOps — ESI-005 · v1.0** · La postura de seguridad de un módulo de negocio: qué hereda de la plataforma y qué debe hacer bien él mismo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Lo que el módulo hereda (y no debe tocar)

Autenticación, sesión y actor (ESI-003/11); evaluación de capacidades y permisos (ESI-003/12); RLS de dos murallas (ESI-003/09); errores canónicos sin fuga de detalle (ESI-003/15); escaneo de dependencias y secretos en la puerta (ESI-002/13); auditoría transaccional (ESI-004/17). **El módulo no implementa seguridad: la declara y la respeta.**

## 2. Las responsabilidades propias del módulo

1. **Clasificar sus datos** (ETS-009): qué campos son sensibles (datos de salud en SST, condiciones comerciales en Compras) y con qué tratamiento — enmascarado en logs, exclusión de telemetría, permisos de lectura reforzados. La clasificación es parte de la declaración del módulo.
2. **Diseñar bien su árbol de permisos** (doc 16): la autorización fina correcta es diseño del módulo, no de la plataforma.
3. **No fugar por canales propios**: mensajes de error de dominio, eventos publicados (¿lleva la carga un dato sensible que los consumidores no necesitan?), exportaciones y adjuntos. La revisión de fugas cubre los cuatro canales.
4. **Validar entradas como frontera hostil** (ESI-004/08 nivel forma + ESI-004/27 Q-03): tamaños, formatos, cursores corruptos — sin 500 accidentales.
5. **Autorización a nivel de dato cuando el dominio la exija**: si SST restringe incidentes a su área organizacional, esa regla es una restricción de alcance declarada (doc 16 §alcances), no filtros a mano (AP-04 extendido).
6. **Superficies de integración** (doc 19) con credenciales gestionadas por la plataforma de secretos, mínimos privilegios y sin credenciales por tenant en código.

## 3. Verificación

La seguridad del módulo se verifica, no se declara: CA-04/CA-05 (ESI-004/25) instanciados, batería de robustez Q-03/Q-05 (ESI-004/27), revisión de fugas §2.3 en el checklist de revisión (doc 26), y el escaneo de la puerta en cada PR.

## Impacto sobre la implementación

Añade a cada DGP la clasificación de datos y la revisión de canales de fuga como entregables; la plataforma no cambia.

## Dependencias

ESI-003/09, /11-12 y /15; ESI-002/13; ESI-004/08, /17, /25 y /27; ETS-009; docs 16 y 19.

## Riesgos

- Falsa sensación de "la plataforma ya me asegura": las fugas reales ocurren en los canales propios §2.3; mitigación: la revisión de fugas es punto bloqueante del checklist.

## Decisiones habilitadas

- Postura de seguridad uniforme y auditable módulo a módulo.
- Clasificación de datos como insumo directo de logging/telemetría/exportes.

## Decisiones bloqueadas

- Prohibido implementar autenticación/autorización propias en módulos.
- Prohibidos datos clasificados sensibles en logs, telemetría o cargas de evento sin necesidad declarada.
- Prohibidas credenciales de integración en código o configuración no gestionada.

## Reusable Pattern

La partición herencia §1 / responsabilidades propias §2 y la tabla de clasificación de datos como formulario del DGP; los cuatro canales de fuga §2.3 como lista de revisión fija.

## Anti-Patterns

- Re-verificar permisos a mano "por seguridad extra" (AP-07: diverge y miente).
- Clasificar todo como sensible (la clasificación pierde significado).
- Seguridad por oscuridad en contratos (campos "ocultos" no documentados).

## Knowledge Graph

- **ETS que consume**: ETS-009 (clasificación y multitenancy), ETS-012 (requisitos de seguridad).
- **ESI que consume**: ESI-003/09, /11, /12, /15; ESI-002/13; ESI-004/17, /25, /27.
- **DGP que originará**: la sección "clasificación de datos y revisión de fugas" de cada DGP-módulo.
- **ADR relacionados**: ADR de dos murallas (ETS-009); ADR de errores canónicos (ESI-003/15).
- **Módulos que reutilizarán este patrón**: todos; SST (datos de salud) y Compras (datos comerciales) tienen las clasificaciones más estrictas.
