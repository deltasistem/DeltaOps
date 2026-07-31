# 03_MAPA_NAVEGACION.md

> **SGMA — ETS-002 · v1.0** · Mapa de navegación de la plataforma EAM.
> Jerarquía: **Dashboard → Módulos → Submódulos → Pantallas → Acciones.**
> Documento de diseño. No crea rutas ni componentes.

---

## Contexto global de navegación

Toda la navegación ocurre **dentro de un contexto organizacional activo**. Antes de operar, el usuario selecciona (o hereda) su contexto:

```text
[Login] → [Selección de contexto: Empresa → Operación → Proyecto] → [Dashboard]
        └─ El contexto activo filtra TODA la navegación y los datos.
```

Barra superior persistente: **selector de contexto activo · búsqueda global · notificaciones · idioma/moneda · perfil de usuario.**
Menú lateral: agrupado por dominios; cada ítem visible según **permisos del rol** en el contexto activo.

---

## Nivel 0 · Autenticación y contexto

```text
Login
 ├─ Iniciar sesión                 [Acción: autenticar, recuperar contraseña, MFA]
 └─ Selección de contexto
     ├─ Elegir empresa             [Acción: seleccionar]
     ├─ Elegir operación/proyecto  [Acción: seleccionar, cambiar contexto]
     └─ Entrar                     [Acción: fijar contexto activo]
```

---

## Nivel 1 · DASHBOARD (raíz)

```text
Dashboard
 ├─ KPIs del contexto           [Acciones: filtrar por rango, exportar]
 ├─ Estado de activos           [Acción: drill-down a Activos]
 ├─ OT abiertas / vencidas      [Acción: ir a Órdenes]
 ├─ Alertas (stock, checklist)  [Acción: resolver / navegar]
 ├─ Consumos (combustible/horas)[Acción: drill-down a Analítica]
 └─ Actividad reciente          [Acción: ver historial]
```

---

## Nivel 1 · MÓDULOS → Submódulos → Pantallas → Acciones

### ORGANIZACIÓN (Core)
```text
Organización
 ├─ Empresas        → Lista · Detalle · Configuración   [Crear, Editar, Desactivar]
 ├─ Sedes           → Lista · Detalle                    [Crear, Editar, Asignar a empresa]
 ├─ Operaciones     → Lista · Detalle                    [Crear, Editar, Cerrar]
 ├─ Proyectos       → Lista · Detalle · Vigencias        [Crear, Editar, Finalizar]
 ├─ Centros de costo→ Lista · Detalle · Jerarquía        [Crear, Editar, Reasignar]
 ├─ Ubicaciones     → Lista · Árbol · Detalle            [Crear, Editar, Mover]
 └─ Estructura org. → Árbol jerárquico                    [Ver, Reorganizar]
```

### SEGURIDAD Y ACCESO (Core)
```text
Seguridad
 ├─ Usuarios   → Lista · Detalle · Asignación a orgs   [Crear, Editar, Activar/Desactivar, Resetear]
 ├─ Roles      → Lista · Detalle                        [Crear, Editar, Clonar]
 ├─ Permisos   → Matriz de acceso por contexto          [Asignar, Revocar]
 └─ Sesiones   → Sesiones activas                        [Cerrar sesión, Auditar]
```

### ACTIVOS (Operativo)
```text
Activos
 ├─ Inventario de activos → Lista (filtros) · Detalle           [Crear, Editar, Dar de baja, Exportar]
 ├─ Ficha del activo      → Datos · Atributos dinámicos · Fotos [Editar, Adjuntar documentos]
 ├─ Asignaciones          → Historial de asignaciones           [Asignar (con vigencia), Trasladar, Reasignar responsable]
 ├─ Hoja de vida          → Timeline consolidado                [Ver intervenciones/costos/combustible/horas, Exportar PDF]
 ├─ Componentes           → Lista de subcomponentes             [Agregar, Editar, Retirar]
 └─ Combustibles          → Combustibles del activo             [Asociar uno o varios, Editar]
```

### MANTENIMIENTO (Operativo)
```text
Mantenimiento
 ├─ Órdenes de trabajo → Lista · Detalle · Ejecución        [Crear, Asignar técnico, Diagnosticar, Cerrar, Costear]
 ├─ Preventivo         → Planes · Programación · Calendario  [Crear plan, Programar, Generar OT, Activar/Desactivar]
 ├─ Predictivo         → Alertas por condición               [Ver, Convertir en OT]
 ├─ Solicitudes        → Bandeja de reportes de falla        [Crear, Aprobar, Convertir en OT]
 └─ Calendario         → Vista mensual/semanal de recursos   [Reprogramar, Asignar]
```

