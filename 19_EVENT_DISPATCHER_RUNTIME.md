# 19 — Event Dispatcher Runtime

> **DeltaOps — ESI-003 · v1.0** · Del outbox a los consumidores: eventos fiables sin broker en el MVP.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Arquitectura congelada que este runtime materializa

ETS-008/009 fijan el patrón: los eventos de dominio se escriben en el **outbox dentro de la misma transacción** que el cambio de estado (doc 20), y un despachador los publica después. ESI-001 fija que el MVP no introduce broker externo: la mensajería vive en PostgreSQL con **bandejas** por consumidor y **cursores**.

```
caso de uso → UoW (cambio + outbox, una transacción)
   → relevo del outbox → bandejas por suscripción
   → consumidores (workers) → confirmación por cursor
```

## 2. Componentes del runtime

| Componente | Responsabilidad |
|---|---|
| **Outbox** | Registro transaccional de eventos emitidos, con sobre completo (tipo, versión, tenant, correlación, causa, fechaRegistro) según ETS-008 |
| **Relevo** | Proceso de background (doc 22) que mueve outbox → bandejas de los suscriptores declarados (doc 06), en orden, marcando avance con cursor |
| **Bandejas** | Una por consumidor: cola persistente con estado por mensaje (pendiente, en proceso, procesado, fallido) |
| **Consumidores** | Piezas de módulo que procesan mensajes bajo la tubería de workers (doc 10 §4): contexto reconstruido del sobre, UoW propia, idempotencia |
| **Bandeja muerta** | Destino de mensajes agotados los reintentos; con herramienta de inspección y reproceso |

## 3. Semántica de entrega

1. **Al menos una vez**: la entrega puede duplicarse; por eso todo consumidor es **idempotente por contrato**, usando la `clave_idempotencia` derivada del identificador del evento (ETS-009). La plantilla T07 (ESI-002/18) nace con esta protección.
2. **Orden por agregado**: se garantiza orden de procesamiento por agregado origen dentro de una bandeja; no existe orden global entre bandejas.
3. **Reintentos con retroceso progresivo** y tope configurable (plano plataforma, doc 08); agotado el tope, a bandeja muerta con alerta (doc 17).
4. **El fallo de un consumidor no frena a los demás**: bandejas independientes; la edad de cada bandeja es métrica de primera clase.

## 4. Reglas normativas

1. **Emitir solo por outbox**: prohibido publicar eventos fuera de la transacción del caso de uso; prohibido el despacho síncrono en memoria como mecanismo de integración entre módulos.
2. **El sobre es contrato** (ETS-008): versión del tipo de evento incluida; los cambios siguen las reglas de compatibilidad N/N-1 (ESI-002/21).
3. **Consumir es un caso de uso**: el consumidor delega en piezas de aplicación normales, con contexto, permisos de actor-sistema y UoW; nada de lógica en el borde del consumo.
4. **Reprocesar es operación normal**: la bandeja muerta tiene procedimiento escrito de inspección y reproceso; la idempotencia lo hace seguro.
5. **La migración futura a broker** (prevista en ESI-001 como evolución) cambia el transporte de bandejas, no los contratos: outbox, sobre e idempotencia sobreviven tal cual.

## Impacto sobre la implementación

El DGP de plataforma implementa outbox, relevo, bandejas y la tubería de consumo; los DGP de módulo solo escriben consumidores con T07. Las tablas siguen ETS-010.

## Dependencias

Docs 06, 08, 09, 10, 20 y 22; ETS-008 (sobre), ETS-009 (outbox, cursores, idempotencia); ESI-001.

## Riesgos

- Relevo rezagado que retrasa todos los consumos; mitigación: métrica de retraso del relevo con alerta y relevo escalable por lotes.
- Consumidores no idempotentes que se cuelan; mitigación: plantilla obligatoria + prueba de duplicado exigida en la definición de hecho del consumidor (ESI-002/25).

## Decisiones habilitadas

- Integración entre módulos exclusivamente por eventos con garantías conocidas.
- Evolución a broker externo sin tocar contratos de módulo.

## Decisiones bloqueadas

- Prohibido el despacho síncrono en memoria entre módulos.
- Prohibida la emisión de eventos fuera del outbox.
- Prohibido introducir broker externo en el MVP.
