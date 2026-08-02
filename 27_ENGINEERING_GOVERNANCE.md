# 27_ENGINEERING_GOVERNANCE.md

> **DeltaOps — ESI-002 · v1.0** · Gobierno de la plataforma de ingeniería: quién decide qué, cómo evoluciona la regla.
> Sin código.

---

## 1. Roles de gobierno

| Rol | Responsabilidad |
|---|---|
| **Dueño de plataforma** | custodia esta serie: plantillas, generadores, comandos, puerta, guías; revisor obligatorio de cambios a `platform/` y a documentos vivos de ingeniería |
| **Dueño de arquitectura** | custodia la coherencia con ETS/ESI congelados; arbitra conflictos normativos (01 §4) y aprueba ADRs que superseden |
| **Dueños de guías** | cada documento vivo tiene un dueño nombrado (23 §4.1) |
| **Responsable de release** | ejecuta 22 por release; rota entre el equipo — el proceso es de todos |

Los roles son responsabilidades, no jerarquías: cualquiera propone; el dueño garantiza que la decisión se tome bien y quede escrita.

## 2. Cómo cambia una regla (el proceso único)

1. **Detección**: una regla estorba, falta o se contradice — detectada en trabajo real, retro, onboarding o revisión.
2. **Propuesta**: PR sobre el documento correspondiente (o ADR si es decisión de stack/arquitectura), con el problema concreto que motiva el cambio — las reglas no cambian por gusto.
3. **Arbitraje por nivel** (01 §4): documentos de esta serie → dueño de plataforma; conflicto con ETS/ESI → dueño de arquitectura y, si toca lo congelado, supersesión formal del programa.
4. **Propagación**: el cambio actualiza en el MISMO PR todo lo acoplado: plantilla+generador+ejemplo (18/19), catálogo de comandos (16), checklist (25), mapa de convenciones (24).
5. **Comunicación**: el cambio de regla se anuncia al equipo; el cambio silencioso de reglas erosiona la confianza en las reglas.

## 3. Ritmos de gobierno

| Ritmo | Contenido |
|---|---|
| **Por PR** | el gobierno cotidiano: la revisión aplica el checklist y detecta deriva |
| **Retro periódica** (por sprint) | defectos recurrentes → ¿qué plantilla/verificación endurecer?; fricciones → ¿qué regla estorba de más? |
| **Revisión trimestral** | salud de plataforma con métricas (§4); dependencias atrasadas (13); guías vigentes/retiradas (23); excepciones vencidas (ESI-001/08) |

## 4. Métricas de salud de plataforma (evalúan la plataforma, no personas — 14 §4)

- Duración de puerta y de bootstrap (presupuestos 15 min).
- Tasa de rechazo en puerta por causas de peldaño 1-2 (≈ 0 esperado).
- Tiempo apertura→merge de PR; tamaño mediano de PR.
- Defectos que cruzaron la puerta (por clase → endurecimiento dirigido).
- Excepciones activas y su edad (arquitectónicas y de seguridad).
- Tiempo de onboarding real (06 §4).

## 5. El principio de cierre

**Ninguna regla es sagrada, pero toda regla vigente se cumple.** El desacuerdo con una regla se tramita por el proceso del §2 mientras se la cumple; la desobediencia unilateral — humana o de agente — es el único pecado capital de la plataforma, porque disuelve todas las demás reglas a la vez.

---

## Impacto sobre la implementación
La plataforma queda con mecanismo de evolución desde antes de la primera pieza: dueños nombrados (26 §E), proceso único de cambio y métricas que dirigen el endurecimiento donde los defectos aparecen.

## Dependencias
01 §4 (jerarquía normativa) · 23 (dueños de documentos) · 25 (checklist como instrumento cotidiano) · ESI-001/11 (ADRs) · 14 §4 (ética de métricas).

## Riesgos
- Gobierno convertido en burocracia → el proceso del §2 es UN PR con revisor correcto, no un comité; lo pesado se reserva a lo congelado.
- Dueños cuello de botella → el dueño garantiza calidad de decisión, no la ejecuta toda; delegación explícita cuando el volumen crezca.

## Decisiones habilitadas
Nombramientos iniciales (26), calendario de retros y revisiones, evolución gobernada de toda la serie.

## Decisiones bloqueadas
Cambios a ETS/ESI congelados — solo por supersesión formal del programa, jamás por este gobierno cotidiano.
