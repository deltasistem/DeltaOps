# 26_SPRINT_READINESS.md

> **DeltaOps — ESI-002 · v1.0** · Checklist de preparación para el Sprint 1: la plataforma lista antes de la primera pieza.
> Sin código.

---

## 1. Principio

El Sprint 1 **no empieza hasta que la plataforma esté lista**: construir piezas sobre plataforma a medias produce deriva desde el día uno — exactamente lo que todo este programa existe para impedir. Este checklist es el criterio de "lista"; lo ejecuta el DGP de esqueleto y lo verifica el gobierno (27).

## 2. El checklist de preparación

### A. Repositorio y estructura
- [ ] Monorepo creado con las zonas de 03; reglas de rutas activas.
- [ ] Protecciones de `main`, plantilla de PR y verificación de commits activas (04).
- [ ] `docs/` poblado: ADRs de ESI-001, itinerario de onboarding (06), guía del entorno (28).

### B. Bootstrap y entorno local
- [ ] Clon limpio → `bootstrap` → LISTO en < 15 min, verificado en al menos dos máquinas distintas y en el job periódico de CI (05).
- [ ] `arriba` levanta el sistema completo con observabilidad; mapa de puertos documentado (11).
- [ ] Seed multi-tenant determinista corriendo por casos de uso (12) — al menos los del módulo de referencia.

### C. Calidad y puerta
- [ ] Hooks de pre-commit instalables y rápidos (14).
- [ ] La puerta completa de ESI-001/10 §2 operativa (pasos 1-8 < 15 min) invocando los comandos oficiales (16 §regla 4).
- [ ] Reglas de imports R1-R5/M1-M5 y reglas Semgrep DeltaOps iniciales activas (ESI-001/06/08).
- [ ] Los cuatro entornos definidos con secretos segregados; QA desplegándose desde `main` (09).

### D. Fabricación
- [ ] Plantillas T01-T15 ejecutables con ejemplos vivos en el módulo de referencia (18).
- [ ] Generadores del catálogo funcionando con sus pruebas (19).
- [ ] `contratos` regenerando OpenAPI → tipos → validadores, con verificación de diff en la puerta.

### E. Personas y agentes
- [ ] Onboarding ensayado con al menos una persona real (06) — el ensayo ES parte de la preparación.
- [ ] Marco de IA operativo: plantilla de PR con marca, reglas de 17 publicadas, un DGP de práctica ejecutado por un agente de punta a punta con revisión humana.
- [ ] Mentores y dueños de plataforma nombrados (27).

### F. Verificación final
- [ ] Un ciclo completo ensayado: generar pieza → completar → checklist 25 → PR → puerta → merge → despliegue automático a QA → verificación en observabilidad.
- [ ] Retro de preparación hecha: lo aprendido incorporado a guías y plantillas antes del Sprint 1.

## 3. Reglas

1. **Verde total o no hay Sprint 1**: el punto pendiente "que resolveremos sobre la marcha" es el primer punto de deriva; se resuelve antes.
2. **La preparación se demuestra ejecutando, no declarando**: cada punto tiene evidencia (el ensayo, el job, el registro) — el checklist se llena con hechos.
3. Este checklist se ejecuta UNA vez; su versión recurrente es la salud de plataforma (27 §métricas).

---

## Impacto sobre la implementación
Define el criterio de aceptación del DGP de esqueleto: cuando este checklist está en verde con evidencia, la construcción del producto puede empezar a velocidad plena desde el primer día.

## Dependencias
Toda la serie ESI-002 (cada bloque remite a sus documentos) · ESI-001/10 (la puerta) · el futuro DGP de esqueleto (20 §5).

## Riesgos
- Presión por empezar "aunque falte poco" → regla 1; el costo de una semana de espera es ruido frente al costo de deriva estructural.
- Preparación declarada sin evidencia → regla 2: cada casilla nombra su evidencia.

## Decisiones habilitadas
Arranque del Sprint 1, planificación de los primeros DGP de producto (20), línea base de métricas de plataforma.

## Decisiones bloqueadas
Contenido del Sprint 1 (qué módulos primero) — planificación de producto sobre los DGP; nada aquí lo prejuzga.
