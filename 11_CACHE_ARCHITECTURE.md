# 11_CACHE_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Arquitectura de caché: cliente, servidor, configuración, read models, catálogos y sesión.
> Extiende ETS-006/16 §4 con la mecánica técnica por capa.
> Documento de diseño. No implementa nada.

---

## 1. Reglas universales

1. **Solo se cachea lo que declara su frescura o se invalida por evento** (ETS-006/16): prohibido el cache que presenta datos viejos como actuales.
2. **Claves siempre por tenant** (+ contexto y versión cuando aplique): un cache jamás cruza tenants (`05`).
3. **Cache = derivado:** perderlo entero es una degradación de latencia, nunca de correctitud — todo se reconstruye de la fuente.
4. **Datos de seguridad nunca por tiempo ciego:** permisos y membresías se invalidan por evento, jamás "expiran en N minutos y mientras tanto vale lo viejo".

## 2. Capas y contenidos

### Cliente web (SPA)
| Qué | Estrategia |
|---|---|
| Recursos estáticos de la aplicación | Inmutables por huella de contenido, servidos por CDN (`14`); una versión nueva cambia la huella |
| Configuración resuelta, catálogos, branding | Cacheados con su **versión**; el cliente pregunta "¿sigue vigente mi versión?" en un intercambio barato al enfocar la aplicación |
| Consultas de lectura (bandejas, fichas) | Cache de sesión de corta vida con revalidación; nunca sobrevive al cambio de contexto (`05`) |
| Datos de seguridad | No se cachean en cliente más allá del token vigente |

### Cliente móvil
El almacén local offline **no es cache**: es un read model con cursor (paquete de alcance, `06_OFFLINE_TECHNICAL.md`) — se administra por delta-sync, no por expiración.

### Servidor
| Qué | Clave | Invalidación |
|---|---|---|
| **Configuración resuelta** (la cascada materializada) | tenant+contexto+tipo+versión | Evento `ConfiguracionPublicada` (invalidación selectiva por ámbito afectado) |
| **Catálogos** | tenant+catálogo+versión | Evento de publicación del catálogo |
| **Permisos evaluados** | sesión+contexto | Eventos de Identity (membresía/rol/delegación) y cambio de contexto |
| **Read models calientes** (widgets, bandejas) | tenant+consulta+ámbito | Por el propio flujo de eventos (el proyector actualiza; el cache sirve la última proyección con su frescura declarada) |
| **Resolución de folios/identidades frecuentes** | tenant+clave de negocio | Evento de la entidad |

### Sesión
- El estado de sesión es mínimo (el token porta lo esencial — `12`); lo demás (preferencias, contexto activo) vive en almacén de sesión compartido entre instancias: **ninguna instancia guarda sesión en memoria propia** (requisito de escalado horizontal, `13`).

## 3. Invalidación (el problema difícil, resuelto por diseño)

1. **Por evento, selectiva:** los eventos de publicación/cambio llevan el ámbito afectado; se invalida la rama tocada de la cascada, no todo el tenant.
2. **Por versión, estructural:** configuración, catálogos y recursos estáticos se identifican por versión/huella — "invalidar" es simplemente pedir la versión nueva; las viejas expiran solas.
3. **Tolerancia a la carrera:** entre el evento y la invalidación hay una ventana mínima; los comandos **nunca** validan contra cache de seguridad sin verificación de vigencia (la escritura siempre consulta la fuente de permisos), y las lecturas declaran frescura.
4. **Estampida controlada:** al invalidar algo caliente (configuración del tenant grande), la reconstrucción se hace una vez y los demás esperan el resultado (bloqueo de relleno único), no mil reconstrucciones simultáneas.

## 4. Qué NO se cachea

- Resultados de comandos (idempotencia ≠ cache: la clave de idempotencia detecta duplicados en la fuente).
- Datos Restringido/Crítico fuera de los read models gobernados (nada de copias sensibles flotando en caches genéricos).
- La auditoría (se consulta por sus read models propios con su control de acceso).
- Nada entre tenants: no existe "cache global de catálogos de industria" en caliente compartido — cada tenant su copia (la deduplicación es problema del almacenamiento, no del cache).
