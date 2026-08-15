# DELTAOPS LITE · Manual de Usuario (§27)

> Manual funcional para usuarios finales. Español formal. **No contiene
> credenciales.** Describe la aplicación **real** (páginas de
> `artifacts/deltaops/src/pages`). La autorización real la impone siempre el
> backend: ocultar una opción en la interfaz **no** sustituye al control de
> acceso; una operación no autorizada devuelve **403** aunque la pantalla se
> muestre.
>
> **Roles del sistema:** `SUPER_ADMIN` (super administrador SaaS),
> `TENANT_ADMIN` (administrador de empresa), `SUPERVISOR`, `PLANIFICADOR`,
> `TECNICO`, `CONSULTA` (solo lectura).
>
> Este documento está estructurado en 28 secciones para su posterior conversión
> a PDF. Cada pantalla importante indica: **para qué sirve**, **quién puede
> usarla**, **qué muestra**, **botones y su efecto**, **qué datos
> modifica/genera** y **qué hacer ante error**.

---

## Tabla de contenido

1. Introducción y conceptos
2. Roles y permisos
3. Inicio de sesión
4. Recuperación de contraseña
5. Aceptar invitación
6. Pantalla de inicio (aterrizaje por rol)
7. Perfil y cambio de contraseña
8. Navegación y estructura general
9. Módulo Activos — Listado
10. Módulo Activos — Ficha del activo
11. Activos — Nuevo activo
12. Preoperacional (checklist operacional)
13. Centro Global de Mantenimiento
14. Módulo Órdenes — Centro de Operaciones
15. Órdenes — Ficha de la orden
16. Órdenes — Planificación
17. Órdenes — Supervisión
18. Módulo Correctivo (novedades y diagnóstico)
19. Módulo Preventivo (programas)
20. Módulo Planes de mantenimiento
21. Módulo Inventario
22. Módulo Abastecimiento (compras)
23. Módulo Utilización (lecturas y tanqueos)
24. Módulo Analytics (indicadores y tableros)
25. Administración de empresa — Usuarios
26. Administración de empresa — Configuración
27. Administración de empresa — Datos históricos (importador)
28. Administración global SaaS y consolas técnicas (SUPER_ADMIN)

---

## 1. Introducción y conceptos

DeltaOps es una plataforma de gestión de mantenimiento de activos. El trabajo
gira en torno al **equipo/activo**: desde él se ejecutan preoperacionales, se
generan novedades correctivas, se programan preventivos, se emiten órdenes de
trabajo y se registran lecturas y tanqueos. La aplicación es **multi-empresa**
(cada empresa es un *tenant* aislado); un usuario opera dentro de la empresa de
su sesión activa.

**Conceptos clave:** *activo* (equipo), *orden de trabajo (OT)*, *preoperacional*
(checklist previo al uso), *novedad correctiva*, *programa preventivo*, *plan de
mantenimiento*, *lectura de medidor*, *tanqueo* (carga de combustible),
*indicador/analytics*.

**Estados honestos:** la aplicación nunca inventa datos. Muestra explícitamente
estados de *cargando*, *vacío* y *error*, y funciona *offline* con colas de
sincronización por empresa en varios módulos.

---

## 2. Roles y permisos

| Rol | Nombre | Alcance principal |
|---|---|---|
| SUPER_ADMIN | Super Administrador | Administración global de la plataforma (todas las empresas) y consolas técnicas |
| TENANT_ADMIN | Administrador de Empresa | Administración total dentro de su empresa: usuarios, configuración, históricos |
| SUPERVISOR | Supervisor | Gestión operativa completa (sin administrar la empresa) |
| PLANIFICADOR | Planificador | Planificación y gestión de trabajo |
| TECNICO | Técnico | Ejecución operativa del trabajo asignado |
| CONSULTA | Consulta | Solo lectura |

- Las superficies exclusivas de SUPER_ADMIN (plataforma, motores, consola de
  activos, administración SaaS) se ocultan al resto de roles y además el backend
  las rechaza con 403.
