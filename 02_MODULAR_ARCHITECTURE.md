# 02_MODULAR_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura modular: anatomía, capas y reglas de los módulos técnicos.
> El catálogo módulo a módulo está en `03_MODULE_CATALOG.md`; las interacciones, en `04_MODULE_INTERACTIONS.md`.
> Documento de diseño. No implementa nada.

---

## 1. Qué es un módulo técnico

Un módulo es la unidad de propiedad, cambio y (futura) extracción: encapsula uno o más bounded contexts de ETS-003 con su modelo, su almacenamiento lógico y sus contratos. Los módulos técnicos siguen a los bounded contexts, no al revés — la técnica obedece al dominio.

## 2. Anatomía interna estándar (todos los módulos iguales)

```text
MÓDULO
├── Contrato público          lo ÚNICO visible desde fuera:
│   ├── Interfaz síncrona     comandos y consultas expuestos (casos de uso)
│   ├── Eventos publicados    subconjunto del catálogo ETS-003
│   └── Eventos suscritos     declarados explícitamente
├── Aplicación                casos de uso: orquesta dominio + permisos + validación
├── Dominio                   agregados, invariantes, eventos (ETS-003) — puro
├── Infraestructura           persistencia del módulo, adaptadores
└── Read models propios       proyecciones que este módulo sirve
```

Reglas internas:

1. **El dominio no conoce la infraestructura** (dependencias hacia adentro).
2. **Nada fuera del contrato es alcanzable:** los tipos internos no se exportan; la verificación de fronteras lo garantiza en la construcción.
3. **Cada módulo valida permisos en su frontera** (contexto activo — `05_MULTITENANT_ARCHITECTURE.md`); nunca asume que "el que llama ya validó".
4. **Cada módulo posee su esquema lógico**; las consultas cruzadas se resuelven por contratos o por read models compuestos, jamás por joins entre esquemas ajenos.

## 3. Capas transversales vs. módulos de dominio

| Tipo | Módulos | Regla |
|---|---|---|
| **Fundacionales** | Core, Identity, Organization, Configuration, Audit | Todos pueden depender de ellos; ellos no dependen de nadie de dominio |
| **De dominio** | Assets, Maintenance, Work Orders, Inventory, Fuel & Energy, Purchasing, Warehouse | Se hablan entre sí **solo por eventos** (y contratos de consulta puntuales declarados) |
| **De capacidad** | Workflow, Rules, Notifications, Files, Search, Reporting, Analytics, AI | Sirven a los de dominio vía contratos; consumen eventos de todos |
| **De borde** | Mobile, Integration | Adaptan el exterior (dispositivos, terceros) a comandos y contratos internos; contienen las anti-corruption layers |

## 4. Reglas de dependencia (el grafo permitido)

```text
                 ┌─────────── Borde: Mobile · Integration ───────────┐
                 ▼                                                    ▼
      ┌──── Capacidades: Workflow · Rules · Notifications · Files ────┐
      │        Search · Reporting · Analytics · AI                    │
      ▼                                                               │
┌── Dominio: Assets · Maintenance · WorkOrders · Inventory ──┐        │
│   Fuel&Energy · Purchasing · Warehouse                     │◄───────┘
▼                                                            ▼   (solo eventos
Fundacionales: Core · Identity · Organization · Configuration · Audit  y contratos)
```

1. **Hacia abajo, síncrono permitido; hacia arriba o lateral, solo eventos.** Un módulo de dominio llama a Configuration (resolver la versión vigente) pero jamás llama a Analytics; Analytics escucha sus eventos.
2. **Prohibidos los ciclos.** Si dos módulos parecen necesitarse mutuamente en síncrono, la frontera está mal o falta un evento.
3. **Audit es escritura universal, lectura gobernada:** todos emiten hacia él (vía bus); nadie le consulta salvo por su contrato de líneas de tiempo.
4. **Core no es un cajón de sastre:** contiene exclusivamente los tipos del lenguaje ubicuo compartido (identidades, folios, tiempo doble, contexto organizacional, dinero/unidades) y el bus interno. Lo que huela a negocio vive en su módulo.

## 5. Contratos

- **Versionados y aditivos** (ETS-006/10): romper un contrato exige nueva versión y convivencia temporal.
- **Un contrato por intención**, en lenguaje ubicuo: `CerrarOT`, `ConsultarHojaDeVida` — nunca "updateEntity".
- **Documentados en el propio contrato** (la definición es la documentación — coherente con ETS-006/18).
- Los contratos síncronos declaran su costo esperado (¿es una lectura barata o una operación pesada?) para que el llamador decida con información.

## 6. Verificación continua de fronteras

- La construcción verifica: dependencias declaradas vs. reales, ausencia de ciclos, no-exportación de tipos internos, no-acceso a esquemas ajenos.
- Las métricas de acoplamiento por módulo (fan-in/fan-out, eventos vs. síncrono) forman parte de la observabilidad (`10_OBSERVABILITY.md`): el deterioro de fronteras se ve en un tablero, no en una arqueología.
