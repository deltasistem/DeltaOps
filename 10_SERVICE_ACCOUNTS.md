# 10 — Service Accounts

> **DeltaOps — ESI-007 · v1.0** · Las cuentas de servicio: identidades no humanas con dueño, alcance mínimo y credenciales gobernadas.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Modelo

La cuenta de servicio es una identidad no humana (doc 02) para sistemas que actúan sobre DeltaOps o por los que DeltaOps actúa:

| Tipo | Ejemplo | Alcance |
|---|---|---|
| **De tenant** | El ERP del cliente consumiendo la API pública; el sistema de telemetría enviando lecturas | Un tenant, permisos mínimos por rol de servicio (doc 07), creada por el administrador del tenant |
| **De plataforma** | Los trabajos programados (ESI-003/22); los consumidores de bandejas | Contexto de sistema imputable, sin credenciales expuestas (identidad interna del Kernel) |
| **De integración** | Las credenciales con que DeltaOps llama a sistemas externos (ESI-006/14) | Registradas en el chasis; el secreto vive en la gestión del doc 11 |

## 2. Reglas

1. **Dueño humano obligatorio**: toda cuenta de servicio tiene responsable nombrado (persona del tenant o de plataforma) que responde por su existencia en las revisiones de acceso (doc 14); cuentas huérfanas se suspenden por proceso.
2. **Alcance mínimo real**: roles de servicio con solo los permisos que la integración usa (la telemetría de permisos ejercidos, doc 07 §2.6, aplica con más fuerza aún — un sistema no "explora").
3. **Sin sesiones interactivas**: las cuentas de servicio no inician sesión de usuario; portan credenciales de API (doc 12) con caducidad y rotación; jamás contraseñas humanas.
4. **Separación por propósito**: una cuenta por sistema/integración; la cuenta "comodín" que usan tres sistemas impide imputar y revocar quirúrgicamente.
5. **Comportamiento esperado declarado**: origen, volumen y horario aproximados declarables por cuenta; la desviación es señal de seguridad (doc 13) — el robo de credenciales de sistema se detecta por comportamiento, no por contraseña fallida.

## 3. Declaración (los seis rubros)

- **Clasificación**: metadatos de cuenta = interno (I); credenciales = secreto (S).
- **Riesgo**: alto (R2); las de permisos amplios, crítico (R1) y a evitar por §2.2.
- **Permisos**: `IDENTIDAD.CUENTAS_SERVICIO.ADMINISTRAR` (tenant y plataforma según tipo).
- **Auditoría**: total sobre ciclo de vida; la actividad de la cuenta sigue la bitácora de API (doc 09).
- **Retención**: como cuentas (doc 02): retiradas conservan lo imputable.
- **Evidencias**: inventario con dueños, informe de permisos ejercidos vs. concedidos, edades de credenciales.

## Impacto sobre la implementación

Parte del DGP-Identidad (tipos y ciclo) y del chasis de integraciones (las de integración ya registradas); los roles de servicio son plantillas por integración típica.

## Dependencias

Docs 02, 07, 09, 11-14; ESI-003/22; ESI-006/14.

## Riesgos

- Proliferación de cuentas creadas para pruebas y olvidadas; mitigación: dueño obligatorio + revisión periódica + suspensión por inactividad declarada (política del tenant con mínimo de plataforma).

## Decisiones habilitadas

- Integraciones de clientes con revocación quirúrgica por sistema.
- Detección de anomalías de sistemas por comportamiento declarado.

## Decisiones bloqueadas

- Prohibidas cuentas de servicio sin dueño humano.
- Prohibidas credenciales humanas en sistemas.
- Prohibida la cuenta compartida multi-sistema.

## Reusable Pattern

Identidad no humana + dueño + alcance mínimo + comportamiento declarado: el contrato de todo actor automático, interno o externo.

## Anti-Patterns

- La cuenta de servicio con rol de administrador "para que no falle".
- Credenciales de servicio en repositorios o configuración plana (doc 11 lo gobierna).
- Cuentas de prueba activas en producción.

## Knowledge Graph

- **ETS que consume**: ETS-011 (sistemas externos), ETS-012 (telemetría del entorno).
- **ESI que consume**: ESI-003/22; ESI-006/14.
- **DGP que originará**: tipos y ciclo en DGP-Identidad; plantillas de rol de servicio por DGP de integración.
- **ADR relacionados**: ADR de dueño humano obligatorio (doc 26).
- **Módulos que reutilizarán este patrón**: los que reciben integraciones (Compras, Combustible, Inventario) operan con cuentas de servicio del tenant sin gestionarlas.
