# 04_CONFIGURATION_DATA.md

> **DeltaOps — ETS-006 · v1.0** · Datos de configuración: cómo se comporta cada tenant.
> La arquitectura funcional está en ETS-005; aquí se define su tratamiento **como datos**.
> Documento de diseño. No implementa nada.

---

## 1. Definición

La configuración —formularios, workflows, reglas, dashboards, branding, feature flags, catálogos con semántica, roles— es **contenido versionado**, no software ni maestros. Se distingue de los otros dominios en que su unidad de cambio es la **publicación de versiones inmutables** (ETS-005/02).

## 2. Tratamiento como datos

1. **Versión inmutable = registro append-only.** El dominio de configuración es, en el fondo, un historial de versiones: los borradores mutan; lo publicado, jamás. Su historia es tan intocable como la auditoría.
2. **Los hechos apuntan a la versión.** Todo dato transaccional registra la versión de formulario/workflow/regla con la que se produjo. Consecuencia: **una versión referenciada por hechos existe para siempre** — retirada significa "no usar para hechos nuevos", nunca supresión.
3. **Resolución en cascada materializable:** la pregunta "¿qué configuración aplica aquí y ahora?" (usuario→proyecto→…→plataforma) es determinista y cacheable; la respuesta lleva la explicación de la herencia (por qué aplicó esa versión).
4. **Dependencias como grafo de datos:** las referencias entre objetos (workflow→formulario→catálogo) son datos consultables — el validador de publicación y los reportes de impacto ("qué se rompe si apago este módulo") se apoyan en ese grafo.
5. **Sandbox separado lógicamente:** la configuración de ensayo y sus datos ficticios viven aparte y no contaminan la analítica ni la auditoría operativa.

## 3. Distribución a los consumidores

| Consumidor | Cómo recibe la configuración |
|---|---|
| Web | Versión vigente resuelta al abrir el contexto; recarga ligera al publicarse nuevas versiones |
| **Móvil offline** | Paquete de configuración vigente descargado al dispositivo (plantillas de formularios, catálogos, workflows de sus procesos); el dispositivo declara qué versión tiene y trabaja con ella hasta sincronizar |
| Motores (reglas, notificaciones) | Suscritos a `ConfiguracionPublicada`; cambian de versión en frontera de instancia (lo en vuelo termina con su versión) |
| Integraciones | Mapeos y contratos versionados; la versión usada queda en la traza de cada intercambio |

Regla móvil: un hecho capturado offline con la versión N es **válido aunque ya exista N+1** — se registra con N (que sigue vigente para él) y la actualización aplica al siguiente uso.

## 4. Portabilidad y respaldo

- La configuración completa de un tenant es un **paquete exportable** (ETS-005/02): sirve como respaldo funcional, réplica entre tenants de un grupo y semilla de plantillas de industria.
- En recuperación de desastres, configuración publicada + auditoría de configuración se restauran íntegras: son patrimonio, no derivado (→ `15_BACKUP_RECOVERY.md`).

## 5. Propiedad

| Capa | Dueño |
|---|---|
| Plantillas de plataforma, catálogos globales, modelos de IA | Fabricante (Admin Global) |
| Toda la configuración del tenant | Admin Empresa y roles de configuración delegados por ámbito |
| Preferencias personales | Cada usuario |

La auditoría de cambios de configuración es del dominio Auditoría (`06_AUDIT_DATA.md`), con lectura total para el rol Auditor.
