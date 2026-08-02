# 16_CONFIGURATION_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Configuración: una sola manera de preguntar "¿cómo se comporta esto aquí?".
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Los dos mundos de configuración (nunca mezclarlos)

| Mundo | Qué es | Dónde vive | Quién la consume |
|---|---|---|---|
| **De negocio** | la variabilidad por tenant/nodo (ETS-005) | plataforma de configuración, cascada, versionada | Policies y motores, resuelta y congelada |
| **De despliegue** | endpoints, credenciales, afinación técnica | entorno/secretos del despliegue | solo `arranque/` y adaptadores |

Confundirlos es el error clásico: un umbral de negocio en variable de entorno es invisible al tenant e inauditable; una credencial en la plataforma de configuración es una fuga.

## 2. Reglas de implementación

1. **Un solo resolutor, de plataforma** (ETS-011/15): ningún módulo implementa lógica de cascada plataforma→tenant→nodo; se pide al resolutor por clave y contexto, y se recibe valor + versión + procedencia.
2. **Resolución al inicio del comando, congelada hasta el final**: el pipeline resuelve TODAS las claves declaradas en los metadatos, de una vez; el caso de uso y el dominio reciben valores, jamás el resolutor. Ninguna pieza re-consulta configuración a mitad de una decisión.
3. **Las versiones usadas quedan en el hecho** (ETS-011/15): los eventos y la auditoría registran qué versión de configuración participó — la explicabilidad retroactiva ("¿por qué se aprobó esto en marzo?") se implementa guardando, no reconstruyendo.
4. **Claves tipadas y registradas**: toda clave existe en el registro de definiciones (ETS-005) con tipo, valores admisibles y defecto de plataforma ANTES de que el código la consuma; una clave consultada sin definición es error de arranque, no un `null` en producción.
5. **Deny-by-default ante ausencia** (06 §regla 1): resolutor sin respuesta para una clave obligatoria = rechazo con código específico; el código de negocio jamás inventa el valor.
6. **Los paquetes móviles usan el mismo resolutor** (Offline First, ETS-011/15): la configuración que viaja al dispositivo es una resolución serializada con sus versiones; el cliente móvil evalúa contra ese paquete congelado y el servidor re-valida al sincronizar — misma semántica en ambos lados.
7. **Configuración de despliegue solo en el borde**: `arranque/` la lee, valida su presencia completa al iniciar (15 §regla 5) y construye los adaptadores con ella; ninguna clase de dominio/aplicación lee variables de entorno, jamás.

## 3. Prueba obligatoria

Matriz de configuración por clave (ETS-011/25): valores admisibles × niveles de cascada × ausencia. El resolutor de plataforma tiene su propia suite (precedencia, versionado, procedencia). Los casos de uso se prueban con configuraciones inyectadas directamente — sin resolutor real, porque solo reciben valores.

---

## Impacto sobre la implementación
Configuration First se vuelve mecánico: declarar la clave, escribir la Policy, dejar que el pipeline resuelva; el tenant cambia comportamiento sin despliegue y cada decisión es explicable a posteriori.

## ETS relacionados
ETS-005 (la plataforma completa) · ETS-011 (15, 05) · ETS-010 (proyección configuracion_resuelta) · ETS-012 (06, 12).

## Riesgos
- Valores de negocio colándose a variables de entorno "por rapidez" → tabla del §1 en el checklist de PR.
- Claves consultadas dinámicamente (nombres construidos en runtime) → prohibido; las claves de una operación son sus metadatos, estáticas e inspeccionables.

## Decisiones habilitadas
Cambio de comportamiento sin despliegue, explicabilidad retroactiva, paquetes móviles coherentes.

## Decisiones bloqueadas
Almacenamiento físico y caché del resolutor — normados en ETS-005/010; la técnica concreta llega con el stack.
