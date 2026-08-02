# 05 — Modelo de Capacidades

> **DeltaOps — ESI-005 · v1.0** · Cómo un módulo de negocio parte su funcionalidad en capacidades habilitables por tenant.
> Documento de diseño técnico. Sin código, sin implementación.

## 1. La unidad comercial y operativa

La capacidad (ETS-005, ESI-003/12) es la unidad de habilitación por tenant. El módulo de referencia demostró la mecánica con una sola; los módulos de negocio deben decidir **cuántas y cuáles** — y esa partición es una decisión de producto de primera clase.

## 2. Reglas de partición

1. **Capacidad = promesa funcional coherente**, no pieza técnica: "gestión de órdenes de trabajo" es una capacidad; "el comando cerrar OT" no lo es.
2. **Granularidad por defecto: una capacidad núcleo por módulo** (`capacidad_de_<modulo>`), más capacidades separadas solo para funcionalidad genuinamente opcional con demanda diferenciada (p. ej. `mantenimiento_predictivo` aparte del núcleo de OT). La carga de la prueba está en separar, no en unir.
3. **Sin capacidades dependientes cruzadas ocultas**: si una capacidad requiere otra (incluso de otro módulo), la dependencia se declara y la habilitación la valida; jamás "funciona raro" con la mitad encendida.
4. **Toda pieza expuesta pertenece a exactamente una capacidad** (ESI-003/12); no hay piezas "siempre disponibles" en módulos de negocio.
5. **La capacidad deshabilitada niega cerrado y distinguible** (primera denegación de ESI-004/05): sin fugas de existencia de datos.

## 3. Uso durante la construcción

Las capacidades son el mecanismo de entrega incremental (doc 03 §2.3): funcionalidad mergeada a `main` con su capacidad sin sembrar es invisible sin ramas largas ni flags artesanales. **Las capacidades del catálogo ETS-005 son el único mecanismo de encendido/apagado funcional**; no existen feature flags paralelos.

## Impacto sobre la implementación

Cada DGP-módulo entrega su mapa de capacidades (nombre, alcance, dependencias, plan de seed en los dos tenants) antes de la primera pieza; la cadena de evaluación ya existe en plataforma.

## Dependencias

ETS-005; ESI-003/12; ESI-004/04-05; docs 03-04 y 14; ESI-002/12 (seed).

## Riesgos

- Explosión de microcapacidades convirtiendo la habilitación en configuración imposible; mitigación: regla §2.2 (núcleo por defecto) y revisión del mapa en el ciclo de producto.
- Capacidades como muro comercial mal alineado con el dominio; mitigación: la partición la decide producto **con** arquitectura, y queda documentada con su porqué.

## Decisiones habilitadas

- Planes comerciales compuestos como conjuntos de capacidades.
- Entrega incremental sin ramas largas ni flags paralelos.

## Decisiones bloqueadas

- Prohibidos feature flags fuera del modelo de capacidades.
- Prohibidas dependencias de capacidad no declaradas.
- Prohibidas piezas expuestas sin capacidad asignada.

## Reusable Pattern

Las cinco reglas de partición §2 y el mapa de capacidades como formulario del DGP; el seed asimétrico de dos tenants (ESI-004/04) se replica para cada capacidad nueva.

## Anti-Patterns

- Una capacidad por endpoint (granularidad técnica).
- Comprobar la capacidad a mano en código (AP-07).
- Capacidades "de prueba interna" que llegan a producción sin catálogo.

## Knowledge Graph

- **ETS que consume**: ETS-005 (catálogo de capacidades), ETS-002 (dominios funcionales).
- **ESI que consume**: ESI-003/12; ESI-004/04; ESI-002/12.
- **DGP que originará**: la sección "mapa de capacidades" de cada DGP-módulo.
- **ADR relacionados**: ADR de habilitación declarativa por tenant (ESI-003/12).
- **Módulos que reutilizarán este patrón**: todos; Compras y SST son los candidatos típicos a capacidades opcionales separadas.
