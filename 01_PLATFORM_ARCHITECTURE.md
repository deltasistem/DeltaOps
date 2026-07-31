# 01_PLATFORM_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura Técnica de la Plataforma: decisión estructural y estrategia de evolución.
> Documento de diseño. No implementa nada.

---

## 1. Decisión: Monolito Modular (Modular Monolith)

DeltaOps se construye como **un monolito modular estricto**: una sola unidad desplegable compuesta por módulos con fronteras duras, contratos explícitos y comunicación gobernada — preparado para extraer servicios cuando (y solo cuando) una razón operativa lo exija.

### Justificación

| Criterio | Monolito modular | Microservicios desde el día 1 |
|---|---|---|
| **Consistencia del dominio** | Transacciones locales donde el dominio las exige (agregado + evento atómicos, ETS-006/11) | Consistencia distribuida desde el inicio: sagas y compensaciones para todo, incluso lo trivial |
| **Velocidad de evolución** | Refactorizar fronteras de módulos es barato mientras el dominio se asienta | Fronteras equivocadas se fosilizan en contratos de red |
| **Operación** | Un despliegue, una observabilidad, un plano de fallos | Orquestación, red, versionado de N servicios — costo permanente |
| **Equipo esperado** | Un equipo de producto cohesionado | Exige equipos por servicio que no existen aún |
| **Multi-tenant SaaS** | El aislamiento es lógico por tenant (ETS-006), no requiere procesos separados | Igual de lógico, pero con más superficie de error |
| **Riesgo real del monolito** | El acoplamiento silencioso — **se mitiga con fronteras duras verificadas** (ver §3) | — |

La complejidad de DeltaOps está en el **dominio** (ETS-003) y la **configurabilidad** (ETS-005), no en necesidades de escala heterogénea por componente. Los microservicios resuelven un problema organizacional y de escala que DeltaOps no tiene al inicio; el monolito modular captura los beneficios de la modularidad (fronteras, contratos, eventos) sin pagar el precio de la distribución.

## 2. Reglas estructurales del monolito modular

1. **Módulos como unidades de primera clase** (catálogo en `03_MODULE_CATALOG.md`): cada módulo posee su modelo, su almacenamiento lógico (esquema propio: ningún módulo lee las estructuras de otro) y sus contratos públicos.
2. **Comunicación solo por contratos:** interfaz pública síncrona (llamadas en proceso contra el contrato, no contra las clases internas) o eventos de dominio asíncronos (`04_MODULE_INTERACTIONS.md`). Prohibido el acceso directo a datos ajenos.
3. **Dependencias dirigidas y verificadas:** el grafo de dependencias permitidas es explícito y se verifica automáticamente en el proceso de construcción — una dependencia no declarada rompe la construcción, no la revisión de código.
4. **El bus de eventos interno es el mismo contrato que el externo:** los módulos se hablan por los eventos de ETS-003; extraer un módulo a servicio no cambia el contrato, solo el transporte.
5. **Una base de datos física, muchos esquemas lógicos:** la frontera es lógica y disciplinada; las transacciones entre módulos están prohibidas (solo dentro del agregado — coordinación entre módulos por eventos).
6. **Estado compartido: cero.** Nada de caches, variables o memoria compartida entre módulos fuera de los contratos.

## 3. Estrategia de evolución futura

### Camino de extracción (cuando haya una razón)

Razones válidas para extraer un módulo a servicio: perfil de carga radicalmente distinto (ingesta IoT masiva), aislamiento de fallos crítico (motor de IA con dependencias externas), requisito de residencia/escala regional, o un equipo dedicado con ciclo de vida propio.

```text
FASE 0 (hoy)      Monolito modular, bus interno, una BD con esquemas por módulo
FASE 1            El módulo candidato ya solo habla por eventos y contratos
                  (verificado); su esquema se aísla físicamente si hace falta
FASE 2            Se duplica el transporte: el bus interno se puentea a
                  mensajería externa para ese módulo (strangler)
FASE 3            El módulo corre como servicio; el resto no cambió ni una línea
                  de contrato
```

**Candidatos naturales a extracción** (en orden de probabilidad): Integration/IoT (ráfagas), AI (dependencias y costos externos), Search (índice dedicado), Analytics/marts (carga de lectura), Files (ancho de banda). Core, Identity, Organization y los módulos de dominio permanecen juntos el mayor tiempo posible: comparten los invariantes.

### Reglas de evolución

1. **Nunca extraer por moda; extraer por dolor medido** (observabilidad, `10_OBSERVABILITY.md`).
2. **El contrato precede a la extracción:** un módulo que no sobrevive la verificación de fronteras no es candidato — primero se sanea, luego se extrae.
3. **La plataforma de configuración (ETS-005) y la estrategia de datos (ETS-006) son invariantes ante la topología:** extraer servicios jamás cambia el modelo de eventos, el CQRS ni el aislamiento multi-tenant.

## 4. Vista de conjunto

```text
┌────────────────────────── CLIENTES ──────────────────────────┐
│  Web (SPA) · Móvil offline-first (PWA) · API pública · BI    │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌─────────────────────── EDGE / GATEWAY ───────────────────────┐
│  TLS · autenticación · rate limit · tenancy resolver · CDN    │
└──────────────────────────────┬───────────────────────────────┘
                               ▼
┌──────────────────── MONOLITO MODULAR ────────────────────────┐
│  22 módulos (03_MODULE_CATALOG.md) · bus de eventos interno   │
│  contratos públicos · esquemas lógicos por módulo             │
└───────┬──────────────┬───────────────┬───────────────────────┘
        ▼              ▼               ▼
   BD (patrimonio) Almacén de     Índice de búsqueda /
   + read models   archivos       caches (11_CACHE_...)
```

Los detalles por área están en los documentos 02–16 de esta serie.
