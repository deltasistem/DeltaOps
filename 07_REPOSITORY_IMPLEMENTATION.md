# 07_REPOSITORY_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Repositories: la memoria del agregado, ni más ni menos.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. La forma del repositorio

Un repositorio (puerto, ETS-011/06) es la colección lógica de UN tipo de agregado:

```
OPERACIONES CANÓNICAS (y prácticamente las únicas):
  obtener(identidad)            → el agregado completo o ausencia explícita
  obtenerParaActualizar(id)     → agregado + versión para concurrencia optimista
  guardar(agregado, versiónEsperada)  → dentro del Unit of Work
```

## 2. Reglas de implementación

1. **Un repositorio por agregado, no por tabla**: el repositorio reconstruye y persiste el agregado completo (raíz + internos) como una unidad; las tablas que lo componen son asunto del adaptador (ETS-010/02), invisible para el dominio.
2. **Sin métodos de consulta de negocio**: nada de `buscarPorEstadoYFecha(...)` — las lecturas de pantalla son lectores de read models (03), no repositorios. Las únicas búsquedas admisibles en un repositorio son las que un comando necesita para decidir (por identidad o clave natural única del agregado).
3. **La interfaz vive en dominio, la implementación en adaptadores** (Regla de Dependencia): el vocabulario de la firma es de negocio; ningún tipo de la tecnología de persistencia se asoma a la interfaz.
4. **Versión optimista siempre presente**: `guardar` exige la versión esperada; el conflicto se traduce al código de catálogo correspondiente (02 §regla 8). No existe `guardar` sin control de versión.
5. **Ausencia explícita, no nulos silenciosos**: `obtener` de una identidad inexistente devuelve ausencia tipada; el caso de uso decide si eso es rechazo o creación — nunca una excepción de infraestructura escapa como control de flujo.
6. **Doble implementación obligatoria** (ETS-011/06): el fake en memoria es un ciudadano de primera — se mantiene con la misma seriedad que el real y ambos pasan la MISMA suite de contrato (colección lógica: lo guardado se recupera idéntico, versiones avanzan, conflictos se detectan).
7. **El repositorio no publica eventos, no audita, no notifica**: guarda estado. Los eventos van al outbox por el Unit of Work (11); mezclar responsabilidades aquí es el camino clásico a la inconsistencia.
8. **Sin cachés de agregados en la capa de dominio/aplicación**: la lectura para decidir es siempre la verdad transaccional; el caché pertenece a read models y respuestas de consulta, jamás al camino del comando.

## 3. Prueba obligatoria

La suite de contrato del repositorio corre dos veces: contra el fake (en cada build, milisegundos) y contra el real (en integración, con la base física de ETS-010). Un fake que diverge del real es un bug de máxima prioridad: invalida silenciosamente todas las pruebas de casos de uso.

---

## Impacto sobre la implementación
Los repositorios delimitan qué se puede pedir a la persistencia desde el negocio; su pobreza deliberada de métodos es la fuerza que mantiene CQRS de verdad.

## ETS relacionados
ETS-011 (06, 08, 25) · ETS-010 (02 esquemas por módulo, 12 RLS) · ETS-009 (persistencia por agregado) · ETS-012 (03, 11).

## Riesgos
- Métodos de consulta acumulándose "porque ya está ahí" → regla 2; toda firma nueva de repositorio se justifica ante un comando concreto.
- Fakes desactualizados → la suite de contrato compartida en CI lo hace imposible de ignorar.

## Decisiones habilitadas
Pruebas de caso de uso instantáneas, cambio de tecnología de persistencia sin tocar dominio, revisión de firmas simple.

## Decisiones bloqueadas
Mapeo físico agregado↔tablas — ya normado en ETS-010; la técnica concreta de mapeo se decide con el stack.