- Los **módulos visibles** dependen de los *entitlements* de la empresa: si un
  módulo no está habilitado, no aparece en la navegación y el backend lo rechaza
  igualmente.

---

## 3. Inicio de sesión

- **Para qué sirve:** autenticar al usuario e iniciar la sesión de su empresa.
- **Quién puede usarla:** cualquier usuario con cuenta activa.
- **Qué muestra:** logo, campo de correo, campo de contraseña con mostrar/ocultar,
  botón de acceso con estado de carga y enlace de recuperación.
- **Botones y su efecto:**
  - *Iniciar sesión*: valida credenciales y crea la sesión (cookie segura del
    backend). Si la identidad pertenece a **varias empresas**, aparece un paso de
    **selección de empresa** (respuesta `409 SELECT_TENANT`).
  - *Recuperar contraseña*: lleva a la pantalla de recuperación.
- **Qué genera:** una sesión servidor (cookie `httpOnly`); no persiste
  contraseñas en el navegador. No hay casilla "recordarme" (la vigencia la
  controla el backend, 8 horas).
- **Ante error:** mensajes diferenciados y accesibles — credenciales inválidas,
  usuario deshabilitado, empresa no operativa o sesión expirada. Reintente o use
  recuperación.

---

## 4. Recuperación de contraseña

- **Para qué sirve:** solicitar un enlace para restablecer la contraseña.
- **Quién puede usarla:** cualquier persona (pantalla pública).
- **Qué muestra:** campo de correo y confirmación.
- **Botón:** *Enviar*: dispara el envío del correo de recuperación.
- **Comportamiento anti-enumeración:** el mensaje de éxito es **idéntico** exista
  o no la cuenta (no revela si el correo está registrado).
- **Restablecer** (`/restablecer`): con el enlace recibido, el usuario define una
  nueva contraseña con los requisitos visibles.
- **Ante error:** un token inválido/expirado se comunica de forma clara; solicite
  un nuevo enlace.

---

## 5. Aceptar invitación

- **Para qué sirve:** activar la cuenta de un usuario invitado a una empresa.
- **Quién puede usarla:** el invitado, desde el enlace `/invitacion?token=…`.
- **Qué muestra:** campos de nombre y contraseña.
- **Botón:** *Aceptar*: activa la cuenta y redirige a iniciar sesión.
- **Qué genera:** una identidad activa con membresía en la empresa invitante.
- **Ante error:** token inválido/expirado/revocado se informa de forma accesible;
  solicite una nueva invitación al administrador de su empresa.

---

## 6. Pantalla de inicio (aterrizaje por rol)

- **Para qué sirve:** llevar a cada usuario a su superficie principal.
- **Quién:** todos los roles autenticados.
- **Qué muestra / comportamiento:** el aterrizaje se decide por el **rol
  canónico** de la sesión:
  - **SUPER_ADMIN** → consola global técnica (salud, uptime, readiness,
    plataforma).
  - **Resto de roles** → experiencia empresarial de su empresa (navegación por
    proceso: Inicio, Mantenimiento, Equipos, Inventario, Indicadores…).
- **Ante error:** si la sesión expira, se redirige a inicio de sesión.

---

## 7. Perfil y cambio de contraseña

- **Para qué sirve:** ver la identidad, empresa y rol; cambiar la contraseña.
- **Quién:** cualquier usuario autenticado.
- **Qué muestra:** datos de identidad, empresa activa, rol y formulario de cambio
  de contraseña con requisitos visibles.
- **Botón:** *Cambiar contraseña*: actualiza la credencial (el backend valida los
  requisitos).
- **Qué modifica:** la contraseña de la propia cuenta.
- **Ante error:** requisitos no cumplidos o contraseña actual incorrecta se
  muestran junto al campo correspondiente.

---

## 8. Navegación y estructura general

- La aplicación usa un *AppShell* con navegación **agrupada por proceso** y un
  selector de empresa (si el usuario pertenece a varias).
- **Preferencia de apariencia** (Claro/Oscuro/Automático) disponible y
  persistida en el navegador.
