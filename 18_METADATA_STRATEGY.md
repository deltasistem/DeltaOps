# 18_METADATA_STRATEGY.md

> **DeltaOps — ETS-006 · v1.0** · Estrategia de metadatos: diccionario, catálogo de datos, linaje y versionado.
> Cierra la serie ETS-006. Documento de diseño. No implementa nada.

---

## 1. Principio

Los datos sin metadatos son ruido con formato. DeltaOps trata los **datos sobre los datos** como parte del producto: cada dato conocido tiene definición, dueño, clasificación, origen y versión — consultables dentro de la plataforma, no en documentos externos que envejecen.

## 2. Diccionario de datos

- **Base canónica:** el lenguaje ubicuo de ETS-003 (`08_DICCIONARIO_NEGOCIO.md`, `09_GLOSARIO_DELTAOPS.md`) es la fuente del significado; el diccionario de datos lo extiende con la definición operativa de cada dato: qué es, cómo se captura, qué unidad usa, qué reglas lo validan.
- **Capa de tenant:** la terminología renombrada del tenant ("OT"→"Aviso") se superpone sin alterar el canon; toda superficie (interfaz, exportes, BI) traduce con el diccionario del tenant, mientras las integraciones hablan el canon.
- **KPIs con ficha:** cada indicador canónico publica su ficha: fórmula en lenguaje de negocio, hechos que lo componen, exclusiones, frescura — visible desde el propio widget ("¿cómo se calcula esto?").
- **Vivo por construcción:** al crear un formulario, catálogo o campo (ETS-005), su definición y ayuda **son** su entrada de diccionario; no hay documentación paralela que mantener.

## 3. Catálogo de datos

Inventario navegable de todos los conjuntos de datos del tenant, por dominio (maestros, hechos, configuración, analíticos, auditoría), cada uno con:

| Metadato | Contenido |
|---|---|
| Definición | Del diccionario |
| Dueño | Rol responsable (→ `08_DATA_OWNERSHIP.md`) |
| Clasificación | Nivel de seguridad (→ `13_DATA_SECURITY.md`) |
| Ciclo de vida | Retención y archivado aplicables (→ `09`) |
| Frescura | Latencia declarada si es derivado |
| Consumidores | Qué pantallas, marts, integraciones y capacidades de IA lo usan |
| Calidad | Sus indicadores de calidad vigentes (→ `17`) |

Usos: el analista de BI descubre qué marts existen y qué significan; el Auditor verifica cobertura de dueños y clasificación; el Admin evalúa impacto antes de cambiar ("¿quién consume esto?").

## 4. Linaje

El linaje responde "¿de dónde salió este dato?" en cuatro encadenamientos, todos navegables:

1. **Del número al hecho:** KPI/widget/mart → hechos que lo componen (drill-down ≤ 3 clics — es linaje hecho interfaz).
2. **Del hecho a su origen:** evento → quién, dispositivo/canal, versión de formulario/workflow, y si medió regla o integración, cuál ("creado por la regla R-014 a partir del checklist #4571").
3. **De la proyección a su fuente:** todo read model/mart declara qué eventos consume y su cursor (frescura auditable).
4. **De la decisión a su información:** las sugerencias de IA registran qué vistas alcanzaron (→ `12`); las aprobaciones, qué versión de datos vio el aprobador.

## 5. Versionado de metadatos

- Definiciones, fichas de KPI, clasificaciones y diccionarios del tenant son **configuración versionada** (ETS-005/02): cambian por publicación auditada, con vigencia.
- Un reporte emitido o un snapshot conserva las definiciones **de su época**: si la ficha del KPI cambia, los cortes históricos se leen con la ficha con la que se emitieron.
- El esquema de los eventos evoluciona versionado (→ `10`); el catálogo de datos muestra qué versiones conviven.

## 6. Metadatos para el ecosistema

- Los marts de BI exportan su diccionario junto con los datos (el analista externo no adivina).
- La API pública publica sus contratos con las definiciones del canon.
- La exportación de salida del tenant (→ `09`) incluye el catálogo de datos completo: el patrimonio viaja con su significado.

---

**Fin de la serie ETS-006.** La estrategia de datos queda definida sobre seis dominios, propiedad y ciclo de vida explícitos, flujo por eventos con CQRS, read models por consumidor, seguridad clasificada, offline como productor de primera clase, respaldo del patrimonio con regeneración de derivados, rendimiento por diseño, calidad en origen y metadatos como parte del producto — coherente con ETS-001…005 y lista para servir de entrada a las siguientes especificaciones.
