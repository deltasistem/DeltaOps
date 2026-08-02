# 19 — Modelo de Integraciones

> **DeltaOps — ESI-005 · v1.0** · Cómo un módulo de negocio se integra con sistemas externos (ERP, proveedores de telemetría, facturación) sin contaminar su dominio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Principio

Toda integración externa es un **adaptador en la frontera** (ETS-011, ESI-003/24): el dominio y la aplicación no conocen al sistema externo; conocen un puerto con lenguaje propio. Los DTOs del proveedor no viajan hacia adentro (AP de ESI-003/24).

## 2. Los cuatro patrones permitidos

| Patrón | Dirección | Mecánica |
|---|---|---|
| **Ingesta** | Externo → módulo | Lo externo entra como comandos normales (con idempotencia y fechaNegocio) a través de un adaptador de entrada; la telemetría de horómetros entra como "Registrar Lectura", no como escritura directa |
| **Publicación** | Módulo → externo | Un consumidor de integración escucha eventos publicados propios y notifica afuera, con reintentos y bandeja (ESI-003/21); el fallo externo jamás bloquea el comando de negocio |
| **Consulta saliente** | Módulo → externo, síncrona | Solo en casos de uso donde el dato externo es insumo de decisión; con presupuesto de tiempo, fallo explícito (sin fallback silencioso, AP-13) y respuesta traducida al lenguaje del dominio |
| **Exportación por lotes** | Módulo → externo | Trabajos programados (ESI-003/22) que producen archivos/lotes con corte declarado |

## 3. Reglas

1. **Toda integración se declara**: sistema, patrón, contrato, credenciales (gestionadas por plataforma, doc 15 §2.6), dueño y comportamiento ante caída. Entra en la declaración del módulo y su expediente.
2. **Idempotencia en ambas direcciones**: la ingesta desduplica por clave natural del origen; la publicación tolera reenvíos (el receptor externo se documenta como at-least-once).
3. **Lo externo es hostil**: datos malformados de la ingesta van a una bandeja de rechazos con diagnóstico visible, no a un descarte silencioso ni a un 500.
4. **Sin integraciones entre módulos disfrazadas**: este documento cubre sistemas *externos*; entre módulos DeltaOps solo hay eventos (doc 08). Un "adaptador" que llama a otro módulo es AP-05.
5. **Simulación obligatoria**: todo adaptador externo tiene su fake de contrato para desarrollo y pruebas (ETS-011); ningún nivel de prueba salvo el E2E dedicado toca el sistema real.

## Impacto sobre la implementación

El DGP entrega el inventario de integraciones (formulario §3.1) y sus fakes; la infraestructura de reintentos/bandejas ya existe en plataforma.

## Dependencias

ETS-011; ESI-003/21-22 y /24; ESI-004/14; docs 06, 08 y 15.

## Riesgos

- El sistema externo marcando el paso del dominio (modelar el dominio con la forma del ERP); mitigación: el puerto se diseña desde el lenguaje del dominio primero y se revisa contra el modelo de agregados, no contra el manual del ERP.

## Decisiones habilitadas

- Integraciones sustituibles (cambiar de proveedor de telemetría = cambiar un adaptador).
- Desarrollo y pruebas sin dependencia de sistemas de terceros.

## Decisiones bloqueadas

- Prohibidos DTOs externos en dominio o aplicación.
- Prohibido bloquear comandos de negocio por fallos de notificación externa.
- Prohibidas escrituras directas de sistemas externos a tablas del módulo.

## Reusable Pattern

Los cuatro patrones §2 como vocabulario cerrado de integración; el formulario §3.1 como sección fija del DGP donde haya integraciones.

## Anti-Patterns

- Sincronización bidireccional "espejo" con un sistema externo (dos dueños del mismo dato).
- Ingesta que salta el pipeline de comandos "por volumen" sin decisión de arquitectura.
- Credenciales de integración por tenant en tablas de negocio.

## Knowledge Graph

- **ETS que consume**: ETS-011 (puertos/adaptadores), ETS-008 (contratos), ETS-012 (sistemas del entorno).
- **ESI que consume**: ESI-003/21, /22, /24; ESI-004/14.
- **DGP que originará**: la sección "inventario de integraciones" de los DGP que las tengan; posibles DGP dedicados para integraciones mayores (ERP).
- **ADR relacionados**: ADR de anticorrupción en la frontera (ESI-003/24).
- **Módulos que reutilizarán este patrón**: Combustible (telemetría), Compras (ERP/facturación), Inventario (códigos de barras/ERP).
