# 28_PLATFORM_EVOLUTION.md

> **DeltaOps — ESI-002 · v1.0** · Evolución de la plataforma y Guía Oficial del Entorno de Ingeniería.
> Cierra la serie ESI-002. Sin código.

---

## 1. La Guía Oficial del Entorno de Ingeniería (diseño)

La guía es el **documento vivo de entrada** a todo el entorno (`docs/guides/`, hogar según 23), escrito para el día a día — corto, operativo, con enlaces a las fuentes normativas. Contenido normado:

1. **Empezar**: prerrequisitos, `bootstrap`, verificación de LISTO (05).
2. **Trabajar**: el ciclo diario — rama, `generar`, completar por plantilla, `verificar`, `pruebas`, PR con checklist (04/16/18/25).
3. **El sistema local**: servicios, mapa de puertos, observabilidad local y cómo depurar por trazas (11).
4. **Datos**: sembrar, resembrar, escenarios (12).
5. **Configuración y secretos**: qué va dónde y qué jamás (07/08).
6. **Mapa del corpus**: qué documento norma qué, para consultar bajo demanda (el mapa de 24 §1 + jerarquía de 01 §4).
7. **Cuando algo anda mal**: guías de diagnóstico (workflow roto, puerta roja, entorno corrupto → destruir y re-bootstrap).

La guía se ensaya en cada onboarding (06) y su dueño la mantiene (27); la guía que miente es defecto de máxima prioridad de documentación.

## 2. Evolución de la plataforma: señales y respuestas registradas

| Señal (medible) | Respuesta preparada |
|---|---|
| Puerta > 15 min sostenido | paralelización, caché de CI, mover pasos a programado (ESI-001/10 §riesgos) |
| Bootstrap > 15 min o fallando en el job periódico | tratarlo como defecto de plataforma inmediato (05 §regla 5) |
| Monorepo lento (clones, IDE) | clones parciales, caché remota de build; evaluar tooling de monorepo SOLO entonces (ESI-001/06 §Nx descartado "por ahora") |
| Compose local insuficiente (equipo/multi-nodo) | entornos DEV remotos efímeros; K8s según señal de ESI-001/12 §2 |
| Revisión humana como cuello (volumen IA, 17) | más verificación mecánica (plantillas más estrictas, Semgrep) antes que menos revisión |
| Vault dedicado necesario (rotación automática, secretos dinámicos) | ADR según 08 §2 |
| Onboarding degradándose (06 §4) | retro dirigida al itinerario; es EL indicador temprano de plataforma enferma |

Toda respuesta pasa por gobierno (27 §2) y ADR cuando toca stack — la evolución también está gobernada.

## 3. Lo que NO evoluciona por esta vía

- La arquitectura (ETS) y el stack (ESI-001): congelados; solo supersesión formal del programa.
- El principio de un solo camino (01 §2.1): las evoluciones cambian EL camino, jamás agregan un segundo.
- La jerarquía normativa (01 §4).

## 4. Cierre de la serie

**Fin de la serie ESI-002.** Con estos 28 documentos, la Plataforma Oficial de Ingeniería de DeltaOps queda diseñada por completo: monorepo y estructura (02-04), arranque y personas (05-06), configuración y entornos (07-09), ejecución local y datos (10-12), disciplina diaria (13-16), fabricación con humanos e IA (17-19), preparación para los DGP (20), entrega (21-22), documentación y convenciones (23-24), y gobierno con sus checklists (25-27). El siguiente paso natural del programa es el primer DGP: el esqueleto físico que convierta este diseño en un repositorio real, verificado por el checklist de 26.

---

## Impacto sobre la implementación
La guía es entregable del esqueleto (contenido ya normado aquí); las señales del §2 dan al equipo respuestas pre-decididas para los cuellos previsibles — la plataforma envejece por diseño, no por sorpresa.

## Dependencias
Toda la serie ESI-002 · 27 (gobierno de la evolución) · ESI-001/12 (roadmap tecnológico con el que estas señales se coordinan).

## Riesgos
- Señales ignoradas hasta la crisis → las métricas de 27 §4 las miden en cada revisión trimestral; la señal disparada sin respuesta es hallazgo de gobierno.
- La guía divergiendo de la plataforma real → ensayo en cada onboarding + dueño; la guía se corrige el día que miente.

## Decisiones habilitadas
Redacción física de la guía (esqueleto), primer DGP, calendario de revisiones de plataforma.

## Decisiones bloqueadas
Todo cambio a lo congelado (§3) y toda evolución fuera del proceso de gobierno.
