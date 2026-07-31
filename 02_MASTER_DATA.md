# 02_MASTER_DATA.md

> **DeltaOps — ETS-006 · v1.0** · Datos maestros: quién y qué existe en la plataforma.
> Documento de diseño. No implementa nada.

---

## 1. Definición

Un dato maestro describe algo que **existe y perdura**: los hechos lo referencian una y otra vez. Cambia lento, se versiona, jamás se borra si fue usado. Es la columna vertebral referencial de todos los demás dominios.

## 2. Inventario de maestros

| Maestro | Contenido | Dueño del dato (rol) |
|---|---|---|
| **Empresas (tenants)** | Identidad legal, licencia, marca; grupos empresariales | Admin Global (existencia), Admin Empresa (contenido) |
| **Estructura organizacional** | Sedes, operaciones, proyectos, centros de costo, ubicaciones — con vigencias (una operación puede cerrar) | Admin Empresa |
| **Usuarios** | Identidad, credenciales (dominio de seguridad), membresías por contexto con vigencia, roles | Admin Empresa; el usuario, sus preferencias |
| **Activos** | Ficha universal: código, folio, tipo, atributos dinámicos según tipo, medidores declarados | Admin Empresa define tipos; roles autorizados crean/editan fichas |
| **Componentes** | Partes mayores con identidad propia (motor, transmisión) instalables/desinstalables en activos — su historial es de asignación, como todo | Igual que activos |
| **Proveedores y contratistas** | Identidad, documentos, calificaciones, vigencias de habilitación | Comprador / Admin Empresa |
| **Fabricantes, marcas, modelos** | Catálogos dependientes (modelo→marca→fabricante) | Admin funcional del catálogo |
| **Ítems de inventario** | Maestro de materiales/repuestos: código, unidad, mínimos por bodega, equivalencias | Almacén + Compras (dueño único por atributo) |
| **Catálogos** | Todos los del Catalog Engine (ETS-005/13): combustibles, prioridades, criticidades, especialidades, causas raíz… | Según capa: plataforma o tenant |

## 3. Reglas de los maestros

1. **Identidad doble:** identificador técnico inmutable + código de negocio legible (placa, código de activo, NIT). El código de negocio puede corregirse (evento auditado); la identidad técnica jamás.
2. **Nunca borrar lo referenciado:** los maestros se **inactivan** (dejan de ofrecerse) o se **fusionan** (duplicados: un sobreviviente, redirección hacia adelante, historia intacta). El borrado físico solo existe para registros nunca usados.
3. **Versionado de cambios relevantes:** los atributos con efecto en el negocio (criticidad de un activo, unidad de un ítem) cambian con vigencia y quedan en la historia; la ficha "actual" es la última versión, no la única.
4. **Los maestros no cuentan la operación:** un activo no "tiene" horas ni costos en su ficha — eso son proyecciones desde los hechos (Hoja de Vida). La ficha declara lo que el activo *es*, no lo que le *pasó*.
5. **Asignación ≠ pertenencia (Core):** la relación activo↔operación/proyecto/responsable vive en asignaciones con vigencia (dato transaccional), nunca como campo del maestro.
6. **Unicidad gobernada:** claves de negocio únicas por tenant (placa, código) con detección de duplicados en la captura y fusión asistida a posteriori (→ `17_DATA_QUALITY.md`).
7. **Atributos dinámicos con esquema:** los atributos por tipo de activo son configuración (ETS-005); cada ficha registra con qué versión del esquema fue capturada.
8. **Datos personales minimizados:** de las personas se guarda lo necesario para operar (nombre, cargo, credencial, contacto laboral); clasificación y protección en `13_DATA_SECURITY.md`.

## 4. Relación con los otros dominios

- Los **hechos** referencian maestros por identidad técnica y llevan además la "foto" mínima necesaria (nombre del momento) para que la historia se lea sin recalcular — el renombrado no reescribe el pasado.
- La **configuración** referencia maestros solo por rol/tipo/catálogo, nunca personas o activos quemados (ETS-005 N-06).
- La **analítica** dimensiona por maestros (activo, tipo, sede, proveedor); los cambios de estructura organizacional generan dimensiones con vigencia (la historia se analiza con la estructura de su época, u opcionalmente reagrupada con la actual — siempre explícito cuál).
