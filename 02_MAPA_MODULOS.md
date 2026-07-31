# 02_MAPA_MODULOS.md

> **SGMA — ETS-002 · v1.0** · Mapa completo de módulos de la plataforma EAM, organizados por dominio y clasificados por naturaleza.
> Clasificación: **Core · Operativo · Administrativo · Transversal · Analítico · IA**.
> Documento de diseño. No implementa nada.

---

## Leyenda de clasificación

| Tipo | Significado |
|---|---|
| **Core** | Núcleo estructural; prerequisito de todo el sistema. |
| **Operativo** | Ejecuta el negocio del día a día (mantenimiento, operación en campo). |
| **Administrativo** | Gestiona catálogos, personas, compras y configuración. |
| **Transversal** | Servicios compartidos por todos los módulos. |
| **Analítico** | Indicadores, tableros y reportería. |
| **IA** | Inteligencia y asistencia. |

---

## DOMINIO D0 · ORGANIZACIÓN — (Core)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Empresas | Datos de empresa, configuración, moneda/idioma por defecto | Core |
| Sedes | Sedes/plantas por empresa | Core |
| Operaciones | Operaciones (fertilizantes, carbón, portuaria, industrial) | Core |
| Proyectos | Proyectos por operación, vigencias | Core |
| Centros de costo | Centros de costo, jerarquía, vigencias | Core |
| Ubicaciones | Ubicaciones físicas/lógicas, jerarquía | Core |
| Estructura organizacional | Árbol empresa→sede→operación→proyecto→centro→ubicación | Core |

## DOMINIO D7 · SEGURIDAD Y ACCESO — (Core)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Autenticación | Login, sesión, recuperación, MFA (preparado) | Core |
| Usuarios | Alta/baja, perfil, asignación a organizaciones | Core |
| Roles | Definición de roles por contexto | Core |
| Permisos | Permisos granulares (RBAC/ABAC), matriz de acceso | Core |
| Contexto activo | Selección de empresa/operación/proyecto activo | Core |

## DOMINIO D9 · AUDITORÍA E HISTORIAL — (Core / Transversal)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Log de auditoría | Registro inmutable de operaciones | Core |
| Historial de cambios | Trazabilidad de asignaciones y estados | Core |
| Línea de tiempo | Vista cronológica por entidad | Transversal |

---

## DOMINIO D1 · ACTIVOS — (Operativo)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Ficha de activo | Datos generales, identificación, atributos dinámicos por tipo | Operativo |
| Tipos de activo | Catálogo universal (17+ tipos, extensible sin código) | Administrativo |
| Asignaciones | Asignación con vigencia a empresa/operación/proyecto/centro/ubicación/responsable | Operativo |
| Hoja de vida | Consolidado: intervenciones, costos, combustible, horas, documentos, fotos | Operativo |
| Componentes | Subcomponentes/partes del activo | Operativo |
| Estados del activo | Operativo, en mantenimiento, de baja, etc. (catálogo) | Administrativo |
| Combustibles del activo | Uno o varios combustibles por activo (ACPM, gasolina, gas, GLP, GNV, eléctrico, biodiesel, hidrógeno, otros) | Administrativo |

## DOMINIO D2 · MANTENIMIENTO — (Operativo)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Órdenes de trabajo | Correctivo, ejecución, diagnóstico, causa raíz, solución, costos | Operativo |
| Mantenimiento preventivo | Planes por tiempo/uso, programación, generación de OT | Operativo |
| Mantenimiento predictivo | Basado en condición/indicadores (integra IA) | Operativo |
| Solicitudes de servicio | Reporte de falla → solicitud → OT | Operativo |
| Programación / calendario | Agenda de mantenimientos y recursos | Operativo |

## DOMINIO D3 · INVENTARIO / ALMACENES — (Operativo)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Repuestos e insumos | Catálogo, mínimos/máximos, valorización | Operativo |
| Almacenes | Almacenes multiubicación por organización | Operativo |
| Movimientos | Entradas/salidas/traslados (transacción atómica) | Operativo |
| Alertas de stock | Stock bajo, reposición | Transversal |