### INVENTARIO / ALMACENES (Operativo)
```text
Inventario
 ├─ Repuestos   → Lista · Detalle           [Crear, Editar, Definir mín/máx, Valorizar]
 ├─ Almacenes   → Lista · Detalle           [Crear, Editar, Asignar ubicación]
 ├─ Movimientos → Historial · Nuevo         [Entrada, Salida, Traslado (atómico)]
 └─ Alertas     → Stock bajo / reposición   [Generar solicitud de compra]
```

### OPERACIÓN EN CAMPO (Operativo · Mobile-first / PWA)
```text
Operación
 ├─ Checklist preoperacional → Plantillas · Ejecución móvil · Hallazgos [Diligenciar, Firmar, Reportar falla → OT]
 ├─ Combustible              → Registro de tanqueos · Consumos          [Registrar tanqueo, Ver rendimiento]
 ├─ Horas hombre / horómetro → Registro por activo/técnico              [Registrar, Cerrar turno]
 └─ Lecturas / medidores     → Captura de horómetro/km                  [Registrar lectura]
```

### PERSONAS (Administrativo)
```text
Personas
 ├─ Técnicos/personal → Lista · Detalle · Disponibilidad  [Crear, Editar, Asignar]
 ├─ Competencias      → Certificaciones · Vencimientos    [Agregar, Renovar, Alertar]
 └─ Responsables      → Historial de responsabilidad      [Ver, Reasignar]
```

### COMPRAS / PROVEEDORES (Administrativo)
```text
Compras
 ├─ Proveedores    → Lista · Detalle · Calificación   [Crear, Editar, Calificar]
 ├─ Órdenes compra → (Preparado) Lista · Detalle       [Crear, Aprobar, Recibir]
 └─ Contratos      → (Preparado) Servicios             [Crear, Renovar]
```

### CATÁLOGOS / CONFIGURACIÓN (Administrativo)
```text
Configuración
 ├─ Catálogos maestros → Tipos, estados, prioridades, unidades, combustibles [Crear, Editar]
 ├─ Monedas            → Multimoneda (preparado) · Tasas                       [Configurar]
 ├─ Idiomas            → Multiidioma (preparado) · Traducciones                [Configurar]
 └─ Parámetros         → Configuración por empresa/sistema                     [Editar]
```

### ANALÍTICA / KPI (Analítico)
```text
Analítica
 ├─ Dashboard ejecutivo → KPIs por contexto        [Filtrar, Exportar]
 ├─ Indicadores         → MTTR/MTBF/disponibilidad  [Ver por activo/centro/proyecto]
 ├─ Costos              → Por activo/centro/proyecto [Comparar, Exportar]
 ├─ Consumos            → Combustible/repuestos/horas[Analizar]
 ├─ Reportería          → Reportes configurables     [Generar, Programar]
 └─ Integración BI      → Puente Power BI            [Conectar, Actualizar]
```

### IA / ASISTENCIA (IA)
```text
IA
 ├─ Predicción      → Riesgo de falla por activo   [Ver, Convertir en plan/OT]
 ├─ Recomendaciones → Acciones sugeridas           [Aceptar, Descartar]
 ├─ Anomalías       → Consumos/costos atípicos      [Investigar]
 └─ Asistente       → Consulta en lenguaje natural  [Preguntar]
```

### TRANSVERSALES (accesibles desde toda la app)
```text
Transversales
 ├─ Notificaciones   → Bandeja           [Marcar leído, Navegar al origen]
 ├─ Documentos       → Repositorio        [Subir, Descargar, Vincular]
 ├─ Búsqueda global  → Resultados         [Filtrar por dominio/contexto]
 ├─ Historial        → Timeline por entidad [Ver, Exportar]
 └─ Perfil / prefs.  → Idioma, moneda, tema [Editar]
```

---

## Reglas de navegación

1. **Sin contexto no hay operación:** el usuario debe tener un contexto organizacional activo antes de acceder a módulos operativos.
2. **Visibilidad por permisos:** cada módulo/pantalla/acción se muestra según el rol en el contexto activo.
3. **Cambio de contexto sin recargar:** cambiar empresa/operación/proyecto refiltra todo.
4. **Drill-down coherente:** los KPIs del dashboard navegan al detalle correspondiente conservando el filtro.
5. **Mobile-first en campo:** checklist, combustible y lecturas priorizan flujo móvil/PWA.
6. **Toda acción de escritura** deja registro en Historial/Auditoría.
