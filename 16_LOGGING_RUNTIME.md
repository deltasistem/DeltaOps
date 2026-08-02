# 16 — Logging Estructurado

> **DeltaOps — ESI-003 · v1.0** · Cada línea es un registro estructurado con tenant y correlación, o no es un log.
> Documento de diseño técnico. Sin código, sin clases, sin configuraciones.

## 1. Modelo oficial

Todo log de DeltaOps es **estructurado (clave-valor), en salida estándar del proceso**, para que la plataforma de despliegue lo recoja (ESI-001, ESI-002/10: la imagen no escribe archivos). El logger es una pieza de plataforma inyectada; ningún módulo configura logging ni usa el logging global del lenguaje directamente.

## 2. Campos obligatorios

| Campo | Contenido |
|---|---|
| Marca temporal | UTC, precisión de milisegundos |
| Nivel | DEBUG / INFO / WARNING / ERROR |
| Mensaje | Frase corta en español, estable, sin interpolación de datos (los datos van en campos) |
| Correlación | Identificador de correlación del contexto (doc 09) |
| Tenant y actor | Del contexto; "sistema" cuando aplique |
| Origen | Proceso (api/worker), módulo y pieza |
| Campos del evento | Estructurados, específicos de la línea |

El enriquecimiento con contexto es automático: la plataforma añade correlación, tenant y actor a toda línea emitida dentro de una unidad de trabajo, mediante el mecanismo contextual permitido en doc 09 (regla 3, uso interno de plataforma).

## 3. Niveles y uso

1. **ERROR**: fallos técnicos que requieren atención; siempre con detalle completo del fallo. Un ERROR sin acción posible es un nivel mal elegido.
2. **WARNING**: degradaciones y anomalías toleradas (reintentos, caídas de dependencias no críticas).
3. **INFO**: hitos de negocio y de ciclo de vida (arranque, apagado, casos de uso relevantes, denegaciones de acceso).
4. **DEBUG**: diagnóstico fino; apagado por defecto fuera de DEV (plano despliegue, doc 08).
5. El nivel se configura por proceso, no por módulo, en el MVP.

## 4. Reglas normativas

1. **Prohibidos datos sensibles**: nunca contraseñas, tokens, secretos, ni PII más allá de identificadores opacos (ESI-002/08). Los campos estructurados permitidos por tipo de línea se definen para poder auditarlo.
2. **Sin logs de formato libre**: prohibido concatenar datos en el mensaje; los recolectores dependen de la estructura.
3. **El log no es auditoría**: la auditoría de negocio (ETS-006) es un registro de dominio persistido con garantías; los logs son operativos y efímeros. Prohibido cumplir requisitos de auditoría con logs.
4. **El log no es métrica**: contar cosas es trabajo de observabilidad (doc 17); prohibido construir dashboards contando líneas de log como mecanismo primario.
5. **Presupuesto de ruido**: el log de acceso (doc 10) registra una línea por petición; los casos de uso registran hitos, no cada paso. El exceso de log se trata como defecto en revisión.

## Impacto sobre la implementación

El DGP de plataforma implementa el logger estructurado, el enriquecimiento contextual y el log de acceso. Las plantillas (ESI-002/18) muestran el patrón de uso correcto.

## Dependencias

Docs 08, 09, 10 y 17; ESI-001 (librería aprobada), ESI-002/08 y /10; ETS-006 (frontera con auditoría).

## Riesgos

- Fuga de datos sensibles por campos mal elegidos; mitigación: lista de campos permitidos + revisión + escaneo automático en la puerta (ESI-002/14).
- Ruido que encarece almacenamiento y esconde señales; mitigación: presupuesto de ruido y niveles bien aplicados en revisión.

## Decisiones habilitadas

- Correlación extremo a extremo entre API, workers y eventos.
- Recolectores y retención definidos por operación sin tocar la aplicación.

## Decisiones bloqueadas

- Prohibido el logging global directo del lenguaje en módulos.
- Prohibido escribir archivos de log desde el proceso.
- Prohibido usar logs como auditoría o como métricas primarias.
