# 14_CLOUD_ARCHITECTURE.md

> **DeltaOps — ETS-007 · v1.0** · Estrategia cloud: contenedores, balanceo, storage, CDN, backups y entornos.
> Documento de diseño. No implementa nada.

---

## 1. Principios cloud

1. **Contenedores como unidad de empaque y ejecución:** una imagen inmutable por versión de la plataforma; la misma imagen recorre todos los entornos (lo que se probó es lo que se despliega — `15`).
2. **Servicios gestionados para lo que no es el producto:** base de datos, almacén de objetos, CDN, mensajería futura, correo — DeltaOps invierte su ingeniería en el dominio, no en operar infraestructura genérica.
3. **Infraestructura declarada como código versionado:** los entornos se crean y modifican por definición declarativa auditada, nunca por manos en consolas (misma filosofía que ETS-005: configurar, no improvisar).
4. **Portabilidad razonable:** contenedores + servicios gestionados con equivalentes estándar (objetos, colas, SQL) — sin acoplarse a servicios exóticos de un solo proveedor; cambiar de nube sería un proyecto, no una reescritura.

## 2. Topología

```text
                    ┌── CDN ──┐   estáticos inmutables por huella (SPA),
Usuarios ─► DNS ─►  │          │  miniaturas públicas-firmadas de corta vida
                    └────┬─────┘
                         ▼
              BALANCEADOR (TLS, salud por disposición — `10`)
                         ▼
        ┌── Instancias de aplicación (contenedores sin estado, N réplicas,
        │   escalado automático — `13`) ── trabajadores de colas (réplicas
        │   propias por perfil: sync móvil, IoT, proyecciones, reportes)
        ▼
┌───────────────┬──────────────────┬──────────────────┬──────────────┐
│ Base de datos │ Almacén de       │ Almacén de       │ Bóveda de    │
│ gestionada    │ objetos (Files,  │ sesión y caches  │ secretos     │
│ (primario +   │ por tenant,      │ compartidos      │ (`12`)       │
│ réplicas)     │ caliente/frío)   │ (`11`)           │              │
└───────────────┴──────────────────┴──────────────────┴──────────────┘
```

## 3. Contenedores

- **Una imagen, muchas configuraciones:** la imagen no contiene entorno (ni secretos ni endpoints); todo llega por configuración de despliegue y bóveda (`12` §5).
- **Procesos por perfil:** la misma imagen ejecuta como servidor web o como trabajador de colas según su rol declarado — un solo artefacto, varios perfiles de escalado (`13`).
- **Arranque rápido y apagado limpio:** las instancias entran tras pasar disposición y salen drenando (terminan lo aceptado, no toman nuevo) — requisito de despliegues sin corte (`15`).
- Imágenes mínimas, escaneadas (vulnerabilidades) y firmadas; solo imágenes firmadas se despliegan.

## 4. Balanceador

- Terminación TLS, verificación de salud por disposición, retiro automático de instancias enfermas.
- Afinidad de sesión **no requerida** (instancias sin estado) — el balanceo es libre, lo que simplifica despliegues y escalado.
- Protección de borde: límites por IP, filtrado geográfico/reputacional configurable por plataforma, absorción de picos antes de la aplicación.

## 5. Storage

| Clase | Servicio | Nota |
|---|---|---|
| Patrimonio relacional (maestros, hechos, eventos, configuración) | Base de datos gestionada con réplicas y restauración a punto en el tiempo | El corazón; dimensionada con crecimiento por tiempo/tenant (`13` §4) |
| Archivos y evidencias | Almacén de objetos por tenant, clases caliente/frío, cifrado | `07_FILE_ARCHITECTURE.md` |
| Sesión y caches | Almacén en memoria gestionado compartido | Volátil por diseño (`11`) |
| Índice de búsqueda | Servicio de búsqueda o índice dedicado | Derivado, reconstruible por replay |
| Colas | Internas hoy (outbox+BD); mensajería gestionada al extraer módulos | `13` §6 |

## 6. CDN

- Sirve los estáticos inmutables de la SPA (huella de contenido = cachear para siempre) y, mediante URLs firmadas de corta vida, miniaturas y descargas de archivos (`07` — el acceso sigue mediado por permisos).
- Cercanía geográfica para el campo: la primera carga de la PWA y los paquetes móviles se benefician; la operación offline hace el resto (U-26).

## 7. Backups (encaje cloud de ETS-006/15)

- Restauración a punto en el tiempo de la base gestionada + snapshots programados; almacén de objetos con versionado y **copia inmutable** en región/cuenta separada (la copia que un error administrativo o un ransomware no alcanzan).
- Simulacros de restauración calendarizados contra entorno de ensayo, con evidencia (ETS-006/15 §4).

## 8. Entornos

| Entorno | Propósito | Datos |
|---|---|---|
| **DEV** | Desarrollo continuo | Sintéticos; tenants de prueba |
| **QA** | Verificación automatizada y funcional | Sintéticos reproducibles (semillas), jamás datos reales |
| **UAT** | Validación de negocio con usuarios | Anonimizados o sintéticos realistas; branding y configuración reales de ensayo |
| **PROD** | Operación | Reales; el único con patrimonio |

- **Paridad estructural:** misma imagen, misma topología a escala reducida; lo distinto es tamaño, datos y secretos (por entorno, `12` §5).
- **Aislamiento duro entre entornos:** redes, credenciales, bóvedas y dominios separados; una integración de UAT no puede apuntar a un ERP productivo por construcción (`08` §6).
- El **sandbox de configuración del tenant** (ETS-005) vive DENTRO de producción como espacio lógico — no confundir con estos entornos de plataforma.
