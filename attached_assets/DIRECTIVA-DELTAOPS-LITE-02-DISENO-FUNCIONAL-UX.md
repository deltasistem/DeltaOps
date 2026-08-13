# PROMPT 2 — DELTAOPS LITE: DISEÑO FUNCIONAL OPERACIONAL, ROLES, CENTROS DE COSTOS Y EXPERIENCIA OBJETIVO

Directiva de Dirección — NO implementar todavía.

Continuamos el programa DeltaOps Lite sobre el sistema DeltaOps existente.

El objetivo de esta fase es convertir el Discovery de DELTAOPS-LITE-01 en una especificación funcional y UX/UI concreta, pero sin modificar código, base de datos, contratos, RBAC, RLS, migraciones, workflows ni eliminar funcionalidades existentes.

Esta fase debe ser exclusivamente de diseño funcional, arquitectura UX y definición de comportamiento.

## Aclaración previa de Dirección (contexto vinculante)

No debemos diseñar DeltaOps Lite pensando en una estructura rígida de: Coordinador → asigna → técnico ejecuta → coordinador aprueba. Porque en algunos centros eso no existe y terminaríamos creando doble trabajo artificial.

La solución correcta es que los roles y responsabilidades sean configurables por centro de costos/equipo, manteniendo trazabilidad. En Barranquilla, por ejemplo, una misma persona podría tener varias capacidades; en otro centro puede existir segregación entre asignador, ejecutor y aprobador.

Además, centro de costos, ubicación física y equipo/grupo de mantenimiento deben ser dimensiones independientes. Una máquina puede estar en un centro de costos, encontrarse temporalmente en otra ubicación y ser atendida por un equipo de mantenimiento diferente.

## 1. CONTEXTO DE NEGOCIO — CORRECCIÓN FUNDAMENTAL

DeltaOps será una plataforma multiempresa, multicentro de costos y multisitio para gestionar mantenimiento de: maquinaria amarilla; vehículos; equipos móviles; generadores; equipos estáticos; bandas transportadoras; tolvas; máquinas empacadoras; máquinas cocedoras de sacos; otros equipos industriales.

La operación de Delta Logística puede tener equipos ubicados en diferentes lugares y atendidos por diferentes equipos/personas de mantenimiento.

Por lo tanto: NO asumir una estructura organizacional única.

No debe existir una dependencia obligatoria de: Empresa → Un único Coordinador de Mantenimiento → Técnicos.

La aplicación debe soportar diferentes modelos operativos. Ejemplo:

- Centro A: Coordinador → Supervisor → Técnicos
- Centro B: Supervisor → Técnicos
- Centro C: Responsable operativo → Técnico
- Centro D: (compacto)

Una misma persona puede: asignar; ejecutar; revisar; aprobar/cerrar. Esto no debe considerarse automáticamente un error, porque puede ser necesario en centros pequeños.

Lo importante es que DeltaOps mantenga: trazabilidad; identidad del usuario; fecha/hora; acción realizada; rol/capacidad con la que actuó; historial de cambios; evidencia cuando corresponda.

## 2. CENTRO DE COSTOS NO ES LO MISMO QUE UBICACIÓN

Diseñar explícitamente estas dimensiones como conceptos diferentes:

- **Centro de costos**: dimensión administrativa/económica a la que pertenece el equipo o actividad. Ej.: Operaciones Barranquilla, Operaciones Cartagena, Puerto, Bodega, Logística.
- **Ubicación**: dónde se encuentra físicamente el activo. Ej.: Barranquilla, Patio principal, Taller, Zona de cargue, Puerto.
- **Equipo/grupo de mantenimiento**: quién atiende técnicamente el activo. Ej.: Mantenimiento Barranquilla, Mantenimiento Cartagena, Mantenimiento Puerto, Mantenimiento Industrial.
- **Responsable**: una persona concreta cuando aplique.

