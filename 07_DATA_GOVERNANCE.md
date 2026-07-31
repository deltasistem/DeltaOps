# 07_DATA_GOVERNANCE.md

> **DeltaOps — ETS-006 · v1.0** · Gobierno de datos: las políticas que hacen confiable el patrimonio de datos.
> Documento de diseño. No implementa nada.

---

## 1. Marco

El gobierno de datos de DeltaOps se define en ocho dimensiones. Cada una tiene política, responsable y verificación — el gobierno no es un documento, es una operación continua con evidencia.

## 2. Las ocho dimensiones

### 2.1 Calidad
Los datos capturan la realidad: validación en origen (formularios y reglas declarativas, ETS-005/03), prellenado para evitar digitación, monitoreo de anomalías y bandejas de corrección por eventos compensatorios. Política completa en `17_DATA_QUALITY.md`.

### 2.2 Integridad
Nada referencia lo que no existe; nada usado se borra. Referencias por identidad estable, inactivación en lugar de borrado, fusión asistida de duplicados, invariantes protegidos por los agregados (ETS-003) y validación de dependencias al publicar configuración.

### 2.3 Consistencia
Fuerte dentro del agregado; eventual y **declarada** entre proyecciones. Toda pantalla muestra la frescura de sus datos; las discrepancias proyección-vs-eventos se detectan por verificación periódica y se resuelven regenerando la proyección (la fuente siempre gana).

### 2.4 Disponibilidad
Los datos están cuando se necesitan: alta disponibilidad del servicio, modo offline para el campo (el dato nace local), archivado consultable (lo viejo tarda más, pero está), y objetivos de recuperación definidos (→ `15_BACKUP_RECOVERY.md`).

### 2.5 Seguridad
Clasificación en cinco niveles con protección proporcional, cifrado, mínimo privilegio por contexto, y auditoría de accesos (→ `13_DATA_SECURITY.md`).

### 2.6 Retención
Cada clase de dato tiene política explícita de retención y archivado (→ `09_DATA_LIFECYCLE.md`): los hechos y la auditoría se retienen largo; los derivados se regeneran; los datos personales, lo que la ley y el contrato exijan — ni más ni menos.

### 2.7 Propiedad
Cada dato tiene exactamente un dueño responsable de su calidad y acceso (→ `08_DATA_OWNERSHIP.md`). Sin dueño no hay dato: crear un catálogo, un mart o una integración exige declararlo.

### 2.8 Linaje
Todo dato derivado sabe de dónde viene: KPI → hechos que lo componen (drill-down), proyección → eventos que la construyeron, mart → dominios que lo alimentan, hecho → versión de configuración y captura que lo produjo (→ `18_METADATA_STRATEGY.md`).

## 3. Roles de gobierno

| Rol | Responsabilidad |
|---|---|
| **Fabricante (plataforma)** | Fórmulas canónicas, catálogos globales, clasificación base de cada tipo de dato, herramientas de gobierno |
| **Admin Empresa** | Políticas del tenant dentro del marco: retención contractual, dueños por catálogo/área, activación de módulos |
| **Dueños de dato (por dominio)** | Calidad y acceso de su dominio (tabla en `08_DATA_OWNERSHIP.md`) |
| **Auditor** | Verificación independiente: integridad de auditoría, cumplimiento de retención, revisión de accesos |
| **Todos los usuarios** | Capturar bien en origen — el gobierno empieza en el formulario |

## 4. Principios de decisión

1. **La fuente gana:** ante discrepancia, el evento manda; los derivados se regeneran.
2. **Explícito sobre implícito:** frescura, linaje, ámbito y versión siempre visibles; nada de números sin marco.
3. **Gobernar con el producto, no contra él:** las políticas se expresan como configuración versionada y auditada (ETS-005), no como manuales externos.
4. **Evidencia continua:** cada dimensión tiene indicadores propios (exactitud de inventario, latencia de proyecciones, cobertura de dueños, hallazgos de integridad) visibles en un dashboard de gobierno para el Admin y el Auditor.