- Los módulos con superficie `…/sincronizacion` permiten trabajar **offline** y
  sincronizar después; las colas están **aisladas por empresa**.
- Muchas pantallas de listado comparten patrón: **tabla + tarjetas**, búsqueda,
  filtros (formularios dinámicos), ordenamiento, paginación y estados
  vacío/error/offline.

---

## 9. Módulo Activos — Listado

- **Para qué sirve:** consultar y gestionar el inventario de equipos.
- **Quién:** roles con el módulo Activos habilitado (lectura para CONSULTA;
  escritura según rol).
- **Qué muestra:** listado de activos (tabla + tarjetas), búsqueda, filtros,
  ordenamiento y paginación. Rutas auxiliares: *árboles* de jerarquía,
  *escanear* (QR) y *sincronización*.
- **Botones:** *Nuevo* (crear activo), *Escanear* (abrir por QR), acceso a la
  ficha por fila.
- **Qué genera:** navega; no modifica datos hasta abrir/crear una ficha.
- **Ante error:** estado de error con reintento; si está offline, indica el modo.

---

## 10. Módulo Activos — Ficha del activo

- **Para qué sirve:** ver y operar toda la información de un equipo.
- **Quién:** lectura para todos los roles con el módulo; edición y transiciones
  de estado según rol.
- **Qué muestra:** datos, especificaciones, medidores, garantía, ubicación y
  responsable actuales, etiqueta **QR**, y pestañas: **Timeline** (hoja de vida),
  **Documentación**, **Relaciones**, **Históricos**, **Comentarios**, además de
  Órdenes, Planes, Preventivo, Correctivo y Preoperacional según el activo.
- **Botones y su efecto:**
  - *Editar*: modifica datos del activo.
  - *Transición de estado* (con confirmación): cambia el estado operativo.
  - *Comentar*, *Adjuntar documentación* (referencias), *Ver QR*.
- **Qué modifica/genera:** datos del activo, comentarios, relaciones y eventos en
  su hoja de vida (timeline).
- **Ante error:** los cambios no autorizados devuelven 403 mostrado
  honestamente; los conflictos de estado se explican.

---

## 11. Activos — Nuevo activo

- **Para qué sirve:** dar de alta un equipo.
- **Quién:** roles con permiso de escritura en Activos (no CONSULTA).
- **Qué muestra:** formulario de alta (datos, clasificación, ubicación…).
- **Botón:** *Guardar/Crear*: registra el activo.
- **Qué genera:** un nuevo activo y su entrada inicial de hoja de vida.
- **Ante error:** validaciones de campo junto a cada control.

---

## 12. Preoperacional (checklist operacional)

- **Para qué sirve:** ejecutar el checklist previo al uso de un equipo
  (mobile-first), anclado al activo.
- **Quién:** roles operativos (típicamente TECNICO/SUPERVISOR).
- **Qué muestra:** resuelve la **plantilla ACTIVA**, presenta el checklist
  agrupado por categoría con control **CUMPLE / NO CUMPLE / OBSERVACIÓN / NO
  APLICA**, barra de progreso y, al registrar, un **RESULTADO con veredicto**
  (texto, color e icono) **sellado por el backend**.
- **Botones:** control segmentado por ítem, *Registrar* (envía la ejecución).
- **Qué genera:** un registro preoperacional en la hoja de vida del activo. **No
  genera OT**: ante fallas, ofrece **prellenar una NOVEDAD en Correctivo** con la
  procedencia (activo → ítem → observación).
- **Ante error / offline:** encolable (única cola offline con namespace
  "preoperacional"); el veredicto y la criticidad los decide exclusivamente el
  backend.

---

## 13. Centro Global de Mantenimiento

- **Para qué sirve:** consola **operativa** única donde convergen órdenes,
  activos, responsables, SLA, prioridades, estados y alertas operativas.
- **Quién:** roles operativos y de supervisión.
- **Qué muestra:** composición del *read model* de Órdenes con navegación
  contextual (deep links); **no** es un dashboard analítico.
