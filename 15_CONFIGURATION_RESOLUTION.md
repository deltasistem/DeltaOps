# 15_CONFIGURATION_RESOLUTION.md

> **DeltaOps — ETS-011 · v1.0** · Resolución de configuración: cómo el Core convierte la cascada configurable en una respuesta exacta, versionada y congelable.
> Documento de diseño. Sin código, sin clases.

---

## 1. El problema y la pieza

Configuration First (ETS-005) significa que formularios, workflows, reglas, umbrales, numeraciones y catálogos varían por tenant y por nodo organizacional, con versiones publicadas y vigencias. El **Resolutor de Configuración** es la pieza única del Core que responde:

```text
"Para ESTE tenant, ESTE contexto organizacional, ESTA fecha:
 ¿qué versión exacta de cada definición rige?"
→ CONFIGURACIÓN RESUELTA: conjunto cerrado de (definición, versión)
  con procedencia (de qué nivel de la cascada vino cada una)
```

## 2. Reglas normativas

1. **Cascada resuelta en un solo lugar**: plataforma → tenant → nodo (herencia con sobrescritura declarada, ETS-005); ningún caso de uso, Policy ni motor re-implementa la herencia — preguntan al resolutor.
2. **El comando congela lo que usó** (ETS-009/05): las versiones resueltas que determinaron la decisión viajan al hecho (columnas de versión congelada, ETS-010/03). Reproducibilidad eterna: el hecho de 2026 se explica con su configuración de 2026.
3. **Resolución al inicio del pipeline** (11 etapa 5): el caso de uso recibe la configuración resuelta como insumo inmutable; no hay re-resolución a mitad de comando (una publicación concurrente no parte un comando en dos épocas).
4. **Publicar no reescribe**: una versión publicada es inmutable (ETS-005); publicar crea versión nueva con vigencia; el resolutor sirve la vigente a la fecha del comando — y la histórica a cualquier fecha pasada (consultas as-of de configuración).
5. **La resolución es rápida por diseño**: el respaldo físico `configuracion_resuelta` (proyección por tenant/nodo, ETS-009/05 §2) hace la respuesta una búsqueda; la invalidación es por evento de publicación — el resolutor jamás recalcula cascada en caliente.
6. **Paquetes móviles**: la bajada offline entrega la configuración resuelta del alcance del usuario con sus versiones (ETS-008/12); el dispositivo valida contra lo mismo que validará el servidor — una sola verdad de configuración.
7. **Procedencia explicable**: "¿por qué rige este umbral aquí?" tiene respuesta (nivel de cascada, quién publicó, cuándo) — gobernanza de configuración (ETS-005, U-19).

---

## Impacto sobre la implementación
El resolutor se implementa una vez (módulo configuración) con su proyección de respaldo; todos los pipelines y Policies lo consumen; la congelación de versiones es parte de la plantilla del hecho.

## ETS relacionados
ETS-005 (toda la plataforma de configuración) · ETS-009 (05 versionado y congelación) · ETS-010 (03 columnas de versión) · ETS-011 (05 policies, 11 pipeline, 13 capa 3).

## Riesgos
- Cascadas profundas con sobrescrituras confusas → procedencia obligatoria (§2.7) y límites de niveles definidos en ETS-005.
- Configuración resuelta desactualizada tras publicar → invalidación por evento con frescura medible; la publicación declara su vigencia futura (no efectos retroactivos silenciosos).

## Decisiones habilitadas
Implementación del resolutor y su proyección, congelación en hechos, paquetes móviles coherentes.

## Decisiones bloqueadas
Estrategia de caché en memoria del resolutor (medir primero) y herramientas de autoría de configuración (UI, fuera del Core).
