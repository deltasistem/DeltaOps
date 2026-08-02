# 02_BACKEND_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de backend.
> Decisiones justificadas; alternativas descartadas con razón objetiva. Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación principal |
|---|---|---|
| **Lenguaje** | **Python 3.12+** (serie estable con soporte vigente) | tipado gradual maduro (type hints + verificación estática) suficiente para los contratos del Kernel; ecosistema masivo en datos/IA (ETS-011/21); talento abundante; legibilidad alineada con "plantillas monótonas" de ETS-012 |
| **Framework HTTP** | **FastAPI** | contrato-primero nativo: genera OpenAPI desde tipos, alineado con API First (ETS-008); validación de frontera declarativa; asincronía de serie; es el adaptador de entrada delgado que ETS-012/09 exige |
| **ORM / acceso a datos** | **SQLAlchemy 2.x (Core + ORM)** | control transaccional explícito indispensable para el UoW (ETS-012/11); mapeo agregado↔tablas sin magia; madurez de dos décadas; soporta RLS, savepoints y bloqueos que ETS-010 exige |
| **Migraciones** | **Alembic** | expandir-migrar-contraer (ETS-010/21) con migraciones versionadas, reversibles y revisables en PR; integración natural con SQLAlchemy |
| **Validación (capa 1)** | **Pydantic v2** | generación de validadores desde tipos del contrato (ETS-012/13 §regla 1); rendimiento de núcleo compilado; serialización canónica de sobres del Kernel |
| **Autenticación** | **OpenID Connect / OAuth 2.1 + JWT firmados** (biblioteca estándar de OIDC, proveedor detrás de puerto) | estándar abierto; multi-tenant con emisor por despliegue; la identidad es una etapa de pipeline (ETS-011/14) — el proveedor concreto queda tras el puerto de identidad y es sustituible |
| **Serialización** | **JSON canónico en fronteras (Pydantic)**; sobres de eventos con esquema versionado | un solo formato externo (ETS-008); bit a bit estable para idempotencia (ETS-012/14 §regla 6) |
| **Asincronía** | **async/await nativo** en adaptadores de entrada e I/O; **workers de proceso separado** para despachador, consumidores y jobs | el pipeline HTTP es I/O-bound (async paga); consumidores y jobs corren fuera del proceso web (aislamiento de ritmo, ETS-011/22) |
| **Gestión de dependencias** | **uv + pyproject.toml** con lockfile committeado | resolución determinista y rápida; un solo archivo de manifiesto; auditoría de dependencias (08) sobre el lockfile |

## 2. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **Node.js/TypeScript backend** | viable, pero divide el ecosistema de IA/datos (ETS-011/21 favorece Python); el beneficio "un lenguaje full-stack" no compensa perder el ecosistema analítico; los contratos ya se comparten por OpenAPI generado, no por código compartido |
| **Java/Spring, C#/.NET** | madurez excelente, pero mayor ceremonia por pieza (contra KISS/plantillas ligeras de ETS-012) y menor velocidad de iteración para el tamaño de equipo previsto; talento más caro en el mercado objetivo |
| **Go** | gran rendimiento, pero expresividad limitada para el modelado rico de dominio DDD (tipos suma pobres, sin genéricos maduros en ecosistema ORM); ecosistema de IA débil |
| **Django** | monolito con opiniones propias (ORM activo, admin, formularios) que chocan con Clean Architecture: el ActiveRecord dificulta agregados puros y el UoW explícito |
| **Flask** | micro-framework sin contrato-primero nativo; requeriría ensamblar a mano lo que FastAPI trae alineado con ETS-008 |
| **ORMs "active record" (Django ORM, Peewee)** | el patrón active record acopla dominio a persistencia — violación directa de la Regla de Dependencia |
| **Poetry / pip-tools** | funcionales, pero resolución más lenta y doble herramienta; uv cubre instalación+lock+entornos con un binario |
| **Sesiones con cookies de servidor como mecanismo primario** | el canal móvil offline-first (ETS-011) y las integraciones exigen tokens portadores verificables sin estado de sesión central |

## 3. Reglas de uso (no configuración)

1. El framework HTTP aparece SOLO en `adaptadores/` y `arranque/` (ETS-012/23); ningún tipo de FastAPI/Pydantic-de-frontera cruza hacia aplicación o dominio — el dominio usa tipos propios del Kernel.
2. SQLAlchemy aparece SOLO en adaptadores de persistencia; las interfaces de repositorio (dominio) no conocen sesiones ni motores.
3. La verificación estática de tipos es obligatoria en CI para todo el backend (06).

---

## Impacto sobre la implementación
Fija el lenguaje y las piezas centrales del backend; la traducción oficial de las plantillas ETS-012 a Python/FastAPI/SQLAlchemy se hará una sola vez en el ESI de patrones.

## Dependencias
01 (criterios) · ETS-008 (OpenAPI como contrato) · ETS-010/011/012 (garantías que estas piezas deben materializar) · 04 (PostgreSQL).

## Riesgos
- Async mal usado (bloqueos en el event loop) → regla de plataforma: I/O bloqueante solo en workers; revisión y lint lo vigilan.
- Tipado gradual permite huecos → verificación estática en modo estricto para kernel/dominio/aplicación.

## Decisiones habilitadas
Traducción de plantillas al stack, generación de clientes desde OpenAPI (03), selección de tooling Python (06-08).

## Decisiones bloqueadas
Versiones exactas menores y librerías auxiliares menudas — se fijan en el lockfile inicial con ADR ligero.