- **Botones:** filtros y enlaces contextuales a órdenes/activos.
- **Qué genera:** navegación; las acciones se realizan en las fichas destino.
- **Ante error:** estados honestos de carga/error.

---

## 14. Módulo Órdenes — Centro de Operaciones

- **Para qué sirve:** gestionar el ciclo de vida de las órdenes de trabajo.
- **Quién:** roles operativos; CONSULTA solo lee.
- **Qué muestra:** bandejas del ciclo de vida — *Mis órdenes, Pendientes, Nuevas,
  En ejecución, En espera, En validación, Próximas a vencer, Críticas,
  Canceladas, Cerradas* — con búsqueda, filtros y estados visuales.
- **Botones:** *Nueva orden*, acciones inmediatas por bandeja, *Escanear*,
  *Sincronización*.
- **Qué genera/modifica:** creación y transición de órdenes.
- **Ante error:** acciones no permitidas devuelven 403; offline encola.

---

## 15. Órdenes — Ficha de la orden

- **Para qué sirve:** operar una OT concreta.
- **Quién:** roles operativos/supervisión según la acción.
- **Qué muestra:** pestañas de **Ejecución**, **Activo**, **Dependencias** y
  **Documentación**; datos, estado, responsable y SLA.
- **Botones:** avanzar de estado, registrar ejecución, adjuntar documentación,
  gestionar dependencias.
- **Qué modifica/genera:** el estado y los registros de ejecución de la OT.
- **Ante error:** transiciones inválidas y permisos se comunican con claridad.

---

## 16. Órdenes — Planificación

- **Para qué sirve:** planificar y reprogramar trabajo.
- **Quién:** PLANIFICADOR / SUPERVISOR / administración.
- **Qué muestra:** **calendario semanal + agenda**, con reprogramación por
  **arrastrar y soltar** (accesible por teclado), conflictos visibles, ventanas y
  carga por técnico.
- **Botones/gestos:** arrastrar para reprogramar; alternativa por teclado.
- **Qué modifica:** la programación de órdenes (llama a *planificar*; degrada
  offline).
- **Ante error:** conflictos de agenda visibles; reintento offline.

---

## 17. Órdenes — Supervisión

- **Para qué sirve:** panel de supervisión de la operación de órdenes.
- **Quién:** SUPERVISOR / administración.
- **Qué muestra:** estado consolidado y acciones de supervisión sobre el *read
  model* de Órdenes.
- **Ante error:** estados honestos; acciones sujetas a permiso.

---

## 18. Módulo Correctivo (novedades y diagnóstico)

- **Para qué sirve:** registrar y tratar solicitudes correctivas (novedades) y su
  diagnóstico.
- **Quién:** roles operativos; CONSULTA solo lee.
- **Qué muestra:**
  - *Solicitudes* (listado): tabla + tarjetas, búsqueda, filtros
    (estado/origen/activo), paginación; puede llegar prellenado desde un
    preoperacional.
  - *Nueva solicitud*, *Escanear*, *Sincronización*.
  - *Diagnóstico*: captura (causas, modo/efecto, criticidad, impacto,
    recomendaciones) mediante **formulario dinámico** anclado a una plantilla y su
    versión; produce causa raíz y clasificación.
  - *Intervención*: ejecución de la solución.
- **Qué genera/modifica:** solicitudes correctivas, diagnósticos e
  intervenciones; puede derivar en OT.
- **Ante error / offline:** encolable; permisos aplicados por el backend.

---

## 19. Módulo Preventivo (programas)

- **Para qué sirve:** gestionar programas de mantenimiento preventivo.
- **Quién:** PLANIFICADOR / SUPERVISOR / administración; CONSULTA lee.
- **Qué muestra:** listado de programas (tabla + tarjetas, filtros por
  estado/tipo), *calendario*, ficha del programa, *actividad*, *escanear* y
  *sincronización*.
- **Botones:** *Nuevo programa*, edición, navegación a actividad/ficha.
- **Qué genera/modifica:** programas preventivos y su actividad.
- **Ante error:** estados honestos; permisos por rol.

