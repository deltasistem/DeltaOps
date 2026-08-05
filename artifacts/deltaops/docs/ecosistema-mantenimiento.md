# Ecosistema de Ejecución de Mantenimiento (DGP-010)

Guía funcional y técnica de la **integración** que teje en un único ecosistema
operativo las experiencias ya existentes de DeltaOps: **Activos** (DGP-008),
**Órdenes de Trabajo** (DGP-009), **Técnicos/Supervisores/Recursos**,
**Formularios/Checklist/Evidencias** (Dynamic Forms), **Workflow** y la
**Shared Platform (QR)**.

> **DGP-010 es una fase de COMPOSICIÓN, no un módulo nuevo.** No añade dominio,
> persistencia, CQRS ni infraestructura. Reutiliza el corpus congelado y su API.
> No se introdujeron endpoints nuevos: todas las superficies se alimentan del
> read model YA existente. No hay dashboards, analítica, BI, IA ni informes.

> **Sin credenciales.** Este documento no contiene usuarios, contraseñas ni
> secretos. Las credenciales de desarrollo del entorno **nunca** se documentan.

---

## 1. Mapa del ecosistema

| Superficie | Ruta | Descripción |
|---|---|---|
| **Centro Global de Mantenimiento** | `/centro` | Consola operacional única: órdenes, activos, técnicos, SLA, prioridades, estados y alertas. |
| **Vista 360° del Activo** | `/activos/:id` (pestaña *Órdenes*) | Toda la actividad de mantenimiento del activo: OT abiertas/cerradas, próximos mantenimientos y SLA. |
| **Ejecución integrada** | `/ordenes/:id` (pestañas *Activo* y *Cronología*) | El técnico consulta activo, actividad y cronología unificada sin salir de la OT. |
| **Alta contextual de OT** | `/ordenes/nueva?activo=…` | Wizard con activo/ubicación pre-rellenados desde el QR o la Vista 360°. |

Todas las superficies se montan sobre los *Shells* existentes (`ShellOrdenes` /
`ShellActivos`), usan **exclusivamente** el Design System (`@workspace/design-system`)
y tokens `--do-*`, y respetan el patrón offline por módulo.

---

## 2. Navegación contextual profunda

La conexión entre Activos ↔ Órdenes ↔ QR se centraliza en funciones **puras** en
`src/lib/ecosistema/deep-links.ts`, que **componen rutas ya existentes** (no crean
rutas nuevas) añadiendo estado inicial vía *query-string*:

```
urlActivo(id)                 → /activos/:id
urlActivoTab(id, "ordenes")   → /activos/:id?tab=ordenes
urlOrden(id)                  → /ordenes/:id
urlOrdenTab(id, "activo")     → /ordenes/:id?tab=activo
urlNuevaOrden({ activo, … })  → /ordenes/nueva?activo=…
urlOrdenesDeActivo(id)        → /ordenes?activo=:id
```

Las pestañas del Design System aceptan `porDefecto`, por lo que `?tab=` abre
directamente la sección enlazada. El wizard de alta lee el contexto con
`prefillDesdeUrl(borrador, search)` (los parámetros de la URL tienen prioridad
sobre el borrador guardado).

### Flujo QR → activo → nueva OT

```
Escanear QR (platform.qr.resolve) → código de plataforma → activo
   → Vista 360° del activo → "Nueva orden para este activo"
   → /ordenes/nueva?activo=…&activoEtiqueta=…  (activo pre-anclado)
```

---

## 3. Centro Global de Mantenimiento (`/centro`)

Consola **operacional** (no un dashboard). Compone `useOrdenesGlobal` (listado del
read model) y deriva en cliente:

- **Indicadores operativos**: órdenes abiertas, críticas, SLA vencido/en riesgo,
  técnicos con carga.
- **Alertas**: SLA vencido (escalamiento inmediato) y en riesgo (priorizar).
- **Cola operativa**: OT abiertas ordenadas por riesgo de SLA, con filtro por
  nivel; deep links a activo y a la ficha de ejecución.
- **SLA**: OT vencidas/críticas/en riesgo con sugerencia de escalamiento.
- **Técnicos**: carga por responsable.
- **Activos**: activos con OT abiertas y acceso a su Vista 360°.

---

## 4. SLA operacional (sin analítica)

`src/lib/ecosistema/sla.ts` deriva el **estado puntual** del compromiso a partir
del `datos.sla` que ya expone el read model. `estadoSla(orden, ahoraMs)` devuelve
`riesgo` (`vencido` / `critico` / `riesgo` / `en-plazo` / `sin-sla`), tiempo
restante humano y si procede **escalar** (vencido o crítico en OT no cerradas).
La fecha se **inyecta** para pruebas deterministas. No hay métricas agregadas,
tendencias ni reporting.

---

## 5. Timeline unificado

`src/lib/ecosistema/timeline.ts` expone `fusionarEcosistema(activo, historial,
bitacora)`, función **pura** que combina la *Shared Timeline* del activo con el
historial + bitácora de la orden en una única línea ordenada por `ocurridoAt`.
Reutiliza `fusionarCronologia` para la parte de la orden y marca la `fuente`
(`Activo` / `Orden`) de cada evento. Se usa en la pestaña *Cronología* de la OT.

---

## 6. Offline First

