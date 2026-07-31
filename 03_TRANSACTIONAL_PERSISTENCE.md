# 03_TRANSACTIONAL_PERSISTENCE.md

> **DeltaOps — ETS-009 · v1.0** · Persistencia de los datos transaccionales (los hechos operativos, ETS-006/03): checklists, combustible, horas hombre, compras, movimientos, asignaciones y lecturas.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Patrón común: el hecho puro

Los transaccionales son la familia más simple y más sagrada: **hechos append-only sin estado vigente propio** (a diferencia de los agregados de 02). Cada hecho persiste con la plantilla completa:

```text
HECHO
  ├── identidad UUID + folio de negocio legible
  ├── tenant + contexto organizacional del hecho
  ├── actor + canal (web/móvil/API/IoT/regla) + marca IA si aplica
  ├── tiempo doble: fechaNegocio (cuándo ocurrió) + fechaRegistro (cuándo se supo)
  ├── datos del hecho (en lenguaje ETS-003/08)
  ├── versiones de configuración que lo gobernaron (formulario, regla, plantilla)
  ├── referencias: agregados afectados, hecho origen si es compensación,
  │   evidencias (referencias a archivos, 13), identidad provisional original si nació offline
  └── clave de idempotencia (dispositivo+secuencia o cliente API)
```

Correcciones **solo** compensatorias: el hecho corrector referencia al corregido, ambos visibles, la proyección neta la calculan los read models (04).

## 2. Checklists

- Un diligenciamiento = un hecho con: versión del formulario usada, respuestas completas (incluidas las estructuras dinámicas del formulario del tenant), hallazgos generados (cada hallazgo con identidad propia enlazada) y evidencias.
- Las respuestas se persisten **tal como el formulario las definió en esa versión**: si el tenant cambia el formulario mañana, los diligenciamientos viejos siguen legibles con su versión (05).
- Capturable offline: identidad provisional + validación a tiempo de negocio al sincronizar (12).

## 3. Combustible (y energía)

- `TanqueoRegistrado` / `CargaEnergiaRegistrada`: cantidad y unidad, costo, fuente (estación, tanque propio, cargador), lectura de medidor asociada, quién y dónde.
- Doble efecto en una transacción: el hecho + el movimiento de inventario si la fuente es tanque propio (mismo comando, un solo agregado por transacción → el descuento del tanque viaja como evento consumido por Inventory, 16).
- Es el dato de mayor volumen humano del sistema: particionado por tiempo desde el diseño (14) y candidato temprano a series de tiempo (19).

## 4. Horas Hombre

- Cada registro de trabajo: técnico, OT, duración o intervalo, tipo de labor, tarifa vigente referenciada (la tarifa aplicada queda **congelada en el hecho** — cambiar la tarifa después no reescribe costos históricos).
- El costo de mano de obra de una OT es proyección de estos hechos, jamás un campo editable.

## 5. Compras

- Cadena de hechos enlazados por referencias: solicitud → aprobación(es) → OC → recepción(es) → factura(s); cada eslabón es un hecho de su agregado con SoD verificada al escribir (aprobador ≠ creador, estructural).
- Las recepciones parciales son hechos independientes que suman; el estado de la OC (parcial/completa) es derivado.
- Los precios y condiciones quedan congelados en cada hecho: la historia de compras es evidencia contractual (retención larga, 10).

## 6. Movimientos de inventario

- Entrada, salida, transferencia, ajuste por conteo: cada uno un hecho con ítem, bodega(s), cantidad, costo unitario congelado, causa (OT, compra, conteo) referenciada.
- El ajuste por conteo físico NO es una edición del saldo: es un hecho de ajuste con la diferencia, el conteo como evidencia y aprobación si supera umbral configurado (ETS-005).
- El saldo vigente del agregado (02 §4) es la suma; la reconciliación automática los compara.

## 7. Asignaciones

- Activo→contexto, activo→persona, técnico→OT: hechos con vigencia (desde/hasta), donde el "hasta" lo escribe un hecho posterior de liberación o reasignación — nunca una edición del hecho original.
- Responden las preguntas históricas del dominio: quién tenía la máquina cuando ocurrió el daño, qué técnico estaba asignado esa semana.

## 8. Lecturas (medidores)

- Horómetro, odómetro, y las series IoT aceptadas: valor, medidor, fuente (humana/sensor), calidad declarada.
- La validación de monotonía es de dominio: una lectura menor a la anterior no se rechaza al vacío — se persiste **apartada** en estado de revisión (el hecho existe, no computa hasta resolverse: reinicio de medidor legítimo vs error de dedo).
- El reinicio de medidor es un hecho explícito que abre nueva serie sin perder la acumulada.
- Máximo volumen del sistema con IoT activo: retención de la telemetría cruda corta en la zona de aterrizaje, hechos aceptados permanentes pero particionados agresivamente y primeros en migrar a motor de series de tiempo (19).
