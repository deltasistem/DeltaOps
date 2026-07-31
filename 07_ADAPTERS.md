# 07_ADAPTERS.md

> **DeltaOps — ETS-011 · v1.0** · Adaptadores conceptuales: cómo lo externo se conecta a los puertos sin contaminar el Core.
> Documento de diseño. Sin código, sin clases.

---

## 1. Dos familias

**Adaptadores de entrada** (invocan casos de uso):

| Adaptador | Traduce |
|---|---|
| API HTTP | Contratos ETS-008 ↔ sobres del Kernel; construye el Contexto de Ejecución desde autenticación y encabezados; proyecta Resultados al sobre HTTP y errores al catálogo |
| Sincronización móvil | Bitácoras de dispositivo ↔ comandos individuales (ETS-008/12); mismo pipeline que la web, con canal `movil` y tiempo doble real |
| Consumidores de eventos | Eventos despachados ↔ casos de uso internos (proyectores, motores de reacción, 03 §5) con cursor |
| Programador de jobs | Cron de plataforma ↔ casos de uso internos (temperaturas, reconciliaciones, sellos, snapshots) |
| Receptores de integración | Webhooks/archivos entrantes ↔ comandos por mapeo versionado (22) |

**Adaptadores de salida** (implementan puertos del 06): persistencia PostgreSQL (repositorios, outbox, idempotencia, lectores — contra el diseño físico ETS-010), almacén de objetos, canales de notificación, proveedores de IA, conectores, telemetría, reloj e identidad reales.

## 2. Reglas normativas

1. **Delgados por definición**: un adaptador traduce y transporta; jamás valida negocio, jamás decide, jamás compone casos de uso. La prueba: si se reescribe el adaptador desde cero, ninguna regla de negocio se pierde.
2. **La traducción de errores es suya**: lo físico (violación de constraint, timeout, conflicto) se traduce al vocabulario del puerto (06 §3.4); el error crudo del motor jamás sube (12 de ETS-010 §3).
3. **El mapeo objeto↔fila vive en el adaptador de persistencia**: el dominio no conoce columnas; el adaptador materializa la plantilla física (universales, tiempo doble, versiones congeladas — ETS-010/22) desde el sobre del Kernel.
4. **Un adaptador por tecnología por módulo** en persistencia (el repositorio de OTs escribe solo en `ordenes_trabajo` — la propiedad de esquemas ETS-010/02 se refuerza con credenciales por rol 01 §3).
5. **Intercambiables demostrablemente**: cada puerto corre con su fake en las pruebas del Core (25) y con el real en las de integración — la misma suite de contrato valida a ambos (el fake honesto es el que pasa las mismas pruebas que el real).
6. Los adaptadores de entrada son los únicos que conocen protocolo (HTTP, colas, cron); los de salida, los únicos que conocen SQL/SDKs. **Nada en medio conoce ninguno de los dos.**

---

## Impacto sobre la implementación
Define dónde vive cada traducción; la implementación de persistencia sigue el diseño físico ETS-010 exclusivamente desde adaptadores; las suites de contrato de puerto se escriben una vez y validan fake y real.

## ETS relacionados
ETS-008 (contratos de entrada) · ETS-010 (persistencia física) · ETS-011 (06 puertos, 25 pruebas de contrato, 26 errores).

## Riesgos
- Lógica que se sedimenta en adaptadores (el "mientras tanto aquí") → regla §2.1 y revisión; señal: pruebas de adaptador que prueban reglas.
- Fakes que divergen del real → suite de contrato compartida (§2.5).

## Decisiones habilitadas
Plan de adaptadores por módulo, suites de contrato, credenciales por rol en persistencia.

## Decisiones bloqueadas
Tecnologías concretas de cada adaptador (framework HTTP, driver, SDKs) — implementación.
