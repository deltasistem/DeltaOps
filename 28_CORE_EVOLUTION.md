# 28_CORE_EVOLUTION.md

> **DeltaOps — ETS-011 · v1.0** · Estrategia de evolución del Core: cómo crece sin degradarse.
> Cierra la serie ETS-011. Documento de diseño. Sin código.

---

## 1. Los cambios previstos y su camino

| Cambio | Camino |
|---|---|
| **Módulo nuevo** | Plantilla de módulo (24 §2.1): contratos + dominio + aplicación + adaptadores + esquema físico propio (ETS-010/02); se registra en arranque; ningún módulo existente se toca — el crecimiento es aditivo |
| **Caso de uso nuevo** | Entrada al catálogo (ETS-008 primero — API First), metadatos, dominio, pruebas de sus matrices (25); el pipeline no cambia |
| **Variabilidad nueva** | Si es respuesta nueva a pregunta existente: configuración (ETS-005), cero código. Si es pregunta nueva: Policy nueva gobernada (05 §3.1) |
| **Evento con forma nueva** | Versionado de esquema de evento con traducción al leer (upcasting, ETS-009/18): los eventos históricos jamás se reescriben; los consumidores N-1 siguen vivos (ETS-008/09) |
| **Cambio del Kernel** | El más gobernado (02 §3.1): compatible siempre, coordinado con sus proyecciones (sobre HTTP y columnas físicas), con periodo de convivencia |
| **Pipeline con etapa nueva** | Cambio de plataforma: diseño, revisión de arquitectura, activación medible; los módulos la heredan sin tocarse (11 §2.3) |
| **Extracción de módulo a servicio** | El límite ya existe en paquete (24 §2.4), esquema (ETS-010/02) y contratos (M1-M4): la extracción es mover el paquete, darle su despliegue y volver locales-remotas las aristas ya explícitas — sin re-cortar |
| **Reemplazo de tecnología** | Detrás del puerto: adaptador nuevo pasa la misma suite de contrato (25), conmutación gobernada, adaptador viejo se retira — el Core no se entera |

## 2. Reglas de evolución

1. **Aditivo antes que modificativo**: la pregunta ante todo cambio es "¿puedo agregarlo sin tocar lo que funciona?" — módulos, casos de uso, Policies, consumidores y read models nuevos no perturban a los existentes.
2. **Deprecar es un proceso, no un borrado**: operación/evento/puerto que sobra se marca, se mide su uso real (27), se avisa (gobierno N/N-1 ETS-008/17) y se retira cuando la telemetría lo permite — el archivo de deprecaciones vigentes es visible.
3. **Las decisiones de esta serie tienen dueño**: cambios a lo normado en ETS-011 (capas, reglas de dependencia, pipelines, Kernel) pasan por revisión de arquitectura con registro de decisión — el diseño evoluciona, pero nunca por accidente ni por deriva.
4. **La deuda es explícita**: los atajos aceptados bajo presión quedan en el archivo de excepciones (23 §3.2) con fecha; la tendencia de ese archivo es métrica de salud arquitectónica.
5. **El detector último es la prueba en memoria** (01 §3.6): mientras todo el negocio se pruebe sin infraestructura, la arquitectura está viva; el día que no, la erosión ya ocurrió — esa suite es la línea que no se cruza.

---

## Impacto sobre la implementación
Define el proceso de cambio permanente: plantillas, deprecación con telemetría, revisión de arquitectura y archivo de excepciones son herramientas de serie desde el arranque.

## ETS relacionados
ETS-008 (17 gobierno de API) · ETS-009 (18-19 evolución de persistencia) · ETS-010 (21 evolución física) · ETS-011 (todos: es su cláusula de vida).

## Riesgos
- Gobierno percibido como burocracia y esquivado → los caminos del §1 están diseñados para ser el camino fácil (plantillas, herencia de pipelines); el atajo debe costar más que la regla.
- Evolución del Kernel pospuesta hasta volverse big-bang → cambios pequeños y frecuentes con convivencia, jamás acumulación.

## Decisiones habilitadas
Plantillas de módulo, proceso de deprecación, registro de decisiones de arquitectura, métricas de salud arquitectónica.

## Decisiones bloqueadas
Todo lo de implementación: lenguaje, frameworks, y el orden de construcción de módulos — corresponde a las instrucciones siguientes.

---

**Fin de la serie ETS-011.** El Núcleo de Aplicación queda diseñado: Kernel de contratos universales, cuatro capas con Regla de Dependencia verificable, un caso de uso por operación del catálogo, motores puros, Policies configurables, puertos y adaptadores hexagonales, Unit of Work atómico con outbox, fronteras transaccionales sin transacciones distribuidas, despachador con garantías, doce pipelines transversales, grafo de dependencias cerrado, estructura de paquetes espejo de los módulos, y estrategias de testing, errores, observabilidad y evolución — coherente con ETS-001…010 y listo para gobernar la implementación.
