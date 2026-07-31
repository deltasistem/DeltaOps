# 01_CONFIGURATION_PLATFORM.md

> **DeltaOps — ETS-005 · v1.0** · Arquitectura de la Plataforma de Configuración.
> Documento maestro de la serie: define el principio rector, las capas de configuración y el mapa de los 12 motores.
> Documento de diseño. No implementa nada.

---

## 1. Principio rector

> **Todo lo que pueda parametrizarse, no debe programarse.**

DeltaOps debe adaptarse a cualquier empresa —minera, constructora, flota, planta, hospital— **sin tocar código**. La diferencia entre dos clientes es **configuración**, nunca una rama del repositorio ni un `if (empresa === ...)`. Cuando aparece la tentación de programar una excepción para un cliente, la respuesta correcta es preguntar: *¿qué capacidad de configuración falta en la plataforma?*

Corolarios:

1. **El Core es pequeño y estable.** Contiene los invariantes del dominio (ETS-003). Cambia con versiones de producto, no con clientes.
2. **La configuración es contenido, no software.** Se crea, versiona, aprueba, exporta e importa como datos.
3. **Cada tenant vive de su configuración**, partiendo de plantillas base (industria) que puede clonar y ajustar.
4. **La configuración también se audita.** Cambiar un flujo de aprobación es un hecho de negocio tan importante como aprobar una compra.

## 2. Las cuatro capas

Toda pieza de la plataforma pertenece a exactamente una capa:

| Capa | Qué contiene | Quién la cambia | Ejemplos |
|---|---|---|---|
| **1. Core** | Invariantes del dominio que definen qué *es* DeltaOps | Solo el fabricante, por versión de producto | Los agregados y eventos de ETS-003; asignaciones con vigencia; auditoría append-only; "la IA propone, no dispone"; folios inmutables; el modelo organizacional de 6 niveles |
| **2. Configuración de plataforma** | Capacidades parametrizables globales y plantillas base | Administrador Global | Catálogos globales (países, monedas, idiomas, unidades), plantillas de industria, límites por licencia, modelos de IA disponibles |
| **3. Configuración de tenant** | La adaptación de cada empresa | Administrador de Empresa | Catálogos propios, tipos de activo con sus atributos, formularios, workflows, reglas, notificaciones, branding, integraciones, roles |
| **4. Configuración de usuario** | Preferencias personales | Cada usuario | Idioma, zona horaria, formato de fecha, dashboard personal, favoritos, filtros guardados, canales de notificación preferidos, contexto por defecto |

**Regla de resolución:** Usuario → Tenant → Plataforma → Valor por defecto del producto. La capa más específica gana, pero **jamás puede violar la capa Core** (un tenant puede renombrar "OT" como "Aviso"; no puede hacer que las OTs cerradas sean editables).

## 3. Qué es Core y qué es configurable (frontera explícita)

**Core — no configurable jamás:**
- La existencia y semántica de los agregados y eventos de dominio (ETS-003).
- Asignaciones con vigencia e historial; los activos nunca "pertenecen" de forma permanente.
- Auditoría append-only y correcciones por eventos compensatorios.
- Evaluación de permisos en el contexto organizacional activo; denegado por defecto.
- Numeración por folios inmutables y consecutivos por tenant.
- Aislamiento total entre tenants.
- La IA nunca escribe; solo propone.

**Configurable — nunca programado por cliente:**
- Catálogos (→ `13_CATALOG_ARCHITECTURE.md`), tipos de activo y sus atributos dinámicos.
- Formularios y checklists (→ `03_DYNAMIC_FORMS.md`).
- Estados, transiciones, aprobaciones y SLAs de los procesos (→ `04_WORKFLOW_ENGINE.md`).
- Reglas de automatización (→ `05_RULES_ENGINE.md`).
- Notificaciones, dashboards, branding, módulos activos, integraciones, comportamiento de la IA (→ docs 06–11).

## 4. Mapa de motores

