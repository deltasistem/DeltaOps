# 24 — Checklist de Implementación de un Servicio Compartido

> **DeltaOps — ESI-006 · v1.0** · Los criterios de aceptación verificables que todo servicio compartido cumple antes de entrar al catálogo operativo.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Naturaleza

Análogo al checklist de módulos (ESI-004/25, ESI-005/25): criterios de aceptación **verificables**, mecánicos donde sea posible, aplicados por la puerta y la revisión. Se organiza en criterios CS-01…CS-10 (Criterio de Servicio):

## 2. Los criterios

| # | Criterio | Verificación |
|---|---|---|
| **CS-01** | **Admisión**: cumple el criterio del estrato (doc 01 §3) con ≥2 consumidores previstos comprometidos en el portafolio | Revisión de arquitectura; celda(s) en la matriz (doc 22) |
| **CS-02** | **Ficha completa**: los siete rubros publicados en el catálogo y el registro (docs 02, 21) | Validación de puerta contra la declaración |
| **CS-03** | **Neutralidad**: cero referencias a módulos concretos; consumo solo por marcas/declaraciones (doc 18) | Inspección mecánica de dependencias + revisión |
| **CS-04** | **Autorización por patrón**: cada contrato declara propio/derivado/doble llave (doc 19); sin acceso privilegiado a datos de negocio | Declaración + batería de autorización |
| **CS-05** | **Aislamiento extendido**: batería multi-tenant sobre datos del servicio (archivos, índices, bandejas de avisos) en verde, incluida la no-fuga de existencia | Batería CA-05 extendida (ESI-004/25) |
| **CS-06** | **Protección del estrato**: cuotas y presupuestos declarados y demostrados (denegación explícita al límite) | Juegos de límite en pruebas |
| **CS-07** | **Degradación limpia**: apagado/deshabilitación del servicio deja a los módulos operando según lo definido por ficha (doc 17 §2.3); dependencias externas caídas fallan explícito | Juegos de fallo |
| **CS-08** | **Reconstruibilidad**: proyecciones e índices del servicio se regeneran con verificación de divergencia (ESI-004/15) | Ensayo de reconstrucción |
| **CS-09** | **Operabilidad**: telemetría, KPIs propios, bandejas con dueño, runbook — el servicio es diagnosticable sin su autor | Revisión operativa (ESI-004/19-20) |
| **CS-10** | **Documentación y expediente**: docs por audiencia + decisiones registradas (ESI-005/21), incluida la sección de marcas/contratos para módulos consumidores | Puerta documental |

## 3. Reglas de aplicación

1. **CS-01 se verifica antes de construir** (es la admisión); CS-02…CS-10 se verifican para declarar M1 (doc 23), con CS-05/06/07 re-verificados en M2/M3.
2. **Sin excepciones silenciosas**: waivers con dueño y fecha, visibles en el registro (mismo régimen que ESI-002/17).
3. **El checklist es del servicio; cada consumidor nuevo re-dispara CS-05 y CS-07** sobre las rutas nuevas (consumidor nuevo = superficie nueva).

## Impacto sobre la implementación

Los DGP-servicio incluyen este checklist como definición de terminado; la puerta amplía sus validaciones para CS-02/03/04 mecánicos.

## Dependencias

ESI-004/25; ESI-005/25; ESI-002/17; docs 01-02, 17-23.

## Riesgos

- Checklist tratado como burocracia final en vez de guía de construcción; mitigación: los DGP lo secuencian como criterios por fase, no como auditoría de cierre.

## Decisiones habilitadas

- "Terminado" objetivo y uniforme para todo servicio del catálogo.
- Re-verificación proporcional al crecer consumidores (§3.3).

## Decisiones bloqueadas

- Prohibido operar servicios sin CS-02…CS-10 en verde o waiver visible.
- Prohibido construir sin CS-01 aprobado.
- Prohibidas verificaciones manuales donde exista la mecánica.

## Reusable Pattern

CS-01…CS-10 con verificación declarada por criterio: el molde de aceptación de todo servicio, presente y futuro; los DGP solo añaden criterios específicos.

## Anti-Patterns

- Waivers permanentes que institucionalizan el incumplimiento.
- Baterías en verde sobre datos triviales (seed simétrico, un tenant).
- Saltarse CS-03 "porque este servicio es especial".

## Knowledge Graph

- **ETS que consume**: ETS-009/010 (seguridad y calidad exigibles).
- **ESI que consume**: ESI-002/17; ESI-004/15, /19-20, /25; ESI-005/21 y /25.
- **DGP que originará**: la definición de terminado de cada DGP-servicio.
- **ADR relacionados**: ADR de waivers visibles (ESI-002/17).
- **Módulos que reutilizarán este patrón**: los consumidores se benefician de CS-05/07 re-disparados; su propio checklist sigue siendo ESI-005/25.
