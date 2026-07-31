# 02_CONFIGURATION_ENGINE.md

> **DeltaOps — ETS-005 · v1.0** · Configuration Engine: el motor central que gobierna toda la configuración de la plataforma.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Es el motor **sobre el que se montan todos los demás**. Cualquier definición configurable —un catálogo, un formulario, un workflow, una regla, un dashboard, un tema— vive dentro del Configuration Engine y hereda de él sus garantías: identidad, capa, versión, vigencia, validación, publicación, herencia, auditoría y portabilidad. Ningún motor inventa su propio mecanismo de guardado o versionado.

## 2. El objeto de configuración

Toda pieza de configuración es un **Objeto de Configuración** con estas propiedades conceptuales:

| Propiedad | Significado |
|---|---|
| Identidad | Clave estable y legible (ej. `formulario.checklist-preoperacional-volqueta`) que sobrevive a las versiones |
| Tipo | Qué motor la interpreta (catálogo, formulario, workflow, regla, tema, flag…) |
| Capa | Plataforma, tenant o usuario (el Core no es un objeto: es producto) |
| Ámbito | Dónde aplica dentro de la jerarquía organizacional: todo el tenant, una sede, una operación, un proyecto |
| Versión | Número inmutable + estado (borrador, publicada, retirada) + vigencia |
| Origen | Si fue creada desde cero, clonada de una plantilla o importada (con trazabilidad al origen) |
| Dependencias | Qué otros objetos referencia (un workflow referencia un formulario y un catálogo de estados) |

## 3. Resolución en cascada (herencia)

Cuando la operación pregunta "¿qué formulario de checklist aplica a esta volqueta en este proyecto?", el motor resuelve **de lo específico a lo general**:

```text
Usuario → Proyecto → Operación → Sede → Tenant → Plantilla de plataforma → Default de producto
```

Reglas de la cascada:

1. **La primera definición encontrada gana.** Los niveles inferiores pueden **especializar** (sobrescribir) lo heredado si el objeto lo permite.
2. Cada objeto declara su **política de herencia**: `heredable y sobrescribible` (la mayoría), `heredable y bloqueado` (el tenant impone, ej. política de aprobaciones), o `local` (no se propaga).
3. La resolución es **determinista y explicable**: cualquier administrador puede ver *por qué* aplicó una versión ("heredado de Sede Norte, versión 4, publicada el 12-mar").
4. La resolución ocurre en el **contexto organizacional activo** del usuario, igual que los permisos (ETS-004).

## 4. Versionado y vigencia

- Publicar crea una **versión inmutable**. Editar una versión publicada es imposible; se crea una nueva.
- **Lo que está en vuelo termina con su versión.** Una OT abierta con el workflow v3 se cierra con v3 aunque ya exista v5; un checklist respondido con el formulario v7 se lee para siempre con la estructura v7.
- Las versiones tienen **vigencia programable**: publicar hoy con efecto el próximo lunes.
- **Rollback = publicar de nuevo una versión anterior** como versión nueva (nunca se borra historia).
- Comparación de versiones lado a lado (qué campos, estados o reglas cambiaron) para revisión antes de publicar.

## 5. Validación previa a publicación

El motor rechaza publicar cuando detecta:

- **Referencias rotas:** el workflow apunta a un rol o formulario inexistente o retirado.
- **Ciclos:** dependencias circulares entre objetos, estados sin salida, escalamientos infinitos.
- **Violaciones de SoD:** una cadena de aprobación donde el solicitante puede autoaprobarse.
- **Violaciones de Core:** intentos de hacer editable lo inmutable, saltarse la auditoría o dar a la IA capacidad de escritura.
- **Impacto en vuelo:** advierte cuántas instancias vivas usan la versión anterior y qué pasará con ellas.

Además del rechazo duro, emite **advertencias** (ej. "este catálogo tiene valores sin traducción al segundo idioma del tenant").

## 6. Entorno de ensayo (sandbox de configuración)

- Cada tenant tiene un **espacio de ensayo** donde los borradores se prueban con datos ficticios: llenar el formulario, recorrer el workflow, disparar la regla, ver la notificación.
- El ensayo nunca toca datos reales ni envía notificaciones reales (correos van a una bandeja de prueba).
- La promoción ensayo → producción es la publicación misma: el objeto ya validado pasa por el ciclo estándar.

## 7. Auditoría de configuración

Todo cambio de configuración es un evento de dominio de primera clase, con el mismo tratamiento que los hechos operativos (ETS-003, BC de Auditoría):

- `ConfiguracionCreada`, `ConfiguracionPublicada`, `ConfiguracionRetirada`, `ConfiguracionImportada`.
- Cada evento registra: quién, cuándo, desde dónde, versión anterior/nueva, diferencias y **motivo obligatorio** en cambios sensibles (permisos, aprobaciones, reglas financieras).
- Línea de tiempo por objeto: la historia completa de un formulario o workflow es navegable como la hoja de vida de un activo.

## 8. Portabilidad

- **Exportación:** paquete de configuración completo o parcial (por tipo, por módulo, por ámbito), con sus versiones y dependencias resueltas.
- **Importación:** con reporte previo de impacto (qué crea, qué sobrescribe, qué falta), mapeo de referencias (roles/catálogos equivalentes) y ejecución transaccional: se aplica todo o nada.
- **Plantillas de industria** (plataforma) y **plantillas de grupo** (un holding replica su estándar a sus empresas): ambas se distribuyen por este mecanismo.

## 9. Lo que el Configuration Engine no hace

- No interpreta la configuración: cada motor (formularios, workflows, reglas…) es dueño de su semántica.
- No decide permisos: el motor de Permisos (ETS-003) determina quién puede crear/publicar/importar qué, según capa y ámbito.
- No permite configuración "en caliente" sin versión: no existen cambios anónimos ni ediciones directas en producción.
