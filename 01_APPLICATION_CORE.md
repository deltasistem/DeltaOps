# 01_APPLICATION_CORE.md

> **DeltaOps — ETS-011 · v1.0** · Arquitectura del Núcleo de Aplicación: la visión de conjunto de la que derivan los 27 documentos restantes.
> Documento de diseño. Sin código, sin clases, sin framework.

---

## 1. Qué es el Core

El Núcleo de Aplicación es **todo lo que DeltaOps sabe hacer, independiente de cómo se le hable y de dónde guarde**. HTTP, PostgreSQL, colas, almacén de objetos y proveedores de IA son detalles reemplazables detrás de puertos; el Core no los conoce por nombre.

```text
            ┌─────────────────────────────────────────────┐
 ENTRADA →  │  ADAPTADORES DE ENTRADA (API, sync, jobs)   │
            ├─────────────────────────────────────────────┤
            │  APLICACIÓN   casos de uso · pipelines ·    │
            │               unit of work · despachador    │
            ├─────────────────────────────────────────────┤
            │  DOMINIO      agregados · eventos · motores │
            │               · políticas · invariantes     │
            ├─────────────────────────────────────────────┤
            │  KERNEL       contratos universales (02)    │
            ├─────────────────────────────────────────────┤
 SALIDA  ←  │  ADAPTADORES DE SALIDA (BD, objetos, IA…)   │
            └─────────────────────────────────────────────┘
        La Regla de Dependencia apunta SIEMPRE hacia adentro.
```

## 2. Capas (definición normativa)

| Capa | Contiene | Conoce | Jamás conoce |
|---|---|---|---|
| **Kernel** | Contratos universales: contexto de ejecución, resultado, error, sobre de evento, identidad, tiempo doble (02) | Nada externo | Todo lo demás |
| **Dominio** | Agregados y eventos (ETS-003), Domain Services (04), invariantes, políticas de negocio (05) | Kernel | Aplicación, puertos de infraestructura, HTTP, SQL |
| **Aplicación** | Casos de uso (03), pipelines (11-22), Unit of Work (08), puertos (06) | Dominio + Kernel | Adaptadores concretos, framework web, motor de BD |
| **Adaptadores** | Implementaciones de puertos (07) y traducción de protocolo de entrada | Aplicación (sus puertos y casos de uso) | — (es la capa más externa) |

## 3. Principios operativos del Core

1. **CQRS estructural**: comandos y consultas son tuberías separadas de punta a punta (11, 12) — un comando jamás devuelve una proyección rica; una consulta jamás muta.
2. **Un módulo = un core**: cada módulo ETS-007 tiene su dominio y su aplicación propios; entre módulos solo circulan eventos y contratos publicados (23) — el mismo límite que los esquemas físicos (ETS-010/02).
3. **Configuration First en el núcleo**: ningún caso de uso lee configuración cruda; recibe la **configuración resuelta y versionada** del pipeline 15, y congela las versiones usadas en el hecho (ETS-009/05).
4. **Offline First como igualdad de canales**: el comando que llega por sincronización móvil recorre exactamente la misma tubería que el de la web — la idempotencia y el tiempo doble son del Kernel, no un parche del canal (18 de ETS-010).
5. **Event Driven interno y externo**: todo cambio de verdad emite eventos por outbox en la misma transacción (08); todo lo derivado (proyecciones, notificaciones, búsqueda, IA, integraciones) es consumidor (10).
6. **El Core es testeable en memoria**: dominio y aplicación se prueban completos con adaptadores falsos (25) — si una prueba exige levantar infraestructura, la Regla de Dependencia está rota.

## 4. Mapa de los 28 documentos

Kernel y capas (01-02) → piezas (03-07: casos de uso, motores, políticas, puertos, adaptadores) → transacción y eventos (08-10) → pipelines transversales (11-22) → gobierno (23-24) → calidad y futuro (25-28).

---

## Impacto sobre la implementación
Toda la implementación futura se organiza por estas capas y módulos; ninguna decisión de framework puede violar la Regla de Dependencia; los revisores rechazan código que la cruce.

## ETS relacionados
ETS-002 (arquitectura empresarial) · ETS-003 (dominio) · ETS-007 (módulos y NT) · ETS-008 (contratos que los adaptadores de entrada sirven) · ETS-009/010 (persistencia que los adaptadores de salida implementan).

## Riesgos
- "Capa de aplicación anémica" que deja lógica en adaptadores → las pruebas en memoria (§3.6) lo delatan.
- Cortocircuitos entre módulos por comodidad → regla 23 + lint de dependencias.

## Decisiones habilitadas
Los 27 documentos siguientes; la estructura de paquetes (24); los criterios de revisión de arquitectura.

## Decisiones bloqueadas
Lenguaje, framework y librerías concretas del Core (implementación); cualquier código.
