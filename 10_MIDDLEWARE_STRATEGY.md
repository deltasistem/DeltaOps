# 10 — Middleware Strategy

> **DeltaOps — ESI-003 · v1.0** · El borde HTTP como cadena fija, corta y en orden normativo.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Filosofía

El middleware es el peaje del borde HTTP: lo que **toda** petición debe atravesar antes de tocar un caso de uso. Es plataforma pura: los módulos no aportan middleware, aportan casos de uso. La cadena es corta, fija por versión y su orden es normativo.

## 2. Cadena oficial (orden de entrada)

| # | Middleware | Responsabilidad | Ante fallo |
|---|---|---|---|
| 1 | **Identidad de petición** | Asignar/propagar identificador de correlación | Nunca falla |
| 2 | **Logging de acceso** | Registrar entrada/salida con duración y resultado (doc 16) | Nunca bloquea |
| 3 | **Observabilidad** | Métricas y traza de la petición (doc 17) | Degrada sin bloquear |
| 4 | **Límites defensivos** | Tamaño máximo de cuerpo, plazos de lectura | 4xx explícito |
| 5 | **Autenticación** | Verificar credencial, resolver actor y tenant (doc 11) | 401 canónico |
| 6 | **Construcción de contexto** | Armar el contexto de ejecución completo (doc 09), incl. permisos efectivos (doc 13) | 500 canónico si irresoluble |
| 7 | **Manejador de errores** | Frontera final de traducción error → respuesta (doc 15) | Es el que responde |

La verificación de **capacidad** (doc 07) y de **autorización** (doc 12) no son middleware: son verificación declarativa por caso de uso, porque dependen de qué se invoca, no de que se invoque algo.

## 3. Reglas normativas

1. **Orden congelado**: cambiar el orden de la cadena es decisión de arquitectura con ADR; nunca un ajuste local.
2. **Middleware sin negocio**: prohibida toda lógica de dominio en la cadena; el middleware no conoce módulos.
3. **Sin middleware condicional por entorno**: la cadena es idéntica en DEV y PROD (ESI-002/09); lo que varía son parámetros (doc 08).
4. **Rutas públicas mínimas y explícitas**: solo salud (doc 18) y las rutas de autenticación quedan antes del paso 5, por lista cerrada declarada en el arranque.
5. **Cada middleware hace una cosa**: prohibidos los middleware "multiusos"; si una responsabilidad nueva aparece, se diseña su lugar en esta tabla vía ADR.
6. **CORS y cabeceras de seguridad** son parte de los límites defensivos (paso 4), con valores del plano de despliegue; jamás abiertos por defecto.

## 4. Workers y mensajes

Los procesos worker no tienen cadena HTTP, pero replican el patrón con una **tubería de consumo** equivalente: correlación → logging → observabilidad → construcción de contexto → manejo de errores, alrededor de cada mensaje (docs 19 y 22). Misma semántica, distinto transporte.

## Impacto sobre la implementación

El DGP de plataforma implementa la cadena completa y la tubería de workers; los DGP de módulo no tocan middleware jamás.

## Dependencias

Docs 09, 11, 13, 15-18; ESI-001 (FastAPI en el borde); ESI-002/09.

## Riesgos

- Crecimiento silencioso de la cadena hasta degradar latencia; mitigación: presupuesto de latencia del borde medido en observabilidad y cadena cerrada por ADR.
- Rutas públicas accidentales; mitigación: lista cerrada revisada en PR y prueba automática que recorre las rutas montadas.

## Decisiones habilitadas

- Presupuestos de latencia por tramo del borde.
- Diseño uniforme de la tubería de workers espejo de la cadena HTTP.

## Decisiones bloqueadas

- Prohibido middleware aportado por módulos.
- Prohibida lógica de negocio en la cadena.
- Prohibidas rutas públicas fuera de la lista cerrada.
