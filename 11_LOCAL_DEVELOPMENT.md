# 11_LOCAL_DEVELOPMENT.md

> **DeltaOps — ESI-002 · v1.0** · Servicios del entorno local: el sistema completo en una máquina.
> Sin código, sin YAML.

---

## 1. Principio: local = sistema completo

El entorno local levanta **todo el sistema** con un comando (16): no existe el "modo parcial sin workers" como camino normal. Razón: el outbox, los consumidores y la observabilidad son el corazón del diseño (ETS-011); desarrollar sin ellos produce piezas que fallan en integración. "En mi máquina funciona" debe significar "funciona el sistema, no un recorte".

## 2. Servicios oficiales del Compose local

| Servicio | Rol local | Notas |
|---|---|---|
| **PostgreSQL** | base única de verdad | versión fijada = PROD; RLS activo desde el día uno — desarrollar sin murallas esconde defectos de tenancy |
| **Redis** | caché y ritmo | efímero, sin persistencia local |
| **Object storage (S3-compatible libre)** | flujo de archivos completo con URLs firmadas | paridad del flujo ETS-011/18 |
| **Colector OpenTelemetry + Grafana/Prometheus/Loki/Tempo** | observabilidad local | el diagnóstico por traza se usa desde el primer día (ESI-001/09 §regla 5) |
| **Proxy (Caddy)** | opcional local; obligatorio en QA+ | localmente los dev servers sirven directo; la topología con proxy se prueba en QA |
| **Aplicación backend** | proceso nativo (uv) con recarga: web + workers como procesos separados | roles idénticos a PROD (10 §1) |
| **Aplicación frontend** | dev server de Vite con recarga | consume el backend local real |

## 3. Flujo de trabajo diario (los comandos oficiales, 16)

1. `arriba` — levanta servicios (Compose) y aplicaciones; imprime URLs y estado.
2. `estado` — salud de servicios, migraciones pendientes, frescura del seed.
3. `pruebas <nivel>` — unit | contrato | integración | e2e local.
4. `generar <tipo-de-pieza>` — generadores (19).
5. `contratos` — regenera OpenAPI y tipos de frontera.
6. `datos <resembrar|escenario>` — gestión de datos locales (12).
7. `abajo` — detiene todo; `abajo --limpio` destruye volúmenes.

(Los nombres definitivos se fijan en el esqueleto; la regla es que existan, sean memorizables y estén en español.)

## 4. Reglas del entorno local

1. **Recarga rápida es requisito de plataforma**: cambio de código → efecto visible en segundos; la regresión del ciclo de recarga se trata como defecto (igual que la suite lenta, ETS-012/25 §regla 2).
2. **Multi-tenant también en local**: el seed (12) crea SIEMPRE al menos dos tenants; desarrollar con uno solo esconde fugas de tenancy que RLS local sí revelaría.
3. **La observabilidad local es la herramienta de depuración por defecto**: antes de llenar el código de impresiones, se mira la traza — el hábito de PROD se entrena en DEV.
4. **El entorno local es desechable**: destruir+bootstrap (05) < 15 minutos; ningún flujo depende de estado local irreproducible.
5. **Puertos y recursos documentados**: mapa de puertos único documentado en la guía (28) para que múltiples herramientas convivan sin caza de conflictos.

---

## Impacto sobre la implementación
El Compose local, los procesos de aplicación y los comandos oficiales son entregables del DGP de esqueleto; el bootstrap (05) deja este entorno corriendo y verificado.

## Dependencias
10 (estrategia Docker) · 05 (bootstrap) · 12 (seed multi-tenant) · 16 (comandos) · ESI-001/09 (stack de observabilidad) · ETS-010 (RLS activo).

## Riesgos
- Entorno completo pesado para máquinas modestas → límites de recursos (10 §regla 4) y medición del costo real; si aún así no cabe, se define UN perfil reducido oficial (jamás recortes individuales).
- Desarrolladores evitando la observabilidad local → el onboarding la enseña primero (06 §día 1) y las guías de depuración parten de ella.

## Decisiones habilitadas
Bootstrap verificable, depuración por trazas desde DEV, pruebas de tenancy locales, comandos oficiales.

## Decisiones bloqueadas
Nombres y sintaxis definitivos de comandos, mapa de puertos — esqueleto (DGP).