---

## 20. Módulo Planes de mantenimiento

- **Para qué sirve:** definir y consultar planes de mantenimiento.
- **Quién:** planificación/administración; CONSULTA lee.
- **Qué muestra:** listado (tabla + tarjetas, filtros por tipo/estrategia/estado),
  *calendario*, ficha del plan y *sincronización*.
- **Botones:** *Nuevo plan*, edición, ficha.
- **Qué genera/modifica:** planes de mantenimiento.
- **Ante error:** validaciones y permisos honestos.

---

## 21. Módulo Inventario

- **Para qué sirve:** gestionar existencias, bodegas, movimientos, transferencias
  y conteos.
- **Quién:** roles operativos/administración; CONSULTA lee.
- **Qué muestra:** listado principal (tabla + tarjetas, búsqueda, filtros,
  paginación) y superficies de *bodegas*, *movimientos*, *transferencias*,
  *conteos*, *escanear* y *sincronización*; ficha de ítem con pestañas.
- **Botones:** *Nuevo*, registrar movimiento/transferencia/conteo, *Escanear*.
- **Qué genera/modifica:** existencias y sus movimientos.
- **Ante error / offline:** encola; permisos por rol.

---

## 22. Módulo Abastecimiento (compras)

- **Para qué sirve:** gestionar el ciclo de compras (solicitudes, proveedores,
  artículos, órdenes de compra).
- **Quién:** roles de abastecimiento/administración; CONSULTA lee.
- **Qué muestra:** *solicitudes* (tabla + tarjetas, filtros estado/prioridad),
  *proveedores*, *artículos*, *órdenes de compra*, *escanear* y *sincronización*,
  con sus fichas y formularios de alta.
- **Botones:** *Nueva solicitud/artículo/proveedor/orden*, edición, ficha.
- **Qué genera/modifica:** documentos de compra y catálogos asociados.
- **Ante error:** validaciones y permisos honestos.

---

## 23. Módulo Utilización (lecturas y tanqueos)

- **Para qué sirve:** registrar el uso de los equipos.
- **Quién:** roles operativos; CONSULTA lee.
- **Qué muestra:**
  - *Lecturas*: listado y *nueva lectura* de medidores.
  - *Tanqueos*: listado y *nuevo tanqueo* (carga de combustible).
  - *Resumen*: consolidado de utilización.
- **Botones:** *Nueva lectura*, *Nuevo tanqueo*.
- **Qué genera:** lecturas de medidor y registros de tanqueo (alimentan
  indicadores y la hoja de vida del activo).
- **Ante error:** validaciones de rango/consistencia; permisos por rol.

---

## 24. Módulo Analytics (indicadores y tableros)

- **Para qué sirve:** consultar indicadores y tableros de gestión.
- **Quién:** roles con Analytics habilitado (lectura).
- **Qué muestra:** *Home* con acceso a los tableros del sistema, a los tableros
  personalizados del usuario y al **catálogo de indicadores** (por categoría, con
  ficha por indicador). Existe un *editor de tableros* personalizados.
- **Botones:** abrir tablero/indicador, crear/editar tablero personalizado.
- **Qué genera/modifica:** definiciones de tableros personalizados del usuario;
  los indicadores se calculan sobre datos reales (nunca se inventan).
- **Ante error:** estados honestos de cargando/error/vacío.

---

## 25. Administración de empresa — Usuarios

- **Para qué sirve:** administrar los usuarios de la empresa.
- **Quién:** **TENANT_ADMIN** (y SUPER_ADMIN). Otros roles: el backend responde
  403.
- **Qué muestra:** listado con búsqueda/filtros, invitaciones y auditoría.
- **Botones y su efecto:**
  - *Crear / Invitar*: alta o invitación de un usuario.
  - *Editar*: cambia nombre y **rol**.
  - *Activar / Desactivar*: habilita o bloquea la cuenta.
  - *Forzar recuperación*: dispara restablecimiento de contraseña.
  - *Reenviar / Revocar invitación*.
