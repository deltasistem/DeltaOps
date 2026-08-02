# 15 — Dashboard Service

> **DeltaOps — ESI-006 · v1.0** · El servicio de tableros: composición declarativa de vistas por rol y tenant, desde widgets que aportan los módulos.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. Propósito y modelo

El tablero es la portada del trabajo: el jefe de mantenimiento ve backlog y cumplimiento; el almacenista, quiebres de stock; la gerencia, KPIs de flota. El servicio compone; los módulos aportan.

| Concepto | Definición |
|---|---|
| **Widget declarado** | Aportado por un módulo o servicio: fuente de datos (consulta propia o KPI del doc 16), tipo de visualización (contador, lista, gráfico, semáforo), parámetros, permiso requerido |
| **Tablero** | Composición de widgets con disposición: plantillas por rol del producto + ajustes del tenant + preferencias del usuario, en ese orden de precedencia |
| **Resolución** | Al servir, cada widget evalúa capacidad y permiso del usuario: sin acceso → el widget no existe (ni hueco ni error) |

## 2. Reglas

1. **Los datos son de los dueños**: cada widget consulta su fuente declarada (plano de lectura del módulo o KPI Service) con los permisos del usuario; el Dashboard Service no almacena datos de negocio ni cachea por su cuenta lo que las fuentes gobiernan.
2. **Composición declarativa**: plantillas de tablero por rol como parte del producto (versionadas); el tenant ajusta dentro de lo permitido; el usuario personaliza lo personal. Sin editores que construyan consultas — los widgets son piezas cerradas parametrizables.
3. **KPIs solo del KPI Service** (doc 16): un widget de indicador referencia el KPI catalogado; jamás recalcula (la regla anti-bifurcación de ESI-005/13 §2.1, aplicada en la superficie).
4. **Presupuesto de carga**: el tablero declara su presupuesto (ESI-004/27 Q-01) y los widgets lentos se degradan individualmente (carga diferida, indicador de retraso) sin tumbar la portada.

## 3. Publicación obligatoria (los siete rubros)

- **Capacidades**: `tableros` (núcleo), `personalizacion_de_tableros` (ajustes de tenant/usuario) — separables.
- **Eventos**: ninguno de negocio en v1; telemetría de uso por métricas.
- **Contratos**: servir tablero resuelto; declaración de widgets (módulos); administración de plantillas (producto) y ajustes (tenant); preferencias (usuario).
- **Configuración**: plantillas habilitadas por tenant, widgets permitidos por rol, frecuencia de refresco por widget.
- **KPIs**: uso de tableros por rol/tenant, widgets más/menos vistos (insumo de producto), tiempo de carga por widget.
- **Permisos**: heredados por widget (§1 resolución); propios: `TABLEROS.TENANT.ADMINISTRAR`.
- **Consumidores**: todos los módulos y servicios como aportadores de widgets; todos los usuarios como lectores.

## Impacto sobre la implementación

DGP propio (composición, resolución, plantillas); los módulos declaran widgets apuntando a consultas/KPIs existentes — el tablero no crea rutas de datos nuevas.

## Dependencias

Doc 16 (KPIs); ESI-005/07 y /13; ESI-004/27; docs 17-20; ETS-001 (roles y jornadas).

## Riesgos

- El tablero como agujero de rendimiento (N widgets × M usuarios cada mañana); mitigación: presupuestos por widget, refresco configurado y degradación individual §2.4.

## Decisiones habilitadas

- Portadas por rol coherentes en todo el producto, ajustables sin código.
- Visibilidad de uso real de widgets como insumo de producto.

## Decisiones bloqueadas

- Prohibido que el tablero almacene o recalcule datos de negocio.
- Prohibidos constructores de consultas libres para usuarios.
- Prohibidos widgets sin permiso y capacidad declarados.

## Reusable Pattern

Widget declarado (fuente + visualización + permiso) + composición por precedencia producto/tenant/usuario: el patrón de toda superficie componible futura.

## Anti-Patterns

- Widgets con SQL o filtros arbitrarios definidos por el usuario final.
- Duplicar el mismo indicador en widgets de módulos distintos con datos distintos (bifurcación que el doc 16 existe para impedir).
- Tableros "de todo" por defecto que nadie lee.

## Knowledge Graph

- **ETS que consume**: ETS-001 (roles/jornadas), ETS-007 (frontera analítica).
- **ESI que consume**: ESI-004/27; ESI-005/07 y /13.
- **DGP que originará**: DGP-Tableros; catálogos de widgets en cada DGP-módulo.
- **ADR relacionados**: ADR de composición por precedencia (§2.2); ADR anti-bifurcación de KPIs (doc 16).
- **Módulos que reutilizarán este patrón**: todos aportan widgets; OT e Inventario dominan las portadas operativas.
