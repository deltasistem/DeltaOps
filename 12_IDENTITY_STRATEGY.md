# 12_IDENTITY_STRATEGY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de identidad de datos: UUID, identidades provisionales, IDs offline y resolución.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. UUID First

- **Toda entidad y todo hecho nacen con un UUID** generado por quien crea (servidor, dispositivo móvil, integración) **sin coordinación**: es lo que hace posible el offline (un dispositivo sin señal crea identidades válidas), la fusión de datos y la ausencia de secuencias centrales como cuello de botella.
- Los UUID son **opacos y eternos**: no codifican tenant, fecha ni tipo (nada se infiere de ellos); jamás se reutilizan, ni siquiera tras una baja (11 §3).
- Variante de generación ordenable por tiempo (para localidad de escritura e índices sanos): decisión de implementación permitida, invisible al contrato — ningún cliente depende del orden de los UUID.

## 2. Identidad técnica vs identidad de negocio

```text
UUID  (identidad técnica)              FOLIO (identidad de negocio)
  única, global, generada en           legible y secuencial por tenant:
  cualquier parte, para máquinas       OT-2026-00431, para humanos
  → referencias, API, sincronización   → pantallas, reportes, conversación
```

- El folio lo asigna **solo el servidor** al confirmar el hecho (una secuencia legible exige coordinación — por eso no puede nacer offline).
- Formato de folio configurable por tenant (prefijos, reinicio anual — ETS-005/13); el UUID nunca es configurable.
- Las referencias internas y los contratos usan UUID; el folio es presentación indexada para búsqueda.

## 3. Identidades provisionales (offline)

Cuando un dispositivo sin señal crea algo referenciable (un hallazgo que genera una solicitud que genera una OT):

- El dispositivo asigna **UUID definitivo desde el nacimiento** — la "provisionalidad" no está en el UUID sino en el **folio y la confirmación**: la entidad existe localmente como provisional (sin folio, no validada por el dominio).
- Las capturas encadenadas offline se referencian entre sí por esos UUID: la cadena viaja completa en la bitácora (ETS-008/12 §4) y llega consistente.
- El dispositivo presenta las provisionales con marca visible (ETS-004): el usuario sabe qué está confirmado y qué viaja pendiente.

## 4. Resolución (sincronización)

```text
Bitácora llega → por cada comando:
  1. Idempotencia por clave dispositivo+secuencia (repetido = resultado original)
  2. Validación de dominio a tiempo de negocio
  3. CONFIRMADO → el UUID del dispositivo SE CONSERVA como identidad
     definitiva + se asigna folio → respuesta con mapa
     identidadProvisional→definitiva (UUID igual, folio nuevo, estado confirmado)
  4. RECHAZADO → el UUID queda registrado en el rechazo (trazable),
     jamás reutilizado; la captura se preserva en bandeja de atención
```

- **El UUID nunca cambia en la resolución** — se confirma. Esto elimina la clase entera de errores de "remapear referencias": la cadena capturada offline ya es la definitiva.
- Colisión de UUID (probabilísticamente despreciable, pero contemplada): rechazo explícito del comando (`IDENTIDAD_EN_CONFLICTO`), jamás sobrescritura silenciosa.
- Las evidencias enlazan por UUID del hecho: la subida diferida del binario (ETS-008/11) resuelve contra la identidad ya confirmada.

## 5. Identidades externas

- Los datos que llegan de integraciones traen su **clave externa** (código SAP del proveedor, serial del sensor): se persiste como atributo de correspondencia en el mapeo del tenant (ETS-008/13 §1), jamás como identidad primaria.
- Una entidad puede tener varias correspondencias externas (el mismo proveedor en SAP y en Odoo); la identidad DeltaOps es una sola.
- La resolución externa→UUID es responsabilidad de la ACL de integración con el mapeo versionado; lo irresoluble va a bandeja (`MAPEO_INVALIDO`), nunca se inventa identidad.
