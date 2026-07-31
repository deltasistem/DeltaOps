# 08_DATA_OWNERSHIP.md

> **DeltaOps — ETS-006 · v1.0** · Propiedad de los datos: quién crea, modifica, consulta, aprueba y consume cada dominio.
> Los roles son los 16 de ETS-004 (`01_USER_PERSONAS.md`); los permisos finos, en `10_MATRIZ_PERMISOS.md`.
> Documento de diseño. No implementa nada.

---

## 1. Principio

**Cada dato tiene exactamente un dueño** (rol, no persona), responsable de su calidad y de decidir su acceso dentro del marco. La propiedad se ejerce siempre en el contexto organizacional correspondiente. "Modificar" en dominios append-only significa **agregar eventos** (compensatorios, nuevas versiones), nunca editar.

## 2. Matriz de propiedad por dominio

### Maestros

| Dato | Crea | Modifica (versiona) | Aprueba | Consulta | Consume |
|---|---|---|---|---|---|
| Empresas (tenants) | Admin Global | Admin Global / Admin Empresa (su contenido) | Contrato/licencia | Admins | Toda la plataforma |
| Estructura organizacional | Admin Empresa | Admin Empresa | — | Todos (su alcance) | Permisos, asignaciones, costos, analítica |
| Usuarios y membresías | Admin Empresa | Admin Empresa | — | Admins; cada quien lo suyo | Seguridad, notificaciones |
| Activos y componentes | Roles autorizados por tenant (típico: Coordinador) | Ídem, con historia | Según workflow del tenant | Todos según alcance | OTs, checklists, combustible, analítica |
| Proveedores/contratistas | Comprador | Comprador | Director (habilitación) | Compras, gerencia, auditor | Compras, contratos |
| Ítems de inventario | Almacenista (ficha) + Comprador (compra) | Dueño por atributo | — | Taller, compras | Inventario, compras, costos |
| Catálogos del tenant | Admin funcional designado por catálogo | Ídem | — | Todos | Formularios, reglas, analítica |
| Catálogos de plataforma | Fabricante | Fabricante | — | Todos | Todo |

### Transaccionales (el dueño es quien vive el hecho)

| Hecho | Crea | "Modifica" (compensa) | Aprueba | Consulta | Consume |
|---|---|---|---|---|---|
| Checklists | Operador | Solo compensación con motivo | Supervisor (si el tenant lo exige) | Su cadena + auditor | Reglas, hallazgos, indicadores |
| OTs | Coordinador / Jefe Taller / reglas | Técnico agrega avances; reapertura = permiso especial | Jefe Taller (cierre) | Según alcance | Costos, hoja de vida, KPIs |
| Combustible y lecturas | Operador / Técnico / IoT | Anulación con motivo | Supervisor (anomalías) | Según alcance | Consumos, preventivos por uso |
| Horas hombre | Técnico | Corrección compensatoria | Supervisor / Jefe Taller | Según alcance | Costos, productividad |
| Movimientos de inventario | Almacenista | Ajuste con motivo (SoD: no autoaprueba) | Según umbral | Taller, compras, auditor | Stock, costos, reposición |
| Compras (OC, recepciones) | Comprador | Eventos del workflow | Cadena por umbral (Gerente/Director) | Compras, gerencia, auditor | Inventario, costos, proveedores |
| Asignaciones/traslados | Coordinador | Nueva asignación (vigencias) | Director según alcance | Todos según alcance | Permisos, hoja de vida, costos |

### Configuración, analítica y auditoría

| Dato | Crea | Modifica | Aprueba | Consulta | Consume |
|---|---|---|---|---|---|
| Configuración del tenant | Roles de configuración por ámbito | Nueva versión publicada | Flujo de publicación (SoD) | Admins; Auditor todo | Todos los motores |
| KPIs/marts/dashboards | Se derivan solos; tenant configura metas/tableros | Regeneración | — | Cada rol su alcance | Gerencia, BI, IA |
| Auditoría | **El sistema, únicamente** | **Nadie, nunca** | — | Auditor (total); cada rol su línea de tiempo | Cumplimiento, replay, seguridad |
| Preferencias de usuario | Cada usuario | Cada usuario | — | El usuario | Interfaz |

## 3. Reglas transversales

1. **La IA no aparece en "crea/modifica/aprueba" de ningún dominio:** solo consume (lectura con el alcance del asistido) y propone; el humano que acepta es el autor.
2. **Las integraciones crean con cuenta de servicio propia** y los mismos workflows/validaciones; su dueño funcional es el administrador de la integración.
3. **Consultar nunca es anónimo** en datos confidenciales o superiores: el acceso queda auditado.
4. **SoD estructural:** quien crea no se autoaprueba; quien ajusta inventario no aprueba su ajuste; quien diseña una cadena de aprobación no se incluye en ella.
5. **Delegación con vigencia y rastro:** la propiedad se delega temporalmente (vacaciones), jamás se transfiere informalmente.
