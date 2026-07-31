# 10_MATRIZ_PERMISOS.md

> **DeltaOps — ETS-004 · v1.0** · Matriz de permisos rol × módulo.
> Los permisos son granulares (módulo → pantalla → acción) y siempre se evalúan **en el contexto organizacional activo**. Esta matriz define los valores por defecto de los 16 roles plantilla; cada tenant puede clonarlos y ajustarlos (auditado).
> Documento de diseño. No implementa nada.

---

## Leyenda

| Símbolo | Significado |
|---|---|
| **G** | Gestión total (crear, editar, desactivar, acciones especiales) |
| **E** | Escritura operativa (crear/editar en su flujo, sin administración) |
| **A** | Aprobación (según umbral configurado) |
| **L** | Lectura |
| **P** | Lectura parcial (solo lo propio: mis OTs, mis registros, mi frente) |
| — | Sin acceso |

Roles: **AG**=Admin Global · **AE**=Admin Empresa · **GE**=Gerente · **DI**=Director · **CO**=Coordinador · **SU**=Supervisor · **JT**=Jefe Taller · **PL**=Planeador · **TE**=Técnico · **OP**=Operador · **AL**=Almacenista · **CP**=Comprador · **CT**=Contratista · **AU**=Auditor · **CN**=Consulta · **IA**=IA Assistant

## Matriz principal

| Módulo | AG | AE | GE | DI | CO | SU | JT | PL | TE | OP | AL | CP | CT | AU | CN | IA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Organización** (empresas) | G | — | — | — | — | — | — | — | — | — | — | — | — | L | — | L* |
| **Organización** (sedes→ubicaciones) | L | G | L | L | L | L | L | L | — | — | L | L | — | L | L | L* |
| **Usuarios y roles** | G | G | L | L | — | — | — | — | — | — | — | — | — | L | — | — |
| **Activos** (ficha, tipos) | — | G | L | L | L | P | L | L | P | P | — | — | P | L | L | L* |
| **Asignaciones / traslados** | — | G | L | A/E | E | L | — | L | — | — | — | — | — | L | L | L* |
| **Hoja de vida** | — | L | L | L | L | P | L | L | P | P | — | — | P | L | L | L* |
| **Solicitudes de servicio** | — | L | L | L | G | E | E | L | P | E† | — | — | — | L | L | L* |
| **OTs** | — | L | L | L | G | L | G | E | P/E | — | L | — | P/E | L | L | L* |
| **Planes preventivos** | — | L | L | L | E | — | L | G | L | — | — | — | — | L | L | L* |
| **Plantillas de checklist** | — | G | — | L | E | L | — | E | — | — | — | — | — | L | — | — |
| **Ejecución de checklist** | — | L | L | L | L | L | — | L | — | E | — | — | — | L | L | L* |
| **Combustible / lecturas / horas** | — | L | L | L | L | E/A | L | L | E | E | — | — | E | L | L | L* |
| **Inventario** (existencias, movimientos) | — | L | L | L | L | — | L/E† | L | P | — | G | L | — | L | L | L* |
| **Compras** (OC, proveedores, contratos) | — | L | A | A | L | — | — | — | — | — | L | G | — | L | L | L* |
| **Costos / presupuesto** | — | G | L/A | L | L | — | — | L | — | — | — | L | — | L | L | L* |
| **Indicadores / analítica** | — | L | L | L | L | P | L | L | P | P | P | P | — | L | L | L* |
| **Catálogos / configuración** | G (globales) | G (tenant) | — | — | — | — | — | — | — | — | — | — | — | L | — | — |
| **Auditoría / líneas de tiempo** | G | L | L | L | — | — | — | — | — | — | — | — | — | **L total** | — | — |
| **Notificaciones (propias)** | L | L | L | L | L | L | L | L | L | L | L | L | L | L | L | — |
| **Exportar / reportes** | E | E | E | E | E | E | E | E | — | — | E | E | — | E | E‡ | — |

† Solicitud desde reporte de falla (operador) / solicitud de repuestos (jefe de taller).
‡ Si se le concede.
\* **IA:** lectura limitada al alcance del usuario asistido; jamás superior. Cero escritura: solo propone.

## Reglas de la matriz

1. **Denegado por defecto:** lo que no aparece concedido, está negado. Los roles nuevos parten de cero.
2. **A (aprobación) siempre está sujeta a umbrales** configurables por tenant (monto de compra, alcance del traslado).
3. **P (parcial) se resuelve por pertenencia:** mis OTs (asignación), mi frente (contexto), mis registros (autoría), mis activos (asignación de responsable/operación).
4. **El contratista además tiene membresía con vigencia:** al vencer, todo su acceso expira automáticamente.
5. **El auditor es el único con lectura total transversal** (incluida auditoría) y cero escritura; su actividad también se audita.
6. **Ningún rol edita hechos:** las correcciones son eventos compensatorios; ni el Admin Global edita auditoría (append-only).
7. **Acciones sensibles con permiso explícito adicional:** reabrir OT, ajustar inventario, retroceder medidor, cambiar permisos — todas auditadas con motivo.
8. **Separación de funciones (SoD):** quien crea una OC no la aprueba; quien despacha no aprueba sus propios ajustes de inventario. El sistema lo verifica al configurar roles y al ejecutar.
9. **Roles combinables por contexto:** un usuario puede ser JT en la operación A y TE en la B; la matriz aplica por contexto activo.
10. **Cambios de esta matriz** (roles clonados/ajustados) son ellos mismos eventos auditados (RolModificado, PermisoConcedido/Revocado).
