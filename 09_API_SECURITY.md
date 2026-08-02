# 09 — API Security

> **DeltaOps — ESI-007 · v1.0** · La seguridad de la superficie de API: una sola puerta, contratos autenticados siempre, límites y disciplina de exposición.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

Toda la superficie programática (clientes propios, API pública de contratos ETS-008, webhooks, integraciones) pasa por la puerta única del Kernel (ESI-003/10) y hereda el pipeline completo. Este documento fija las normas de la superficie:

| Superficie | Sujeto | Norma |
|---|---|---|
| Clientes propios (web/móvil) | Sesión de usuario (doc 05) | Pipeline completo; el cliente es no confiable por definición (doc 17) |
| API pública de contratos | Cuenta de servicio del tenant (doc 10) | Solo contratos publicados (ETS-008); versionado N/N-1; nunca endpoints internos |
| Webhooks salientes | El tenant receptor verifica autenticidad | Firma de plataforma sobre el sobre del evento; reintentos con la disciplina de bandejas |
| Integraciones registradas | Cuenta de servicio + registro (ESI-006/14) | El chasis exige registro; credenciales por doc 11 |

## 2. Reglas

1. **Nada anónimo**: toda petición porta identidad (sesión o cuenta de servicio); los recursos "públicos" no existen en v1 — lo que parezca público (página de estado) vive fuera de la superficie de producto.
2. **Validación en frontera como muralla** (ESI-003/10): esquema, tipos, tamaños y límites en la puerta; los errores son canónicos y no revelan interiores (sin trazas, sin versiones, sin nombres internos).
3. **Límites de tasa por identidad y tenant**: declarados, con respuesta canónica de límite excedido; protegen el estrato compartido (ESI-006/20 §2.2) y son la primera defensa ante credenciales robadas (patrón anómalo → doc 13).
4. **Exposición mínima**: solo lo declarado en catálogos de contratos existe públicamente; los contratos internos (módulo↔servicio) no son alcanzables desde fuera; la puerta valida la correspondencia declaración↔exposición.
5. **Transporte cifrado siempre**, versiones de protocolo por estándar vigente de plataforma; sin excepciones "temporales".
6. **Los contratos de error preservan la no-fuga** (doc 04 §2.2) también en API: inexistencia vs. denegación se mantiene ante sistemas.

## 3. Declaración (los seis rubros)

- **Clasificación**: la configuración de la superficie = interno (I); las bitácoras de acceso contienen datos personales (P).
- **Riesgo**: crítico (R1) — es la piel del sistema.
- **Permisos**: la superficie no añade permisos; hereda los del sujeto; su administración es de plataforma.
- **Auditoría**: bitácora de acceso completa en frontera (identidad, recurso, resultado, origen); denegaciones y límites como eventos de seguridad.
- **Retención**: bitácoras por el plazo de eventos de seguridad (doc 13).
- **Evidencias**: inventario de superficie expuesta derivado de catálogos, informe de límites y anomalías.

## Impacto sobre la implementación

Consolidación sobre la puerta existente: límites de tasa, firma de webhooks y validación de exposición entran al DGP de plataforma de seguridad (doc 25).

## Dependencias

ESI-003/10; ETS-008; ESI-006/14 y /20; docs 05, 10-11, 13, 17.

## Riesgos

- Deriva de exposición (endpoints internos alcanzables por descuido); mitigación: la validación §2.4 es mecánica en la puerta de calidad — lo no catalogado no se publica, lo publicado se compara contra catálogo.

## Decisiones habilitadas

- API pública vendible con postura documentada (límites, firmas, no-fuga).
- Webhooks verificables por los sistemas del cliente.

## Decisiones bloqueadas

- Prohibidas peticiones anónimas a la superficie de producto.
- Prohibida exposición de contratos internos.
- Prohibidos errores que revelen interiores del sistema.

## Reusable Pattern

Puerta única + sujeto siempre + exposición por catálogo + límites declarados: la disciplina de superficie para todo canal presente y futuro.

## Anti-Patterns

- El endpoint de depuración "temporal" en producción.
- Límites de tasa sin respuesta canónica (timeouts misteriosos).
- Confiar en la ofuscación del cliente móvil como control.

## Knowledge Graph

- **ETS que consume**: ETS-008 (catálogos de contratos), ETS-011 (fronteras).
- **ESI que consume**: ESI-003/10; ESI-006/14 y /20.
- **DGP que originará**: superficie y límites en el DGP de plataforma de seguridad.
- **ADR relacionados**: ADR de exposición por catálogo (doc 26); ADR de firma de webhooks.
- **Módulos que reutilizarán este patrón**: todos publican contratos por los catálogos; ninguno abre superficie propia.