No mezclar estos conceptos. Un activo podría tener: Activo: Excavadora CAT 320 / Centro de costos: Operaciones Barranquilla / Ubicación actual: Patio Barranquilla / Equipo de mantenimiento: Mantenimiento Maquinaria Amarilla / Responsable: Juan Pérez. Y posteriormente cambiar de ubicación sin cambiar necesariamente de centro de costos o equipo de mantenimiento.

## 3. DISEÑAR DELTAOPS LITE ALREDEDOR DEL PROCESO, NO DE LOS MÓDULOS

La navegación actual expone demasiados módulos técnicos. No queremos que el usuario tenga que pensar «¿Esto pertenece a Correctivo, Preventivo, Órdenes o Utilización?». Queremos que piense: «Tengo que revisar mi máquina», «Mi máquina tiene una falla», «Tengo que hacer este mantenimiento».

Diseñar la experiencia alrededor de: EQUIPO → PREOPERACIONAL → CHECKLIST → RESULTADO → HALLAZGO → OT → ASIGNACIÓN → EJECUCIÓN → REVISIÓN → CIERRE → HISTORIAL → INDICADORES.

Los módulos existentes deben permanecer como capacidades internas del sistema, pero no necesariamente como elementos principales de navegación.

## 4. FLUJO PRINCIPAL: PREOPERACIONAL

Diseñar como una de las experiencias centrales de DeltaOps Lite.

Inicio: el usuario selecciona o escanea el equipo. Debe poder llegar mediante: listado de equipos; QR del activo; acceso directo desde «Mis equipos»; acceso desde una tarea pendiente.

Después: Seleccionar equipo → Identificar operador/usuario → Seleccionar checklist aplicable → Ejecutar checklist.

## 5. CHECKLIST

El checklist debe ser extremadamente sencillo para operación móvil. Cada ítem debe permitir, según corresponda: ✓ Cumple / ✕ No cumple / ⚠ No aplica.

Cuando exista incumplimiento: No cumple → Descripción → Foto/evidencia → Observación → Severidad.

No pedir información innecesaria. El usuario operativo no debe enfrentarse a un formulario administrativo complejo.

## 6. RESULTADO DEL PREOPERACIONAL

Definir claramente:

- **APTO**: todos los elementos críticos cumplen. Resultado: 🟢 EQUIPO APTO PARA OPERAR. Registrar: usuario; fecha; hora; equipo; checklist; resultado; evidencias.
- **NO APTO**: existe una condición crítica que impide operar. Resultado: 🔴 EQUIPO NO APTO. Debe generar automáticamente el flujo correspondiente de mantenimiento/hallazgo.
- **APTO CON OBSERVACIONES**: si la organización decide permitir esta condición: 🟡 APTO CON OBSERVACIONES. Las condiciones deben quedar registradas y trazables.

No inventar reglas de seguridad que no estén soportadas por los requisitos actuales. Si una regla depende del negocio, documentarla como decisión pendiente.

## 7. HALLAZGO → ORDEN DE TRABAJO

Este es uno de los objetivos principales. Cuando un checklist detecte una condición que requiera mantenimiento: CHECKLIST → HALLAZGO → CLASIFICACIÓN → ORDEN DE TRABAJO.

La OT debe conservar la procedencia: Origen: PREOPERACIONAL / Checklist / Ítem / Hallazgo / Activo / Usuario / Fecha.

No crear información duplicada innecesariamente. Utilizar las capacidades actuales de Correctivo/Órdenes.

## 8. ROLES Y RESPONSABILIDADES

NO crear una jerarquía rígida. Separar conceptualmente las **Capacidades**: Puede ejecutar / Puede asignar / Puede supervisar / Puede aprobar/cerrar / Puede administrar / Puede consultar.

Una persona puede tener una o varias capacidades dependiendo de su rol/configuración. Ejemplo:

- Centro con estructura completa: Supervisor = Asignar + Supervisar + Aprobar; Técnico = Ejecutar.
- Centro pequeño: Responsable = Asignar + Ejecutar + Supervisar + Aprobar.

Esto no debe romper el sistema. Sin embargo, cuando una misma persona realiza varias etapas, DeltaOps debe conservar claramente la trazabilidad de cada acción.

## 9. SEGREGACIÓN DE FUNCIONES

No implementar una regla universal que diga «quien ejecuta nunca puede aprobar». Primero analizar el contexto organizacional.

La plataforma debe soportar ambos escenarios:

- Segregación: Asignador → Técnico → Supervisor → Aprobador.
- Operación compacta: Responsable → Ejecuta → Revisa → Cierra.

Si posteriormente la empresa decide imponer segregación obligatoria para determinados centros, activos o tipos de mantenimiento, debe poder configurarse como regla de negocio.

## 10. MULTICENTRO DE COSTOS

La experiencia debe permitir trabajar con múltiples centros de costos sin convertir la interfaz en un ERP. El usuario debe ver principalmente lo que corresponde a su contexto. Ejemplo:

> Mi operación — Centro de costos: OPERACIONES BARRANQUILLA — Equipos: 24 — Órdenes abiertas: 5 — Preoperacionales pendientes: 8 — Equipos fuera de servicio: 2

Un usuario autorizado para varios centros debe poder cambiar de contexto de manera clara. No duplicar equipos ni información simplemente porque pertenecen a diferentes centros.

## 11. EXPERIENCIA POR PERFIL

Diseñar conceptualmente al menos estas experiencias:

- **ADMINISTRADOR**: configuración; usuarios; centros; equipos; permisos; catálogos; indicadores; auditoría. Pero no mostrar todo en primera instancia.
- **RESPONSABLE / SUPERVISOR**: estado de equipos; preoperacionales; hallazgos; órdenes; asignación; seguimiento; indicadores operativos.
- **TÉCNICO**: Mis órdenes / Mis equipos / Ejecutar mantenimiento / Registrar horas / Registrar repuestos / Registrar evidencia / Cerrar trabajo.
- **OPERADOR**: el rol OPERADOR actualmente no existe como rol canónico. NO implementarlo todavía. Diseñar la experiencia propuesta para que Dirección pueda decidir posteriormente. Experiencia conceptual: Mis equipos → Iniciar preoperacional → Checklist → Reportar novedad. Sin acceso innecesario a administración, costos o configuración.
- **CONSULTA**: experiencia exclusivamente de lectura.

## 12. HOME / INICIO DE DELTAOPS LITE

Rediseñar conceptualmente el inicio. No queremos una pantalla llena de KPIs técnicos. Priorizar acciones. Ejemplo:

> Buenos días, Carlos — OPERACIÓN BARRANQUILLA — ¿Qué necesitas hacer?
> [ Iniciar preoperacional ] [ Reportar novedad ] [ Ver mis órdenes ] [ Ver equipos ]
> ESTADO OPERACIONAL: 🟢 18 equipos operativos · 🟡 3 con observaciones · 🔴 2 fuera de servicio
> PENDIENTES: 5 órdenes pendientes · 3 preoperacionales · 2 hallazgos críticos

El contenido debe cambiar según el perfil.

## 13. EXPERIENCIA MÓVIL

El operador y técnico probablemente utilizarán teléfono. Diseñar mobile-first para: checklist; QR; evidencia fotográfica; órdenes; ejecución; cierre; consulta rápida.

Evitar: tablas gigantes; formularios interminables; filtros excesivos; menús horizontales; información técnica innecesaria.

## 14. REDISEÑO VISUAL

La nueva experiencia debe conservar la identidad DELTA, pero mejorar considerablemente: jerarquía visual; tipografía; espaciado; botones; estados; formularios; tarjetas; tablas; navegación; iconografía; feedback; mensajes de éxito/error; estados vacíos; loaders; responsive; tema claro; tema oscuro.