- **Qué genera/modifica:** identidades, membresías, roles e invitaciones de la
  empresa.
- **Ante error:** operaciones sin permiso devuelven 403 mostrado honestamente.

---

## 26. Administración de empresa — Configuración

- **Para qué sirve:** configurar la empresa.
- **Quién:** **TENANT_ADMIN** (y SUPER_ADMIN).
- **Qué muestra:** idioma, zona horaria, moneda y formatos; **branding** (editor
  con vista previa, solo tokens seguros); **módulos habilitados** (solo lectura
  para TENANT_ADMIN); **notificaciones** (estado de correos); **auditoría** del
  tenant.
- **Botones:** *Guardar* por sección; editor de branding con vista previa.
- **Qué modifica:** preferencias y branding de la empresa. El backend **valida
  cada cambio** y rechaza CSS/valores de branding no seguros.
- **Ante error:** valores rechazados se explican; los módulos habilitados no son
  editables por TENANT_ADMIN (los gestiona SUPER_ADMIN).

---

## 27. Administración de empresa — Datos históricos (importador)

- **Para qué sirve:** importar datos históricos (combustible/tanqueos, checklists
  preoperacionales de cargadores/montacargas, horas-hombre/jornadas y planes de
  mantenimiento preventivo) mediante un asistente.
- **Quién:** **EXCLUSIVO de administración de empresa** — **TENANT_ADMIN /
  SUPER_ADMIN**. Cualquier otro rol recibe **403** en todos los pasos y sin
  sesión se recibe **401** (fail-closed, verificado).
- **Qué muestra — asistente de 8 pasos:**
  1. Tipos de fuente disponibles.
  2. Selección de archivo (de servidor o subida).
  3. **Analizar** (detección del tipo y encabezados).
  4. Vista previa.
  5. **Validar** (dry-run) con marcas ✓ / ⚠ / ✕ y reporte de exclusiones.
  6. Confirmación explícita.
  7. **Importar**.
  8. Resultado (conteos + registros omitidos).
- **Botones:** *Analizar*, *Validar*, *Confirmar/Importar*.
- **Qué genera/modifica:** registros históricos (hoja de vida en la línea de
  tiempo y proyecciones de módulo). **Idempotente:** reimportar el mismo archivo
  no crea duplicados (deduplicación por identificador determinista).
- **Ante error:** archivos no reconocidos o filas inválidas se reportan en la
  validación antes de importar; los sin permiso reciben 403.

---

## 28. Administración global SaaS y consolas técnicas (SUPER_ADMIN)

Superficies **exclusivas de SUPER_ADMIN** (ocultas para el resto y protegidas por
el backend con 403):

- **Administración SaaS** (`/administracion/saas`): lista de empresas, alta,
  cambio de estado (**ACTIVO / SUSPENDIDO / CERRADO**), módulos habilitados por
  empresa y notificaciones por empresa. Es administración, **no** un dashboard de
  negocio.
- **Plataforma** (`/plataforma`): consola técnica global — salud, uptime,
  readiness, capas e infraestructura.
- **Motores** y **Motores/Playground**: diagnóstico de los motores del sistema.
- **Consola de Activos** (`/consola-activos`): consola **técnica** de diagnóstico
  del módulo de activos (read models/proyecciones, eventos de dominio, políticas,
  catálogos, verificación de aislamiento RLS). No contiene KPIs ejecutivos.

**Botones/efecto:** en Administración SaaS, alta y cambio de estado de empresas y
gestión de módulos/notificaciones. Las demás consolas son de **lectura/
diagnóstico**.

**Ante error:** cualquier acceso indebido devuelve 403; los datos técnicos se
muestran con estados honestos.

---

> **Nota de veracidad:** este manual describe únicamente pantallas y acciones
> presentes en el código de la aplicación. No documenta funcionalidades
> inexistentes. Los flujos de escritura están sujetos al rol del usuario y a los
> *entitlements* de la empresa; la interfaz oculta lo no disponible, pero la
> autoridad final es siempre el backend.
