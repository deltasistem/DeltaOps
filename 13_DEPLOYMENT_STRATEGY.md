# 13 — Deployment Strategy

> **DeltaOps — ESI-009 · v1.0** · La estrategia de despliegue: sin corte de servicio, exposición gradual, y el despliegue separado de la liberación funcional.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Posición

Desplegar es poner una versión a correr; liberar funcionalidad es exponerla (doc 12). Separarlos es la decisión estructural de este documento: el despliegue se vuelve rutina técnica de bajo riesgo, y la exposición, decisión de producto gradual.

## 2. Reglas normativas

1. **Sin corte de servicio como norma**: el despliegue estándar no interrumpe a los tenants (ETS-012: SaaS multi-tenant no tiene "madrugada" universal); la ventana de mantenimiento es la excepción decidida y comunicada, no el método.
2. **Convivencia N/N-1 durante el despliegue**: mientras las instancias rotan, la versión nueva y la anterior conviven contra el mismo esquema — posible porque las migraciones expanden antes de contraer (doc 10 §2.4) y los contratos sostienen N-1 (doc 11 §2.2). Esta convivencia no es un accidente: es la precondición diseñada.
3. **Exposición gradual normada**: la funcionalidad significativa se enciende por etapas — internos → tenants piloto (con acuerdo) → gradual → 100% — con las señales declaradas (doc 05 §2.6) observadas en cada etapa; el salto de etapa es decisión con evidencia, el retroceso es un apagado de toggle.
4. **El despliegue es automatizado y repetible**: la secuencia (drenar, rotar, verificar, continuar) es la misma siempre, ejecutada por la plataforma, no por manos; el paso manual documentado es una deuda, el paso manual no documentado es un incidente futuro.
5. **Verificación post-despliegue obligatoria**: salud técnica (arranque, dependencias, migraciones aplicadas) + señales funcionales declaradas durante la ventana de confirmación (doc 10 §2.7); el despliegue sin confirmación no se declara terminado.
6. **Nada especial por tenant**: todos los tenants corren la misma versión del mismo artefacto (ESI-007/27: sin forks); la variación legítima vive en configuración y capacidades — el despliegue por tenant no existe como concepto.
7. **La infraestructura como parte del flujo**: los cambios de infraestructura y topología viajan también por PR, revisión y pipeline (docs 05-09) — declarados, versionados y reversibles como el código; sin cambios de consola a mano.

## Impacto sobre la implementación

La mecánica concreta (estrategia de rotación, salud, drenaje) se define en el DGP de entrega sobre la plataforma elegida; las precondiciones (N/N-1, expandir-migrar-contraer) ya están congeladas.

## Dependencias

ETS-012; ESI-007/27; docs 05, 10-12, 14-15.

## Riesgos

- La exposición gradual usada como excusa para no terminar (funcionalidad al 50% durante meses); mitigación: el toggle de liberación caduca (doc 12 §3.2) y el tablero expone las exposiciones estancadas.

## Decisiones habilitadas

- Despliegues diarios sin ventanas nocturnas ni héroes.
- Encendidos graduales con retroceso instantáneo por toggle.

## Decisiones bloqueadas

- Prohibido el despliegue con corte como método estándar.
- Prohibidas versiones distintas por tenant.
- Prohibidos cambios de infraestructura fuera del flujo declarado.

## Reusable Pattern

Desplegar ≠ exponer + convivencia N/N-1 + gradualidad con señales: el despliegue como rutina y la exposición como decisión — cada uno con su gobierno.

## Anti-Patterns

- El despliegue big-bang con encendido simultáneo de todo.
- "Le desplegamos una versión especial a este cliente grande".
- Verificar el despliegue mirando que "la página cargue".

## Knowledge Graph

- **ETS que consume**: ETS-012 (SaaS sin madrugada universal).
- **ESI que consume**: ESI-007/27 (sin forks por cliente); ESI-003 vía docs 10-11 (precondiciones de convivencia).
- **DGP que originará**: mecánica de rotación, etapas de exposición y ventanas en el DGP de entrega.
- **ADR relacionados**: ADR de despliegue sin corte; ADR de exposición gradual normada.
- **Módulos que reutilizarán este patrón**: todos se despliegan juntos y se exponen por etapas propias.