MUY IMPORTANTE — corregir específicamente los problemas visuales observados: logo visible correctamente en claro y oscuro; textos con contraste adecuado; `<select>` y controles nativos correctamente tematizados; opciones legibles; botones claramente diferenciados; estados APTO / NO APTO / OBSERVACIÓN visualmente claros; navegación coherente.

No introducir un nuevo sistema visual independiente. Utilizar el Design System existente y sus tokens `--do-*`.

## 15. NO HACER TODAVÍA

Durante esta fase NO: modificar base de datos; crear migraciones; cambiar contratos; cambiar RLS; cambiar RBAC; eliminar módulos; eliminar pantallas; modificar endpoints; modificar lógica de negocio; crear el rol OPERADOR; implementar el nuevo flujo; reescribir componentes masivamente.

Primero queremos aprobar el diseño.

## 16. MAPEO CON LA APLICACIÓN ACTUAL

Para cada experiencia propuesta, identificar:

| DeltaOps Lite | Capacidad existente |
|---|---|
| Equipos | Activos |
| Preoperacional | Dynamic Forms / Checklists |
| Hallazgos | Correctivo |
| OT | Órdenes |
| Repuestos | Inventario / Abastecimiento |
| Horas | Mano de obra / Utilización |
| Combustible | Utilización |
| Costos | Costos |
| Indicadores | Analytics |
| Evidencia | Evidencias existentes |
| QR | Activos / ejecución |
| Historial | Activos / OT |

No duplicar capacidades que ya existen.

## 17. PRINCIPIO FUNDAMENTAL

DeltaOps Lite no significa DeltaOps con menos código. Significa: DeltaOps con menor complejidad cognitiva para el usuario. El backend/core puede seguir siendo robusto. El usuario debe experimentar una aplicación: sencilla; rápida; clara; agradable; operacional; móvil; corporativa; consistente.

## 18. ENTREGABLE DE ESTA FASE

Crear exclusivamente: `docs/dgp/DELTAOPS-LITE-02-DISEÑO-FUNCIONAL-UX.md`

Debe contener: arquitectura de experiencia; navegación propuesta; mapa de pantallas; experiencia por perfil; modelo conceptual de capacidades; multicentro de costos; relación centro de costos / ubicación / equipo de mantenimiento; flujo preoperacional; checklist; hallazgo; generación de OT; asignación; ejecución; supervisión; aprobación/cierre; historial; indicadores; experiencia móvil; propuesta visual; tema claro/oscuro; componentes a reutilizar; componentes a rediseñar; funcionalidades actuales que simplemente dejan de ser visibles en la navegación principal; funcionalidades que NO deben tocarse; decisiones pendientes; roadmap de implementación posterior.

## 19. REVISIÓN INDEPENDIENTE

Antes de cerrar la fase: revisar que no se haya inventado funcionalidad existente; revisar que el flujo propuesto pueda componerse con las capacidades actuales; verificar que no se haya asumido un único modelo organizacional; verificar multicentro de costos; verificar separación conceptual entre centro de costos, ubicación y equipo de mantenimiento; verificar que no se haya creado una dependencia obligatoria del coordinador; verificar experiencia por rol; verificar que OPERADOR quede como decisión pendiente; verificar que no haya cambios de código; verificar que git status quede limpio salvo archivos permitidos.

Si existe una decisión de negocio que no pueda determinarse desde el código o documentación existente, DETENERSE y preguntarla a Dirección en lugar de inventarla.

## REGLA FINAL DE DIRECCIÓN

No implementes todavía. Primero entrega el Discovery/Diseño completo de DeltaOps Lite y detente para revisión de Dirección. No modificar código, DB, contratos, RBAC, RLS, migraciones, workflows ni infraestructura.

Quedo a la espera del informe de cierre de DELTAOPS-LITE-02.