Las nuevas superficies son de **lectura compuesta** sobre endpoints existentes;
no introducen capturas nuevas. Las capturas de la OT (checklist, formulario,
evidencias, bitácora, transiciones) siguen encolándose con el patrón offline por
módulo ya establecido en DGP-009 (namespace `ordenes`, comando idempotente por
`opId`). Los lectores degradan con elegancia (`toleraNoEncontrado`) cuando el
detalle del activo no está disponible, mostrando la referencia.

---

## 7. Arquitectura de la composición

```
src/lib/ecosistema/
  deep-links.ts   · rutas contextuales (puro)
  timeline.ts     · fusión activo+orden (puro)
  sla.ts          · estado operativo del SLA (puro)
  hooks.ts        · hooks de composición (reutilizan ordenesFetch/activosFetch)

src/pages/
  centro-mantenimiento.tsx     · Centro Global (consola operacional)
  ficha/tab-ordenes.tsx        · Vista 360° · pestaña Órdenes
  ordenes/tab-activo.tsx       · Ejecución integrada · pestaña Activo
  ordenes-ficha.tsx            · Cronología unificada (extensión)
  ordenes-nueva.tsx            · prefill contextual (extensión)
  activos-ficha.tsx            · pestaña Órdenes (extensión)
```

**Reglas respetadas:** subpath `@workspace/dynamic-forms/definicion` (nunca el
barrel), pestañas del DS que montan todos los paneles (una consulta, derivación
en cliente), sin *shells* ni *layouts* nuevos, accesibilidad AA (roles/`aria-*`,
navegación por teclado de las pestañas del DS) y diseño responsive con tokens.

---

## 8. Pruebas

Todas se integran en el pipeline de vitest de `deltaops` (0 *skipped*):

| Archivo | Cubre |
|---|---|
| `ecosistema-deep-links.test.ts` | Rutas contextuales y codificación segura. |
| `ecosistema-timeline.test.ts` | Fusión y orden cronológico activo+orden. |
| `ecosistema-sla.test.ts` | Riesgo, escalamiento y tolerancia del SLA. |
| `ecosistema-prefill.test.ts` | Pre-relleno contextual del wizard. |
| `ecosistema-360.test.tsx` | Vista 360°: agrupación y deep link de alta. |
| `ecosistema-ejecucion-activo.test.tsx` | Pestaña Activo y degradación 404. |
| `ecosistema-centro.test.tsx` | Consola: indicadores, alertas y vacío. |
| `ecosistema-dependencias.test.ts` | Clasificación OT↔OT, impacto y secuencia. |
| `ecosistema-dependencias-ui.test.tsx` | Pestaña de dependencias y alerta de bloqueo. |
| `ecosistema-agenda-integrada.test.ts` | Unión agenda+órdenes, filtros por capa y SLA. |
| `ecosistema-timeline-medidor.test.ts` | Lecturas de medidor en la línea temporal. |
| `ecosistema-campo.test.tsx` | Barra táctil y captura de geolocalización. |
| `ecosistema-qr-unificado.test.tsx` | Flujo QR único: navegación + lectura + evidencia. |
| `ecosistema-supervisor-panel.test.tsx` | Gestión in-place del supervisor (Drawer). |

---

## 8bis. Composición de la Ronda 2 (puntos 6, 7, 9, 10, 11, 13)

- **Calendario operacional integrado (6):** `/ordenes/planificacion` une la agenda
  con el read model de órdenes (`integrarAgenda`), mostrando activo, prioridad,
  cuadrilla, ventana y **señal de SLA** por tarjeta, con capas/filtros por técnico,
  cuadrilla, activo y riesgo de SLA. Sin fuentes nuevas.
- **Dependencias OT↔OT (7):** `analizarDependencias` clasifica las relaciones
  (`GET /:id/dependencias`) en bloqueantes/dependientes/relacionadas, deriva el
  impacto y la secuencia de ejecución, y alerta «OT lista pero bloqueada». Pestaña
  en la ficha + señal en el Centro Global. Alta de dependencia vía `crear-relacion`.
- **Supervisor in-place (11):** `PanelSupervisor` (Drawer del DS) abre la OT y su
  activo sin navegar; mueve prioridad (`editar`) y gestiona esperas (`bitácora`).
- **Flujo QR unificado (13):** `MenuAccionesEscaneo` ofrece desde un único escaneo:
  abrir activo, historial, órdenes, crear OT, **registrar lectura de medidor**
  (`actualizar-horometro/odometro`, monótono e idempotente al reintentar) y
  **registrar evidencia** (Attachment de plataforma). Convergen `/activos/escanear`
  y `/ordenes/escanear`.
- **UX móvil de campo (9):** barra inferior fija con objetivos ≥48px, acciones a
  una mano, captura de foto, firma (canvas) y geolocalización, en la ejecución.
- **Timeline con medidores (10):** `fusionarEcosistema` incorpora y resalta las
  lecturas de horómetro/odómetro proyectadas en el historial del activo.

---

## 9. Casos de uso

1. **Supervisor** abre `/centro`, ve SLA vencido, entra a la OT y reasigna.
2. **Técnico** escanea el QR de un activo, abre su Vista 360°, crea una OT ya
   anclada al activo y la ejecuta consultando manuales sin salir de la ficha.
3. **Planificador** revisa próximos mantenimientos de un activo desde su 360°.
4. **Auditor** revisa la cronología unificada (activo + orden) de una OT.
