# 05_VERSIONING.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de versionado en persistencia: configuraciones, documentos, formularios, workflows y reglas.
> El diseño funcional del versionado es ETS-005; aquí, cómo se persiste.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Patrón común: cadena de versiones inmutables

Todo lo versionable persiste igual:

```text
DEFINICIÓN (identidad estable)          VERSIONES (inmutables)
  ├── UUID + tenant + ámbito              ├── v1: contenido completo, autor,
  ├── tipo (formulario, workflow…)        │      fecha, notas, estado
  ├── nombre y metadatos vivos            ├── v2: contenido completo…
  └── puntero a versión vigente           └── v3 (borrador): ÚNICA editable
       por ámbito y vigencia
```

- **Cada versión guarda el contenido completo**, no diferencias: leer la v7 jamás requiere reconstruir desde v1 (el diff entre versiones es un cálculo de presentación, no de almacenamiento).
- Estados: `borrador` (editable, descartable) → `publicada` (inmutable para siempre) → `vigente` (la que la cascada resuelve) → `histórica` (sigue existiendo: hay hechos que la referencian).
- La publicación es un hecho auditado (quién, cuándo, qué cambió, aprobación si el tenant la exige — ETS-005/12).

## 2. Configuraciones (cascada)

- La resolución plataforma→tenant→zona→sitio (ETS-005/02) **no se persiste pre-calculada en la verdad**: se persisten las piezas por nivel y la resolución vigente es un read model (07) que se reconstruye al publicar cualquier pieza.
- El paquete de configuración móvil (ETS-008/12) es una **materialización versionada** de esa resolución: cada paquete emitido queda registrado (qué versión recibió qué dispositivo) — imprescindible para entender hechos capturados con configuración vieja.
- Vigencias programadas: una versión puede publicarse hoy con vigencia futura; la conmutación es por reloj de negocio, sin despliegue.

## 3. Documentos

- Cada edición = versión inmutable con su binario propio en el almacén de objetos (13) + metadatos (autor, notas, huella del contenido).
- La "versión vigente" es un puntero; las referencias históricas (la OT que adjuntó la edición 2) apuntan a la versión exacta para siempre (ETS-008/11 §4).
- Las evidencias de hechos NO se versionan: son inmutables de nacimiento.

## 4. Formularios

- El caso más delicado: los diligenciamientos (03 §2) referencian la versión exacta del formulario, y esa versión define **la forma de los datos capturados**.
- Consecuencia de persistencia: la versión del formulario es el **esquema de facto** de sus diligenciamientos — leer un checklist de 2026 exige la versión del formulario de 2026, garantizada por inmutabilidad.
- Los formularios en vuelo terminan con su versión (ETS-005): un dispositivo con la v3 a medio llenar la entrega contra la v3 aunque ya exista la v4; ambas conviven en persistencia sin conflicto.

## 5. Workflows

- Cada OT persiste **la versión del workflow que la gobierna** desde su creación hasta su cierre (02 §3): publicar un workflow nuevo solo afecta OTs nuevas.
- La versión del workflow persiste su definición completa: estados, transiciones, permisos por transición, acciones — la pregunta de auditoría "¿por qué esta OT pudo saltar ese paso?" se responde leyendo la versión que la gobernaba.
- Migrar OTs en vuelo a un workflow nuevo es una operación explícita y gobernada (comando administrativo con criterios, ETS-005/04), jamás automática.

## 6. Reglas

- Igual patrón: versión inmutable con condición, acción, ámbito y estado de simulación/activa (ETS-005/05).
- Cada disparo de regla persiste como hecho: qué regla, **qué versión**, qué evento la disparó, qué produjo — la cadena causal completa (ETS-008/09 §2) permite explicar cualquier automatismo meses después.
- El modo simulación persiste sus disparos igual que el real (marcados como simulados): la evaluación de una regla antes de activarla usa datos reales con efectos cero.

## 7. Qué NO se versiona

Los hechos (ya inmutables — versionar lo inmutable es redundante), los read models (se reconstruyen, no se versionan — aunque su **esquema** sí versiona con el protocolo móvil, ETS-008/12 §8) y los borradores (aún no son nada).
