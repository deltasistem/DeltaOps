# 13_STORAGE_STRATEGY.md

> **DeltaOps — ETS-009 · v1.0** · Estrategia de almacenamiento: datos, archivos, objetos, metadatos y miniaturas.
> Documento de diseño. Sin tablas, sin SQL.

---

## 1. Los tres almacenes

```text
ALMACÉN ESTRUCTURADO (motor gestionado, ETS-007/14)
  la verdad y sus derivados consultables: agregados, hechos, eventos,
  configuración, read models, vistas — todo lo de 01-12

ALMACÉN DE OBJETOS
  binarios inmutables: evidencias, documentos (por versión), fotos,
  reportes emitidos, exportaciones, paquetes fríos (10), respaldos (17)

ALMACENES EFÍMEROS
  cache (ETS-007/11), colas en tránsito, zona de aterrizaje IoT,
  zonas de consulta temporal de rehidratación — sin durabilidad prometida
```

Regla de asignación: **si es consultable y estructurado va al motor; si es binario inmutable va a objetos; si es reconstruible y caduco va a efímero.** Nada binario dentro del motor estructurado (los binarios nunca atraviesan la API ni el motor, ETS-008/11 §1); nada permanente en lo efímero.

## 2. Datos (almacén estructurado)

- Separación lógica por módulo dentro del motor (esquemas/propiedad por módulo, ETS-007 NT-03) y por plano (verdad vs derivados): los derivados pueden moverse a réplicas o motores dedicados sin tocar la verdad (15, 19).
- Cifrado en reposo total con claves por tenant (ETS-006/13); tenant obligatorio en toda estructura (14).
- Capacidades exigidas al motor, no marcas: transacciones fuertes, append eficiente, JSON/documentos para atributos dinámicos y respuestas de formularios (cuya forma la define la versión del formulario, 05 §4), particionado, texto completo básico.

## 3. Archivos y objetos

- Todo binario es **inmutable desde su verificación** (huella comprobada, antimalware, tipo real — ETS-008/11 §2): una edición de documento es un objeto nuevo (versión nueva, 05 §3).
- Organización lógica por tenant → categoría (evidencia/documento/reporte/exportación) → dueño lógico; el nombre físico es opaco (UUID del archivo), jamás significativo ni adivinable.
- Acceso exclusivamente por URLs firmadas de corta vida (NT-09); permisos del dueño lógico evaluados en cada emisión; accesos a Restringido auditados uno a uno.
- Clases de temperatura del almacén de objetos alineadas con 10 §1: caliente (recientes/frecuentes) → frío (viejos/raros), transición por edad de acceso, transparente al contrato.
- Redundancia geográfica según residencia de datos del tenant (la región del tenant manda, ETS-006/13).

## 4. Metadatos

- **Los metadatos de todo binario viven en el plano de la verdad** (motor estructurado): dueño lógico, nombre original, tipo verificado, tamaño, huella, clasificación, autor, tiempo, versión, estado (pendiente/disponible/cuarentena/archivado).
- El binario sin su metadato no existe para el sistema; el metadato sin binario es un estado visible (pendiente de subida, ETS-008/12 §5).
- Reconciliación periódica metadatos↔objetos en ambas direcciones: objetos huérfanos (subidas abandonadas) se purgan tras plazo; metadatos sin objeto disparan alerta de integridad — jamás silencio.
- La huella criptográfica en el metadato hace todo binario **verificable para siempre** (evidencia legal: lo descargado es lo capturado).

## 5. Miniaturas y derivados de binarios

- Miniaturas, previsualizaciones y transcodificaciones son **derivados desechables** (mismo régimen que read models): regenerables del original, sin respaldo, en almacenamiento caliente + CDN aunque el original esté frío (encontrar y hojear es caliente; traer el original puede ser frío, 10 §1).
- Catálogo cerrado de tamaños/formatos por plataforma (no derivados arbitrarios por petición); generación asíncrona tras la verificación del original.
- Las anotaciones sobre imágenes son binarios propios (capa separada) con su metadato, enlazados al mismo dueño lógico: el original jamás se altera (ETS-008/11 §5).
