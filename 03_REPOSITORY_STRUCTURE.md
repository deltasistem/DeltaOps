# 03_REPOSITORY_STRUCTURE.md

> **DeltaOps — ESI-002 · v1.0** · Organización física del repositorio y convenciones de carpetas.
> Diseño normativo: la estructura se CREARÁ bajo DGP; aquí solo se define. Sin código.

---

## 1. Estructura de primer nivel (normativa)

```
deltaops/
├── apps/
│   ├── backend/          # aplicación Python (web + workers, ESI-001/02)
│   └── frontend/         # SPA/PWA React (ESI-001/03)
├── packages/
│   └── contracts/        # tipos de frontera GENERADOS del OpenAPI (solo lectura)
├── platform/
│   ├── templates/        # plantillas de piezas (18)
│   ├── generators/       # generadores oficiales (19)
│   └── rules/            # reglas verificables: imports, lint propio, Semgrep DeltaOps
├── infra/                # Compose, manifiestos de despliegue (cuando el DGP los cree)
├── docs/
│   ├── adr/              # ADRs (continúan la serie de ESI-001/11)
│   └── guides/           # guías de ingeniería (06, 28)
└── (manifiestos raíz del workspace y del tooling)
```

## 2. Estructura interna del backend (espejo de ETS-012/23)

```
apps/backend/
├── kernel/               # contratos del Kernel (ETS-011/02) — sin dependencias
├── plataforma/           # pipelines, UoW, outbox, framework de consumidores
├── modulos/
│   └── <modulo>/         # uno por módulo del catálogo ETS-002
│       ├── dominio/      # agregados, VOs, eventos, Policies, puertos
│       ├── aplicacion/   # casos de uso, consultas, consumidores
│       └── adaptadores/  # persistencia, HTTP, integraciones
├── arranque/             # composición: web | despachador | consumidores | jobs
└── pruebas/              # espejo de la estructura + suites transversales
```

## 3. Estructura interna del frontend

```
apps/frontend/
├── nucleo/               # cliente API generado, i18n, sesión, cola offline
├── diseno/               # sistema de diseño (shadcn poseído, tokens)
├── funcionalidades/
│   └── <funcionalidad>/  # pantallas por sistema de pantallas ETS-004
└── pruebas/
```

## 4. Convenciones de carpetas (normativas)

1. **Nombres de carpetas de negocio en español**, en minúsculas, sin acentos ni espacios (`ordenes_trabajo`, no `work-orders`): el lenguaje ubicuo es español (ETS-003) hasta en el filesystem.
2. **La estructura de un módulo es idéntica en todos los módulos**: quien conoce uno, conoce todos (plantillas monótonas, ETS-012).
3. **Las pruebas espejan la estructura de lo probado**: encontrar la prueba de una pieza es cambiar un prefijo de ruta.
4. **Profundidad máxima orientativa: 5 niveles** desde la raíz de la app; más profundidad indica una pieza mal cortada.
5. **`packages/contracts` es de solo lectura humana**: lo escribe el generador; el diff manual falla CI (ESI-001/03 §regla 1).
6. **Nada vive en la raíz salvo manifiestos del workspace**: todo archivo nuevo tiene zona; la raíz no es un cajón.
7. Un archivo = una pieza nombrada por su tipo (`crear_orden_trabajo` el caso de uso, su prueba con el mismo nombre): la búsqueda por nombre de pieza encuentra todo lo relevante.

## 5. Qué NO existe

- Carpetas `utils/`, `helpers/`, `misc/` — la utilidad sin hogar es diseño pendiente.
- Carpetas por tipo técnico global (`controllers/`, `models/` a nivel app) — la organización es por módulo/funcionalidad, el tipo técnico vive dentro (ETS-011/23).
- Código fuera de `apps/`, `packages/`, `platform/`.

---

## Impacto sobre la implementación
El DGP de esqueleto creará esta estructura literal; los generadores (19) colocan cada pieza nueva en su ruta sin preguntar — la ruta se deriva del tipo de pieza y el módulo.

## Dependencias
02 (zonas del monorepo) · ETS-012/23 (estructura de capas del backend) · ETS-004 (sistemas de pantallas → funcionalidades) · 19 (generadores que la pueblan).

## Riesgos
- Estructura erosionada por archivos "temporales" → regla 6 + verificación de rutas permitidas en la puerta.
- El frontend derivando a organización técnica → revisión con la regla de funcionalidades + reglas de imports.

## Decisiones habilitadas
Esqueleto físico, reglas de imports por ruta, generadores con rutas deterministas, espejo de pruebas.

## Decisiones bloqueadas
Nombres definitivos de los módulos-carpeta (derivan del catálogo ETS-002 al crear cada módulo) y cualquier creación física — DGP.
