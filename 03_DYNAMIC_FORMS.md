# 03_DYNAMIC_FORMS.md

> **DeltaOps — ETS-005 · v1.0** · Dynamic Forms Engine: motor de formularios sin programación.
> Documento de diseño. No implementa nada.

---

## 1. Propósito

Un solo motor construye **cualquier formulario** de la plataforma: checklists preoperacionales, inspecciones, permisos de trabajo, registro de combustible, horas hombre, secciones de OT, auditorías internas, encuestas. Ningún formulario se programa; todos se **diseñan** por el administrador funcional y se ejecutan en web y móvil (offline incluido) con el mismo comportamiento.

Un formulario diseñado aquí es un Objeto de Configuración (ETS-005/02): versionado, con vigencia, validado, auditado y exportable.

## 2. Anatomía de un formulario

```text
Formulario (plantilla, versionada)
 ├── Metadatos: nombre, propósito, ámbito, a qué se aplica (tipo de activo,
 │   tipo de OT, proceso), idiomas, política de firma
 ├── Sección 1 (repetible o no, condicional o no)
 │    ├── Campo A
 │    ├── Campo B (depende de A)
 │    └── ...
 ├── Sección 2 ...
 └── Reglas de resultado (puntaje, semáforo, aprobado/rechazado, hallazgos)
```

- **Secciones:** agrupan campos; pueden ser condicionales (aparecen según respuestas), repetibles (ej. "un bloque por llanta") u ordenadas por rol (el técnico llena unas, el supervisor otras).
- **Resultado:** el diseñador define cómo se califica el formulario — puntaje ponderado, conteo de ítems críticos fallidos, semáforo, dictamen apto/no apto — y qué constituye un **hallazgo** (insumo del Rules Engine: "checklist crítico → crear solicitud").

## 3. Tipos de campo

| Grupo | Tipos |
|---|---|
| Texto | Texto corto, texto largo, enmascarado (placa, serial con formato) |
| Numérico | Entero, decimal, con unidad (ligada al catálogo de unidades), rango/slider |
| Selección | Lista simple, lista múltiple, sí/no/na, semáforo (bien/observación/crítico), **referencia a catálogo** (cualquier catálogo del tenant), referencia a entidad (activo, ubicación, persona, repuesto) |
| Fecha/tiempo | Fecha, hora, fecha-hora, duración |
| Evidencia | **Fotografía** (mín/máx, con anotaciones), video corto, **adjunto**, **firma** (dibujada o credencial), audio |
| Contexto | **GPS** (captura por evento; puede exigir estar dentro de un radio), **lectura QR / código de barras / NFC** (para verificar presencia física ante el activo), sello de fecha-hora del dispositivo |
| Medición | Lectura de medidor (valida contra la última lectura conocida: monotonía, saltos), cantidad de combustible con tipo (multi-combustible: galones, kWh — mismo evento) |
| Cálculo | Campo calculado a partir de otros (fórmula declarativa, sin código) |

Cada tipo declara sus propiedades configurables: obligatoriedad, valor por defecto, prellenado desde el sistema (activo, medidores, usuario, fecha), ayuda en pantalla, foto de referencia ("así se ve un desgaste crítico").

## 4. Validaciones (declarativas)

- **De campo:** requerido, rango, longitud, formato, lista cerrada.
- **Cruzadas:** entre campos del mismo formulario ("si semáforo = crítico, la foto y el comentario son obligatorios").
- **Contra el sistema:** lectura de medidor coherente con la última; cantidad de combustible dentro de la capacidad del tanque; el QR escaneado corresponde al activo esperado.
- **De cierre:** condiciones para poder enviar (todas las secciones críticas completas, firmas presentes).
- Toda validación tiene **mensaje en lenguaje de negocio** definido por el diseñador (multiidioma).
- Las validaciones distinguen **bloqueo** (no deja enviar) de **advertencia** (deja enviar, queda marcada).

## 5. Dependencias y lógica condicional

- Visibilidad, obligatoriedad y opciones de un campo pueden depender de valores anteriores (ej. "si tipo de falla = eléctrica, mostrar sección eléctrica").
- Las dependencias se declaran como condiciones simples componibles (Y/O), evaluables offline.
- El validador del Configuration Engine detecta ciclos y campos inalcanzables antes de publicar.

## 6. Versionado

Hereda el ciclo estándar (ETS-005/02) con una regla propia:

> **Toda respuesta queda ligada para siempre a la versión de plantilla con la que se llenó.** Los análisis históricos comparan por versión; cambiar la plantilla nunca reinterpreta respuestas pasadas.

Cambios menores (corregir un texto de ayuda) pueden marcarse como **revisión no estructural** para no fragmentar las series históricas de análisis.

## 7. Ejecución (contrato con la experiencia ETS-004)

- **Offline completo:** la plantilla vigente se descarga al dispositivo; se llena, valida y firma sin señal; sincroniza después (`06_MOBILE_FIRST.md`).
- **Prellenado obligatorio:** el formulario nunca pide lo que el sistema ya sabe (activo escaneado, operador, fecha, última lectura).
- **Rendimiento exigible:** un checklist típico se completa dentro del presupuesto de ETS-004 (`11_CRITERIOS_USABILIDAD.md`, U-01).
- Las respuestas emiten los eventos de dominio correspondientes (`ChecklistRealizado`, `CombustibleRegistrado`, `HorasRegistradas`…), que alimentan reglas, hojas de vida, costos e indicadores.

## 8. Frontera

- El motor **no** contiene lógica de negocio: qué pasa con un hallazgo crítico lo decide el Rules Engine; a quién notificar, el Notification Engine.
- El motor **no** permite scripts ni código embebido: solo condiciones, fórmulas y validaciones declarativas del vocabulario del motor. Si un formulario "necesita código", falta un tipo de campo o una validación en la plataforma — se pide al fabricante, no se programa en el tenant.