```text
                    ┌─────────────────────────────────────────┐
                    │        CONFIGURATION ENGINE (02)         │
                    │  registro central, versionado, herencia,  │
                    │  entornos, import/export, auditoría        │
                    └──────┬──────────┬───────────┬────────────┘
        alimenta a todos   │          │           │
   ┌──────────┬────────────┼──────────┼───────────┼────────────┬──────────┐
   ▼          ▼            ▼          ▼           ▼            ▼          ▼
 CATALOG   DYNAMIC      WORKFLOW    RULES     NOTIFICATION  DASHBOARD  BRANDING
 (13)      FORMS (03)   (04)        (05)      (06)          (07)       (08)
   ▲          ▲            ▲          ▲           ▲            ▲          ▲
   └──────────┴────────────┴──────────┴───────────┴────────────┴──────────┘
                    │                     │                  │
              FEATURE FLAGS (09)   INTEGRATION (10)    AI CONFIG (11)
                    └───────── TENANT CONFIGURATION (12) ─────────┘
```

- El **Configuration Engine** es la base común: todos los demás motores guardan sus definiciones en él y heredan su versionado, publicación y auditoría.
- Los motores **se componen, no se acoplan**: una regla (05) puede lanzar un workflow (04) que usa un formulario (03) cuyo resultado notifica (06) y aparece en un dashboard (07). Cada motor conoce a los otros solo por sus contratos publicados.
- El vocabulario común de todos los motores son los **Domain Events de ETS-003**: las reglas escuchan eventos, los workflows los emiten, las notificaciones los enrutan.

## 5. Ciclo de vida de toda configuración

Todo objeto de configuración (un catálogo, un formulario, un workflow, una regla…) comparte el mismo ciclo:

1. **Borrador** — se diseña sin afectar la operación.
2. **Validación** — la plataforma verifica integridad (referencias, ciclos, permisos, SoD).
3. **Publicación** — se convierte en una **versión inmutable** con vigencia; lo que estaba en vuelo termina con la versión con la que empezó.
4. **Vigencia y reemplazo** — una nueva versión la sustituye hacia adelante; nunca se reescribe el pasado.
5. **Retiro** — deja de ofrecerse para uso nuevo; el histórico sigue legible para siempre.

Cada transición es un evento auditado (quién, cuándo, qué cambió, versión anterior/nueva, motivo).

## 6. Gobierno

- **Roles de configuración** distintos de los operativos: diseñar un workflow ≠ ejecutarlo. Aplican SoD (quien diseña una cadena de aprobación no puede autoaprobarse en ella).
- **Entornos de configuración:** cada tenant dispone de un espacio de **ensayo** (sandbox) donde probar formularios, workflows y reglas con datos de prueba antes de publicar.
- **Plantillas de industria:** paquetes de configuración predefinidos (minería, construcción, flota, planta) que aceleran el arranque; se clonan, nunca se comparten en vivo entre tenants.
- **Portabilidad:** toda la configuración de un tenant es exportable/importable como paquete versionado (respaldo, réplica a otro tenant del mismo grupo, migración).

## 7. Índice de la serie ETS-005

| Doc | Motor |
|---|---|
| `02_CONFIGURATION_ENGINE.md` | Motor central de configuración |
| `03_DYNAMIC_FORMS.md` | Formularios dinámicos |
| `04_WORKFLOW_ENGINE.md` | Workflows y aprobaciones |
| `05_RULES_ENGINE.md` | Reglas de automatización |
| `06_NOTIFICATION_ENGINE.md` | Notificaciones |
| `07_DASHBOARD_ENGINE.md` | Dashboards |
| `08_BRANDING_ENGINE.md` | Marca e identidad |
| `09_FEATURE_FLAGS.md` | Activación de módulos |
| `10_INTEGRATION_ENGINE.md` | Integraciones |
| `11_AI_CONFIGURATION.md` | Configuración de IA |
| `12_TENANT_CONFIGURATION.md` | Qué configura cada empresa |
| `13_CATALOG_ARCHITECTURE.md` | Arquitectura de catálogos |
| `14_CONFIGURATION_GUIDELINES.md` | Guía normativa de configuración |
