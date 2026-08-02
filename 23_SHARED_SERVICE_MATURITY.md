# 23 — Shared Service Maturity

> **DeltaOps — ESI-006 · v1.0** · La escala de madurez de servicios compartidos: M0–M4 adaptada al estrato, con criterios verificables.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La escala

Reutiliza la estructura M0–M4 de módulos (ESI-005/23) con criterios propios del estrato — un servicio compartido madura cuando más consumidores dependen de él con garantías:

| Nivel | Nombre | Criterios verificables (acumulativos) |
|---|---|---|
| **M0** | Diseñado | Ficha aprobada en el catálogo (doc 02); declaración borrador; sin consumidores |
| **M1** | Operable con un consumidor | Registrado (doc 21) y validado por la puerta; los siete rubros publicados; **un** módulo consumidor real en producción; bandeja/errores/telemetría operando |
| **M2** | Compartido de verdad | **Dos o más** consumidores en producción por declaración (marcas/plantillas/definiciones); batería de aislamiento del estrato (doc 19 §3.5) en verde; cuotas de protección activas (doc 20 §2.2) |
| **M3** | Confiable a escala | Presupuestos de rendimiento cumplidos bajo carga multi-consumidor; degradación limpia demostrada (juegos de fallo: canal caído, proveedor caído, cuota agotada); reconstruibilidad probada donde aplica (índices, proyecciones); runbook operativo completo |
| **M4** | Plataforma consolidada | Ciclo N/N-1 recorrido al menos una vez sin romper consumidores; matriz observada estable (doc 22); KPIs propios usados en decisiones de gobierno; sin anti-patrones abiertos en revisiones |

## 2. Reglas

1. **La madurez es del servicio, no del catálogo**: cada servicio porta su nivel en el registro; el estrato es tan maduro como su servicio menos maduro **de los consumidos en producción**.
2. **M2 es la barrera de identidad**: un servicio con un solo consumidor perpetuo es funcionalidad de módulo mal ubicada — la revisión de M1→M2 estancada (dos ciclos de portafolio) dispara la decisión de devolución al módulo (proceso ESI-002/27).
3. **Los criterios se evalúan con evidencia mecánica** donde exista (puerta, telemetría, baterías), como en ESI-005/24; el juicio humano completa, no sustituye.
4. **La madurez condiciona el portafolio**: un módulo nuevo no puede depender duro (doc 17 §2.2) de un servicio bajo M1; las dependencias blandas se permiten con degradación definida.

## Impacto sobre la implementación

El atributo de madurez y sus evidencias entran al registro (doc 21); las evaluaciones se calendarizan con las revisiones del portafolio.

## Dependencias

ESI-005/23-24; ESI-002/17 y /27; docs 19-22.

## Riesgos

- Inflación de niveles por presión de portafolio ("declaremos M3 para desbloquear el módulo"); mitigación: criterios mecánicos §2.3 y la regla §2.4 formulada sobre evidencia, no sobre declaración.

## Decisiones habilitadas

- Dependencias módulo→servicio decididas con un semáforo objetivo.
- Detección de "falsos compartidos" (M2 estancado) con salida definida.

## Decisiones bloqueadas

- Prohibidas dependencias duras sobre servicios bajo M1.
- Prohibido declarar niveles sin las evidencias acumulativas.
- Prohibido mantener indefinidamente servicios de consumidor único.

## Reusable Pattern

Escala M0–M4 con barrera de identidad en M2 y evidencia mecánica: el instrumento de gobierno de todo el estrato, revisable por ciclo de portafolio.

## Anti-Patterns

- Madurez evaluada una vez y nunca revisada.
- Saltos de nivel (M1→M3) sin recorrer criterios intermedios.
- Usar la madurez como métrica de equipo en vez de instrumento de riesgo.

## Knowledge Graph

- **ETS que consume**: ETS-012 (expectativas operativas).
- **ESI que consume**: ESI-002/17 y /27; ESI-005/23-24.
- **DGP que originará**: la sección de madurez objetivo en cada DGP-servicio; el calendario de evaluación en el DGP de plataforma.
- **ADR relacionados**: ADR de barrera de identidad M2 (§2.2).
- **Módulos que reutilizarán este patrón**: todos deciden sus dependencias con el semáforo; la escala de módulos (ESI-005/23) corre en paralelo.