## DOMINIO D4 · OPERACIÓN EN CAMPO — (Operativo)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Checklist preoperacional | Plantillas dinámicas, ejecución móvil, hallazgos → OT | Operativo |
| Control de combustible | Tanqueos, consumos, rendimiento, multicombustible | Operativo |
| Horas hombre / horómetro | Registro de mano de obra, horas de operación por activo | Operativo |
| Lecturas / medidores | Horómetro, kilometraje, contadores | Operativo |

---

## DOMINIO D5 · PERSONAS — (Administrativo)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Técnicos / personal | Datos, disponibilidad, asignación | Administrativo |
| Competencias / certificaciones | Habilidades, vencimientos | Administrativo |
| Responsables | Historial de responsabilidad sobre activos | Administrativo |

## DOMINIO D6 · COMPRAS / PROVEEDORES — (Administrativo)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Proveedores | Catálogo, calificación, contactos | Administrativo |
| Órdenes de compra | (Preparado) compra de repuestos/servicios | Administrativo |
| Contratos / servicios | (Preparado) servicios tercerizados | Administrativo |

## CATÁLOGOS Y CONFIGURACIÓN — (Administrativo / Transversal)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Catálogos maestros | Tipos, estados, prioridades, unidades, combustibles | Administrativo |
| Monedas | Multimoneda (preparado), tasas | Administrativo |
| Idiomas | Multiidioma (preparado), traducciones | Administrativo |
| Configuración | Parámetros por empresa/sistema | Administrativo |

---

## MÓDULOS TRANSVERSALES

| Módulo | Submódulos | Tipo |
|---|---|---|
| Notificaciones | Alertas, correo, push (PWA) | Transversal |
| Documentos / adjuntos | Fotos, manuales, certificados | Transversal |
| Búsqueda global | Búsqueda contextual por tenant | Transversal |
| Preferencias de usuario | Idioma, moneda, tema | Transversal |
| Importación / exportación | Cargas masivas, reportes | Transversal |

---

## DOMINIO D8 · ANALÍTICA / KPI — (Analítico)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Dashboard ejecutivo | KPIs por contexto organizacional | Analítico |
| Indicadores | MTTR, MTBF, disponibilidad, cumplimiento preventivo | Analítico |
| Costos | Costos por activo/centro/proyecto/operación | Analítico |
| Consumos | Combustible, repuestos, horas | Analítico |
| Reportería | Reportes configurables | Analítico |
| Integración BI | Puente a Power BI | Analítico |

## DOMINIO D10 · IA / ASISTENCIA — (IA)

| Módulo | Submódulos | Tipo |
|---|---|---|
| Mantenimiento predictivo | Predicción de fallas por condición/uso | IA |
| Recomendaciones | Sugerencia de acciones/planes | IA |
| Detección de anomalías | Consumos/costos atípicos | IA |
| Asistente conversacional | Consultas en lenguaje natural sobre la operación | IA |

---

## Resumen por clasificación

| Clasificación | Dominios / módulos principales |
|---|---|
| **Core** | Organización (D0), Seguridad/Acceso (D7), Auditoría/Historial (D9) |
| **Operativos** | Activos (D1), Mantenimiento (D2), Inventario (D3), Operación en campo (D4) |
| **Administrativos** | Personas (D5), Compras/Proveedores (D6), Catálogos/Configuración |
| **Transversales** | Notificaciones, Documentos, Búsqueda, Preferencias, Import/Export, Historial |
| **Analíticos** | Analítica/KPI (D8) |
| **IA** | IA/Asistencia (D10) |

> Regla clave: **ningún módulo se organiza por tipo de activo.** Todos operan sobre el modelo universal de activo definido en `01_ARQUITECTURA_EMPRESARIAL.md` y `04_PRINCIPIOS_SGMA.md`.
