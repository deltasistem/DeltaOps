# 15 — Read Model de Referencia

> **DeltaOps — ESI-004 · v1.0** · El Resumen de Elementos: una proyección mantenida por eventos, consultada sin tocar el dominio.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. El modelo de lectura

| Atributo | Valor |
|---|---|
| Nombre | Resumen de Elementos de Referencia |
| Contenido | Por tenant: totales por estado y fecha de última activación — el dato agregado que el listado (doc 06) no debe calcular al vuelo |
| Almacén | Tabla de proyección propia del módulo (ETS-010), bajo RLS como todo |
| Mantenimiento | Consumidor suscrito a Elemento de Referencia Activado (y a los demás hechos del ciclo de vida) que actualiza la proyección en su propia UoW |
| Consulta | Lector del plano de lectura con contrato ETS-008; mismo patrón que doc 06 |
| Consistencia | Eventual y explícita: el contrato declara que el resumen converge; la UI lo presenta como resumen, no como verdad transaccional |

## 2. Qué demuestra

1. **El ciclo completo evento → proyección → consulta**: la mitad asíncrona del pipeline (doc 07) con un caso concreto y verificable.
2. **Idempotencia del consumidor**: el evento duplicado no cuenta dos veces — la proyección registra el identificador de evento procesado (técnica estándar, ETS-009) y la prueba lo fuerza.
3. **Reconstrucción**: la proyección puede reconstruirse desde el estado actual de los agregados mediante un trabajo por lotes (ESI-003/22) — la prueba la vacía y la reconstruye. **Toda proyección debe ser reconstruible o su diseño está mal.**
4. **Orden por agregado**: los hechos del mismo elemento se procesan en orden (ESI-003/19); la prueba de secuencia lo verifica.

## 3. Reglas normativas

1. Una proyección pertenece a **un módulo y un propósito de lectura**; prohibidas las "tablas de reporting" multipropósito que acumulan columnas de todos.
2. El consumidor **no toma decisiones de negocio**: proyecta hechos. Si un hecho exige reaccionar con reglas, esa reacción es un caso de uso aparte (ESI-003/19 regla 3).
3. La proyección jamás se escribe desde el comando: solo el consumidor la mantiene. Un solo escritor por tabla de proyección.
4. La reconstrucción es una operación documentada del módulo (doc 20), no un script heroico.

## Impacto sobre la implementación

Instancia canónica de la plantilla T07 (consumidor) y del patrón de proyección. La técnica de registro de eventos procesados entra a la base de consumidor de plataforma.

## Dependencias

Docs 06, 07, 14; ESI-003/19, /21 y /22; ETS-009 (idempotencia), ETS-010 (tabla), ETS-011 (plano de lectura).

## Riesgos

- Proyecciones divergiendo en silencio; mitigación: verificación periódica proyección-vs-agregados por trabajo programado con métrica de divergencia (ESI-003/17), incluida en el ejemplar.

## Decisiones habilitadas

- Patrón cerrado para toda lectura agregada/desnormalizada futura.
- Base de consumidor con registro de procesados como infraestructura común.

## Decisiones bloqueadas

- Prohibido escribir proyecciones desde comandos.
- Prohibidas proyecciones no reconstruibles.
- Prohibidas tablas de lectura multipropósito entre módulos.

## Reusable Pattern

Los DGP futuros copian: el formulario §1, las cuatro demostraciones §2 como pruebas obligatorias de toda proyección (ciclo, idempotencia, reconstrucción, orden), y la regla de un solo escritor.

## Anti-Patterns

- Calcular agregaciones pesadas al vuelo en cada listado "mientras tanto".
- Consumidores que además llaman servicios externos y deciden negocio.
- Proyecciones "temporalmente" alimentadas por triggers de BD.
