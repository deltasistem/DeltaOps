# 05_PROJECT_BOOTSTRAP.md

> **DeltaOps — ESI-002 · v1.0** · Bootstrap del proyecto: del clon al sistema corriendo, sin pasos tribales.
> Diseño normativo del proceso; los scripts se crearán bajo DGP. Sin código.

---

## 1. Principio: bootstrap de un solo comando

Cualquier máquina compatible debe llegar de `git clone` al sistema completo corriendo con **una secuencia oficial, corta y documentada**, cuyo corazón es un único comando de bootstrap. El bootstrap manual (pasos copiados de un chat, de memoria o de otro compañero) está prohibido: si el bootstrap requiere conocimiento no escrito, el bootstrap está roto y se arregla como defecto.

## 2. La secuencia oficial (diseño)

| Paso | Qué hace | Herramienta (ESI-001) |
|---|---|---|
| 0. Prerrequisitos | verificar Git, Docker, uv y gestor de paquetes JS presentes en versiones soportadas; el propio bootstrap los verifica y reporta con claridad | verificación del script oficial |
| 1. Clon | clonar el monorepo | Git |
| 2. Dependencias | instalar dependencias backend y frontend desde lockfiles (nunca resolución libre) | uv · gestor JS |
| 3. Configuración local | crear la configuración de entorno local desde la plantilla documentada (07); sin secretos reales — el entorno local no los necesita (08) | plantilla de entorno |
| 4. Servicios | levantar la infraestructura local completa: PostgreSQL, Redis, object storage, observabilidad (11) | Docker Compose |
| 5. Migraciones | aplicar todas las migraciones a la base local | Alembic |
| 6. Siembra | cargar los datos de desarrollo oficiales (12) | comando de seed |
| 7. Verificación | correr la suite rápida (formato, tipos, unit) y un chequeo de humo del sistema levantado | herramientas de 14 |
| 8. Hooks | instalar los hooks de pre-commit oficiales | pre-commit (14) |

**Resultado verificable**: backend respondiendo, frontend servido, un usuario de desarrollo puede iniciar sesión y ver datos sembrados. El paso 7 imprime un veredicto inequívoco: LISTO o la causa exacta.

## 3. Reglas del bootstrap

1. **Idempotente**: correrlo dos veces no rompe nada; correrlo tras semanas actualiza lo necesario (dependencias, migraciones, seed).
2. **Determinista**: mismas versiones para todos, desde lockfiles y versiones fijadas de imágenes; "en mi máquina es distinto" es un bug del bootstrap.
3. **Sin privilegios especiales**: no requiere permisos de administrador más allá de Docker, ni acceso a entornos remotos, ni secretos de producción.
4. **Rápido**: objetivo < 15 minutos en una máquina normal con red normal; el tiempo de bootstrap se mide y su regresión se trata.
5. **El bootstrap es código del repo**: vive en la zona de plataforma, se revisa por PR y se prueba en CI (un job periódico ejecuta el bootstrap desde cero — la prueba de que sigue vivo).
6. **Mismo bootstrap para humanos e IA**: el agente de IA que trabaje en el repo se orienta con la misma secuencia y la misma guía (17).

## 4. Salida del bootstrap: el entorno de trabajo estándar

Tras el bootstrap, el desarrollador dispone de los comandos oficiales (16): levantar/bajar servicios, correr pruebas por nivel, generar piezas desde plantillas, regenerar contratos, sembrar/resembrar datos, y consultar la observabilidad local. No existe actividad cotidiana sin comando oficial.

---

## Impacto sobre la implementación
El DGP de esqueleto entregará el bootstrap funcionando como criterio de aceptación: el esqueleto no está terminado hasta que un clon limpio llegue a LISTO con la secuencia oficial.

## Dependencias
07/08 (configuración y secretos locales) · 11 (servicios locales) · 12 (seed) · 14 (suite rápida y hooks) · 16 (comandos oficiales) · ESI-001 (todas las herramientas citadas).

## Riesgos
- Bootstrap que se pudre en silencio → regla 5: ejecución periódica en CI desde clon limpio.
- Deriva entre máquinas por versiones flotantes → regla 2: lockfiles e imágenes fijadas, sin excepciones.

## Decisiones habilitadas
Onboarding en horas (06), entorno local reproducible (11), incorporación de agentes IA con el mismo punto de partida (17).

## Decisiones bloqueadas
Escritura de los scripts reales y sus manifiestos — DGP; la lista exacta de prerrequisitos con versiones — se fija en el esqueleto con ADR ligero.
