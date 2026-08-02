# 17_AUDIT_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Auditoría: no se escribe auditoría, se hereda.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Qué audita el sistema (estructural, ETS-011/17)

| Fuente | Cuándo se registra | Quién lo escribe |
|---|---|---|
| **Eventos de dominio** | en el mismo commit del UoW (outbox) | la plataforma, siempre |
| **Intentos denegados** | al cortar la etapa de autorización | el pipeline (ETS-011/14) |
| **Accesos sensibles** | al servir consultas marcadas como sensibles | el pipeline de consulta |
| **Cadena de sellos** | al despachar (hash encadenado) | el despachador (10) |

El implementador de un módulo **no escribe una línea de auditoría**. Su trabajo es producir eventos correctos y marcar en metadatos qué consultas son sensibles.

## 2. Reglas de implementación

1. **El evento ES el registro de auditoría primario**: nombre en pasado del lenguaje ubicuo, identidad del actor, fechaNegocio/fechaRegistro, versiones de configuración usadas, marca `asistido_ia` cuando aplique. Un evento pobre = auditoría pobre — la riqueza del evento es criterio de revisión de dominio.
2. **No existe el modo sin auditoría** (ETS-011/17): ninguna bandera, entorno o herramienta interna la apaga; los procesos internos de plataforma auditan igual (actor sistema). Cualquier camino de escritura que esquive el UoW es, por definición, un camino sin auditoría — y por eso está prohibido en todas partes.
3. **La proyección forense es un consumidor normal**: `audit_consulta` (ETS-010) se construye desde los eventos como cualquier read model — misma plantilla, mismo cursor, misma reconstruibilidad; su única particularidad es retención y clasificación (ETS-006/13).
4. **La cadena de sellos no se implementa dos veces**: el hash encadenado por módulo lo calcula el despachador al publicar (10 §ciclo); la verificación de integridad es una operación de plataforma que recorre la cadena — ningún módulo la reimplementa ni la "optimiza".
5. **Las denegaciones se auditan con lo mínimo necesario**: quién, qué operación, cuándo, qué regla cortó — sin registrar los datos del intento (que pueden ser justamente lo que el actor no debía tocar).
6. **Exportabilidad de serie**: los sellos y la proyección forense se diseñan exportables (ETS-011/17) para peritajes; la exportación es un job de reporting normal (20), no un camino especial.

## 3. Prueba obligatoria

Suite transversal: todo comando confirmado deja evento con actor y contexto completos; toda denegación provocada deja registro; toda consulta sensible marcada deja acceso; la cadena de sellos verifica tras una secuencia de despachos y detecta la manipulación de un eslabón inyectada a propósito.

---

## Impacto sobre la implementación
La auditoría cuesta cero esfuerzo por módulo y es imposible de omitir — exactamente lo que un sistema multi-tenant de mantenimiento regulado necesita para sostener confianza.

## ETS relacionados
ETS-011 (17, 10, 14) · ETS-010 (audit_consulta, esquema outbox) · ETS-006 (13 clasificación y retención).

## Riesgos
- Eventos anémicos ("AlgoCambió" sin contexto) → regla 1; la revisión de dominio exige eventos que un auditor entienda.
- Herramientas de soporte escribiendo directo a la base → regla 2; toda corrección operativa es un comando con actor y auditoría.

## Decisiones habilitadas
Peritajes exportables, forense por proyección, verificación de integridad continua.

## Decisiones bloqueadas
Algoritmo de hash concreto y formato de exportación — normados/decididos con ETS-010 y el stack.
