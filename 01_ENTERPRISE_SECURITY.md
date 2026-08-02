# 01 — Concepto de Enterprise Security

> **DeltaOps — ESI-007 · v1.0** · Qué significa seguridad empresarial en DeltaOps: un modelo transversal, declarativo y demostrable — no una capa añadida al final.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Definición

La seguridad de DeltaOps es la **propiedad emergente demostrable** de que solo las identidades correctas acceden a los datos correctos, en el tenant correcto, con rastro completo. No es una capa: las series congeladas ya distribuyeron las murallas (RLS "dos murallas" ESI-003/09, permisos ESI-005/16, patrones de autorización del estrato ESI-006/19). Esta serie las **unifica en un modelo de gobierno**: nombra las piezas, fija los estándares que faltaban (identidad, sesiones, secretos, cumplimiento) y define cómo se demuestra.

| Plano | Qué protege | Norma de origen |
|---|---|---|
| Identidad y acceso | Quién es quién y qué puede hacer | Docs 02-08 de esta serie |
| Superficie técnica | API, cuentas de servicio, secretos | Docs 09-12 |
| Evidencia y gobierno | Auditoría, cumplimiento, privacidad, clasificación | Docs 13-16 |
| Postura y madurez | Zero trust, registro, riesgo, score, madurez | Docs 17-21 |

## 2. Principios rectores

1. **Declarativo y verificable**: toda regla de seguridad vive en declaraciones validables por la puerta (ESI-002/17); la seguridad no declarada no existe y la declarada se verifica mecánicamente donde sea posible.
2. **Denegación por defecto**: lo no autorizado explícitamente está prohibido — en permisos, API, cuentas de servicio y datos.
3. **Defensa en profundidad ya construida**: las dos murallas (aplicación + RLS) son el patrón; ninguna pieza nueva puede depender de una sola muralla.
4. **La evidencia es parte del diseño**: cada componente declara clasificación, riesgo, permisos, auditoría, retención y **evidencias** (los seis rubros de esta serie) — la auditoría externa se atiende con material que ya existe, no con arqueología.
5. **Seguridad económica**: los controles se dimensionan por riesgo (doc 19); el rigor máximo se reserva para lo crítico — el control uniforme e indiscriminado es el que se ignora.

## 3. Los seis rubros de declaración

Todo componente del sistema (módulo, servicio compartido, pieza de plataforma) declara: **nivel de clasificación** de sus datos (doc 16), **riesgo** (doc 19), **permisos** (docs 04, 07), **auditoría** (doc 13), **retención** (docs 15-16) y **evidencias** que produce (docs 14, 18). Los rubros entran a los registros existentes (ESI-005/04, ESI-006/21) como secciones nuevas — sin registros paralelos.

## Impacto sobre la implementación

Ninguna muralla nueva: un modelo de gobierno sobre las existentes + los estándares faltantes (identidad, sesiones, secretos) que las series siguientes de esta serie fijan; los seis rubros amplían las declaraciones vigentes.

## Dependencias

ETS-009 (gobierno de datos); ESI-002/17; ESI-003/09-12; ESI-005/15-17; ESI-006/19-21; ENGINEERING_CHARTER.

## Riesgos

- La seguridad como serie "aparte" que nadie integra a su trabajo diario; mitigación: los rubros viven en los registros y puertas existentes — el flujo normal los exige, no un comité.

## Decisiones habilitadas

- Vender a clientes empresariales con postura demostrable (doc 27).
- Priorizar inversión de seguridad por riesgo, no por moda.

## Decisiones bloqueadas

- Prohibidos componentes sin los seis rubros declarados.
- Prohibidas piezas que dependan de una sola muralla.
- Prohibidos registros de seguridad paralelos a los existentes.

## Reusable Pattern

Los seis rubros de declaración sobre los registros existentes + verificación por puerta: el mecanismo por el que la seguridad escala con el sistema sin equipo dedicado por módulo.

## Anti-Patterns

- La "revisión de seguridad" como evento anual desconectado del flujo.
- Controles uniformes máximos que el equipo aprende a rodear.
- Seguridad por oscuridad (reglas no declaradas "para que no las conozcan").

## Knowledge Graph

- **ETS que consume**: ETS-009 (gobierno), ETS-010 (calidad exigible).
- **ESI que consume**: ESI-002/17; ESI-003/09-12; ESI-005/15-17; ESI-006/19-21.
- **DGP que originará**: las secciones de seguridad de todo DGP (doc 25); el DGP de identidad y gobierno.
- **ADR relacionados**: catálogo consolidado en doc 26.
- **Módulos que reutilizarán este patrón**: todos declaran los seis rubros; ninguno implementa seguridad propia.
