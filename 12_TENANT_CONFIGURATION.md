# 12_TENANT_CONFIGURATION.md

> **DeltaOps — ETS-005 · v1.0** · Tenant Configuration: qué puede configurar cada empresa y qué no.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Definir con precisión la **frontera de soberanía del tenant**: todo lo que un Administrador de Empresa puede adaptar sin intervención del fabricante, y todo lo que jamás podrá tocar. Es la síntesis operativa de las cuatro capas (`01_CONFIGURATION_PLATFORM.md`).

## 2. Lo que el tenant SÍ configura

| Área | Qué configura | Motor |
|---|---|---|
| **Estructura** | Su jerarquía completa: sedes → operaciones → proyectos → centros de costo → ubicaciones; calendarios, turnos, festivos | Core parametrizado |
| **Catálogos** | Todos los suyos: tipos de activo, combustibles, estados, prioridades, criticidades, especialidades, marcas/modelos, causas raíz… | 13 |
| **Activos** | Tipos con sus atributos dinámicos, plantillas de hoja de vida, esquemas de codificación/foliación (prefijos) | 13 + 03 |
| **Formularios** | Checklists, inspecciones, permisos, capturas de combustible/horas, encuestas — todos | 03 |
| **Procesos** | Estados, transiciones, cadenas de aprobación, umbrales por monto, SLAs, escalamientos | 04 |
| **Reglas** | Su reglamento de automatización completo | 05 |
| **Notificaciones** | Matriz evento→destinatario→canal, plantillas, digest, obligatoriedad | 06 |
| **Dashboards** | Tableros propios, metas y umbrales de KPIs, tablero por defecto por rol | 07 |
| **Marca** | Logo, nombre, colores, tema, dominio, idiomas, monedas, plantillas de documentos | 08 |
| **Módulos** | Encender/apagar dentro de su licencia, por ámbito | 09 |
| **Integraciones** | Conectores del catálogo, credenciales, mapeos, webhooks, cuentas de servicio | 10 |
| **IA** | Capacidades activas, umbrales, exclusiones de datos, política de datos | 11 |
| **Seguridad** | Roles clonados/propios desde las plantillas (partiendo de cero permisos), políticas de sesión y contraseña dentro de mínimos de plataforma, delegaciones | Permisos |
| **Terminología** | Diccionario del tenant: renombrar términos de interfaz ("OT"→"Aviso") sin alterar el lenguaje canónico interno | 08/02 |
| **Preferencias por defecto** | Zona horaria, formatos, idioma por defecto de sus usuarios | 02 |

Todo con el ciclo estándar: borrador → validación → ensayo → publicación versionada → auditoría.

## 3. Lo que el tenant NO configura (jamás)

| Prohibido | Por qué |
|---|---|
| Editar o borrar hechos, auditoría o folios | Append-only es Core: la confianza del sistema entero depende de esto |
| Dar capacidad de escritura o aprobación a la IA | "Propone, no dispone" es Core |
| Eliminar la evaluación de permisos por contexto o el denegado por defecto | Seguridad Core |
| Cambiar fórmulas de indicadores canónicos | Comparabilidad: "disponibilidad" significa lo mismo en toda la plataforma |
| Alterar la semántica de eventos y agregados (ETS-003) | Es el producto mismo |
| Ver o tocar datos de otro tenant; código, scripts o SQL propios | Aislamiento multi-tenant; la plataforma es configurable, no programable |
| Superar su licencia (módulos, límites, canales de costo) | La capa plataforma es techo |
| Debilitar SoD en cadenas de aprobación (autoaprobación) | El validador lo rechaza siempre |
| Apagar la auditoría o las notificaciones marcadas como obligatorias de seguridad | Núcleo de confianza |

## 4. Lo que configura el usuario (dentro del tenant)

Idioma, tema, formatos, zona horaria, dashboard personal, favoritos, filtros guardados, canales/ventanas de notificación (salvo obligatorias), contexto por defecto al ingresar. Nada de esto afecta a otros usuarios ni a los datos.

## 5. Gobierno dentro del tenant

- El tenant puede **delegar configuración por ámbito**: un administrador de sede configura formularios y reglas de su sede, sin tocar el resto (herencia estándar, ETS-005/02).
- Roles de configuración separados de los operativos, con SoD.
- Todo cambio es evento auditado con motivo; el Auditor del tenant lee la historia completa de la configuración igual que la operativa.
- **Reporte de salud de configuración:** la plataforma señala configuración muerta (formularios sin uso, reglas que nunca disparan, roles sin usuarios) para mantener el tenant limpio.

## 6. Arranque de un tenant nuevo

1. Se crea desde una **plantilla de industria** (paquete de catálogos, formularios, workflows, reglas y dashboards típicos).
2. El asistente de arranque recorre: estructura organizacional → catálogos mínimos → roles y usuarios → módulos → marca.
3. Nada queda "por programar": si al implantar aparece una necesidad no configurable, es una petición de producto al fabricante — nunca un desarrollo a medida dentro del tenant.
