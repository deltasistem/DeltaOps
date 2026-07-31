# 06_OFFLINE_TECHNICAL.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura técnica offline: sincronización, cola local, resolución, reintentos, compresión y versionado.
> La estrategia de datos está en ETS-006/14; la experiencia, en ETS-004/06. Aquí, la mecánica técnica.
> Documento de diseño. No implementa nada.

---

## 1. Componentes en el dispositivo

```text
APP MÓVIL (PWA offline-first)
├── Almacén local cifrado
│   ├── Paquete de alcance      read models del usuario (mis OTs, activos del
│   │                           frente, catálogos, stock básico) con cursor
│   ├── Paquete de configuración formularios/workflows/reglas locales resueltos,
│   │                           con versiones declaradas
│   ├── COLA LOCAL (outbox)     comandos capturados, append-only, cifrada,
│   │                           persistente a cierre/reinicio (U-16)
│   └── Evidencias pendientes   fotos/firmas/audio, comprimidas, subida diferida
├── Motor de formularios local  ejecuta plantillas y validaciones declarativas
│                               (las mismas definiciones que el servidor)
└── Agente de sincronización    estado: en línea / sin señal / N pendientes
```

## 2. La cola local (outbox del dispositivo)

1. **Registro por comando:** intención de negocio + datos + clave de idempotencia (dispositivo+secuencia) + tiempo de negocio + contexto activo local + versiones de configuración usadas + referencias a evidencias.
2. **Append-only y cifrada** (datos en reposo del dispositivo — ETS-006/13); solo se poda lo **confirmado** por el servidor y con evidencias subidas.
3. **Orden preservado por secuencia local:** el servidor procesa en orden de captura por dispositivo.
4. **Identidades provisionales:** las entidades creadas offline usan identificadores locales universalmente únicos; el servidor asigna folio definitivo al confirmar y devuelve el mapa provisional→definitivo, que el dispositivo aplica a referencias pendientes (una solicitud creada offline referenciada por una foto posterior).

## 3. Protocolo de sincronización

```text
SUBIDA (prioridad 1)
  1. Enviar lote de comandos pendientes (comprimido)
  2. Servidor (módulo Mobile): idempotencia → traducir a comandos de dominio
     → cada agregado valida (permisos a tiempo de negocio, invariantes)
  3. Respuesta por comando: CONFIRMADO (folio) | RECHAZADO (motivo de negocio)
     | EN REVISIÓN (bandeja humana)
  4. Dispositivo: aplica mapa de identidades, mueve rechazados a "atención"
SUBIDA (prioridad 2)  evidencias por partes, reanudables, según red
BAJADA                delta por cursor: cambios del alcance desde la última sync
                      (nuevas OTs asignadas, cierres, catálogos, configuración)
```

- **Automática** al detectar red (y periódica con red presente); manual nunca requerida.
- **Lotes pequeños y atómicos por comando** (no por lote): un comando rechazado no bloquea a los demás.
- **Resolución de conflictos: en el servidor, por reglas de dominio** (tabla de ETS-006/14). El dispositivo nunca resuelve conflictos: reporta y muestra.

## 4. Reintentos y resiliencia

1. **Espera creciente con variación aleatoria** (evitar estampidas de cuadrillas recuperando señal a la vez); sin límite de abandono para la cola local: los hechos esperan lo necesario.
2. **Reanudable todo:** subidas de evidencias por partes con verificación; paquetes iniciales descargables por tramos.
3. **Idempotencia extremo a extremo:** reintentar jamás duplica (clave de origen, U-19).
4. **Ráfagas absorbidas por colas de entrada del servidor** (ETS-006/16): la sincronización masiva no rechaza; nivela.
5. **Presupuesto de batería/datos:** GPS y cámara por evento (U-25); sincronización sensible al tipo de red (evidencias grandes pueden esperar Wi-Fi según política del tenant).

## 5. Compresión

- **Comandos:** lotes comprimidos (texto estructurado comprime en gran factor); campos repetidos normalizados por diccionario del lote.
- **Evidencias:** fotos recomprimidas en el dispositivo a calidad de evidencia configurable por el tenant (documentable ≠ artística), preservando metadatos de captura (hora, GPS si el hecho lo exige); miniaturas generadas al subir (`07_FILE_ARCHITECTURE.md`).
- **Paquetes de bajada:** delta comprimido; catálogos y plantillas con versión — solo viajan los cambiados.
- Operable en 3G (U-26): el diseño dimensiona los paquetes para redes lentas, no las trata como excepción.

## 6. Versionado del protocolo y de los paquetes

1. **Triple versión declarada en cada intercambio:** protocolo de sincronización, paquete de configuración, esquema de read models. El servidor soporta N y N-1 como mínimo: **ninguna actualización del servidor deja mudo a un dispositivo en campo.**
2. **Hechos con versión vieja de configuración: válidos** (lo en vuelo termina con su versión — ETS-005); la actualización del paquete aplica al siguiente uso.
3. **Actualización de la app:** las versiones mínimas soportadas se anuncian con antelación; un dispositivo fuera de soporte conserva su cola local intacta y sincroniza tras actualizar (la cola es independiente de la interfaz).
4. **Esquema local migrable:** el almacén del dispositivo migra sus estructuras al actualizar la app sin perder la cola — la cola es lo último que se toca y lo primero que se verifica.
