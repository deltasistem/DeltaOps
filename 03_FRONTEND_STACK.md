# 03_FRONTEND_STACK.md

> **DeltaOps — ESI-001 · v1.0** · Stack oficial de frontend web.
> Decisiones justificadas; alternativas descartadas con razón objetiva. Sin código, sin configuración.

---

## 1. Decisiones oficiales

| Necesidad | Selección oficial | Justificación principal |
|---|---|---|
| **Biblioteca de UI** | **React 18+** | ecosistema y talento dominantes; modelo de componentes adecuado a los sistemas de pantallas de ETS-004; madurez de una década |
| **Lenguaje** | **TypeScript (modo estricto)** | los contratos de ETS-008 se materializan como tipos generados; la frontera cliente-servidor queda verificada en compilación |
| **Build / dev server** | **Vite** | estándar actual de build React; velocidad de iteración; soporte PWA maduro |
| **Estado de servidor** | **TanStack Query** | el frontend de DeltaOps es esencialmente estado de servidor (CQRS: consultas + comandos); Query modela caché, revalidación, reintentos e invalidación por claves — alineado con frescura declarada (ETS-011/12) |
| **Enrutamiento** | **TanStack Router** | rutas tipadas coherentes con TypeScript estricto; integración natural con Query |
| **Estilos** | **Tailwind CSS** | sistema de diseño por tokens utilitarios; consistencia sin CSS artesanal creciente; estándar de facto con shadcn/ui |
| **Componentes** | **shadcn/ui (sobre Radix)** | accesibilidad seria de serie (U-criterios de ETS-004); componentes poseídos en el repo (no dependencia caja negra), personalizables al sistema de diseño |
| **Formularios** | **React Hook Form** | rendimiento en formularios densos de captura (órdenes, checklists); validación integrable con el esquema del contrato |
| **Validación cliente** | **Zod** | espejo cliente de la capa 1: los esquemas se derivan/generan del contrato OpenAPI — la validación de forma es idéntica en cliente y servidor sin duplicar reglas a mano (ETS-012/13 §regla 1) |
| **Internacionalización** | **i18next + react-i18next** | español primero (ETS-004), arquitectura multi-idioma desde el día uno; los textos de errores componen del código de catálogo + parámetros (ETS-012/13 §regla 7) |
| **PWA / Offline** | **PWA con service worker (Workbox) + IndexedDB para la cola de sincronización** | Offline First es mandato (ETS-002): captura offline con cola de comandos idempotentes (`clave_idempotencia` nativa del Kernel), paquetes de configuración congelados (ETS-012/16 §regla 6) |

## 2. Alternativas descartadas (razón objetiva)

| Alternativa | Razón de descarte |
|---|---|
| **Angular** | framework total con opiniones propias (DI, RxJS) que duplican conceptos del diseño propio; comunidad menor que React en el mercado objetivo |
| **Vue/Svelte** | técnicamente capaces; comunidad y talento menores; ninguna ventaja que compense romper el estándar de facto del ecosistema elegido (shadcn/TanStack son React-first) |
| **Next.js / SSR** | DeltaOps es una aplicación autenticada multi-tenant, no un sitio público indexable: SSR agrega un runtime de servidor de UI sin beneficio (el SEO es irrelevante tras login); la SPA+PWA sirve mejor al offline |
| **Redux (+RTK) como estado global** | el estado es mayormente de servidor (Query lo cubre) y el residual local cabe en React; un store global invita a duplicar la verdad del servidor |
| **App móvil nativa / React Native para el MVP** | la PWA cubre la captura móvil offline del MVP con una sola base de código; una app nativa es decisión futura del roadmap (12) si los requisitos de hardware lo exigen — el contrato API no cambia |
| **CSS-in-JS (styled-components, Emotion)** | costo en runtime y divergencia del ecosistema shadcn/Tailwind elegido |
| **Formik** | rendimiento inferior en formularios grandes; RHF es el estándar actual |
| **i18n artesanal** | pluralización, interpolación y carga diferida ya resueltas por i18next; reinventarlas es deuda segura |

## 3. Reglas de uso (no configuración)

1. **Los tipos de la frontera se generan del OpenAPI** (ETS-008): prohibido escribir a mano interfaces de request/response; la generación corre en CI y el diff manual falla el build (ETS-012/09 §regla 5).
2. Toda llamada al backend pasa por la capa de cliente generada + TanStack Query; prohibido `fetch` suelto en componentes.
3. La cola offline solo encola **comandos del catálogo** con su clave de idempotencia; la sincronización es el flujo normal de comandos — sin rutas especiales (igualdad de canales, ETS-011/11).

---

## Impacto sobre la implementación
Fija el ecosistema completo de la SPA/PWA; la estructura de carpetas frontend y las plantillas de pantalla se definirán en el ESI de patrones con estas piezas.

## Dependencias
01 (criterios) · 02 (OpenAPI generado por el backend) · ETS-004 (sistemas de pantallas y U-criterios) · ETS-011 (offline, frescura, errores).

## Riesgos
- Estado de servidor duplicado en estado local → regla 2 y revisión; Query es la única caché de servidor.
- La PWA offline crece en complejidad → el alcance offline del MVP se limita a los flujos de captura definidos en ETS-004; ampliar es roadmap.

## Decisiones habilitadas
Generación de cliente tipado, sistema de diseño sobre shadcn/Tailwind, plantillas de pantalla, estrategia offline del MVP.

## Decisiones bloqueadas
Diseño visual (tokens, tema) y organización interna del frontend — ESI de patrones y diseño.
