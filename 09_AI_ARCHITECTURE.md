# 09_AI_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura técnica de IA: servicios, contexto, memoria, permisos, embeddings, RAG y agentes.
> El gobierno funcional está en ETS-005/11; la experiencia, en ETS-004/08. Aquí, la mecánica del módulo AI.
> Documento de diseño. No implementa nada.

---

## 1. Estructura del módulo AI

```text
MÓDULO AI (cero escritura sobre el dominio — Core)
├── Orquestador de capacidades   asistente, diagnóstico, preventivos,
│                                inventario, vigilancia, redacción, clasificación
├── Constructor de contexto      arma el contexto por petición desde read models
│                                permitidos (nunca el modelo de escritura)
├── Pasarela de modelos          catálogo de modelos aprobados (plataforma);
│                                proveedor intercambiable por capacidad
├── Memoria gobernada            (§4)
├── Índice semántico (preparado) embeddings + recuperación (§6)
└── Registro de sugerencias      toda salida trazada: qué vio, qué propuso,
                                 quién decidió (SugerenciaGenerada/Aceptada/Descartada)
```

## 2. Servicios de IA (capacidades como servicios internos)

Cada capacidad (ETS-005/11) es un servicio del módulo con: su disparador (petición del usuario, evento, calendario), su constructor de contexto específico, su modelo asignado, su umbral de confianza y sus métricas de aceptación. Se activan por Feature Flags por tenant y ámbito; ninguna comparte memoria con otra fuera de lo gobernado.

## 3. Contexto (construcción por petición)

1. **Fuente única:** vistas de contexto por entidad (read models de IA, ETS-006/12) — "todo lo relevante de este activo/OT" ya minimizado y con exclusiones del tenant aplicadas **antes** de llegar al modelo.
2. **Alcance del asistido:** el constructor consulta a Identity el alcance exacto del usuario en su contexto activo; lo que el usuario no puede listar, no entra al contexto — estructural, no un filtro posterior.
3. **Presupuesto de contexto:** cada capacidad define qué entra y en qué orden de prioridad (ficha → historial resumido → fallas similares del tipo); lo que no cabe se resume por recuperación (§6), no se trunca a ciegas.
4. **Trazado:** el registro de sugerencias guarda qué vistas y versiones alcanzó cada petición (linaje de la decisión, ETS-006/18).

## 4. Memoria

| Tipo | Contenido | Regla |
|---|---|---|
| **De conversación** | El hilo del asistente en curso | Por usuario y sesión; expira; nunca se comparte entre usuarios |
| **De calibración** | Umbrales, aceptación/descarte por capacidad | Por tenant; alimenta ajustes de configuración, no al modelo directamente |
| **De conocimiento del tenant** | Manuales, planes, historial — vía índice semántico (§6) | Derivada y reconstruible; respeta clasificación de datos |
| **Del modelo** | — | **No existe:** los datos del tenant no entrenan modelos salvo política explícita que lo permita, y siempre anonimizados (ETS-005/11) |

## 5. Permisos (aplicación técnica)

- La IA ejecuta **siempre en nombre de un usuario** (o de una vigilancia configurada con alcance declarado); jamás con superusuario.
- Doble barrera: el constructor de contexto filtra por alcance **y** las vistas de IA ya nacen minimizadas (defensa en profundidad).
- Salidas con permiso: una sugerencia solo se muestra a roles que podrían ver los datos que la sustentan.
- Cero comandos: el módulo AI no tiene dependencia hacia ningún contrato de escritura — la imposibilidad es estructural (verificación de fronteras, `02`), no disciplinaria.

## 6. Embeddings y RAG (preparado)

"Preparado" significa diseñado con el enchufe definido, activable sin rediseño:

1. **Índice semántico por tenant:** representaciones vectoriales de documentos (manuales, planes — `07_FILE_ARCHITECTURE.md`), historiales resumidos y catálogos, segregadas por tenant y clasificadas (lo Restringido no se indexa semánticamente salvo permiso explícito).
2. **Actualización por eventos** (documento nuevo/versionado, hecho relevante) — derivado reconstruible por replay, como todo índice.
3. **Recuperación aumentada:** el constructor de contexto consulta el índice para traer los fragmentos relevantes con su **cita** (documento, versión, sección); toda respuesta del asistente basada en recuperación muestra sus fuentes.
4. La pasarela de modelos abstrae también los modelos de representación (embeddings): intercambiables por configuración de plataforma.

## 7. Agentes

- **Hoy:** capacidades acotadas de un paso (sugerir, clasificar, vigilar, responder con fuentes). Un "agente" DeltaOps es una capacidad con plan de varios pasos de **solo lectura** (ej. investigar por qué subió el consumo: consultar series → comparar flota → revisar OTs recientes → redactar hallazgo con citas).
- **Reglas de agencia:** pasos limitados y trazados (cada consulta del plan queda registrada); presupuesto por petición (costo/latencia); el resultado siempre es una **propuesta con evidencia**, jamás una acción.
- **Futuro gobernado:** si algún día una acción de agente debe ejecutarse (crear una solicitud sugerida), técnicamente ocurre como en ETS-005: el agente encola la propuesta y un humano con permisos la confirma — el comando lo emite el humano. La arquitectura no deja atajo para lo contrario.

## 8. Modelos

- **Catálogo de plataforma** (ETS-005/11): proveedor, versión, capacidades, residencia, costo por uso; asignación por capacidad y tenant.
- **Pasarela única:** reintentos, tiempo máximo, presupuesto por tenant (Feature Flags de costo), registro de uso para facturación/licencia; caída del proveedor = capacidad degradada explícita (el asistente lo dice), jamás respuestas inventadas por un sustituto silencioso.
- **Evaluación continua:** cambios de modelo/versión pasan por publicación versionada con periodo de observación y métricas comparadas (aceptación, latencia, costo) antes de generalizarse.
