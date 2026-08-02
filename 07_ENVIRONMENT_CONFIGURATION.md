# 07_ENVIRONMENT_CONFIGURATION.md

> **DeltaOps — ESI-002 · v1.0** · Variables de entorno: el mundo de despliegue, gobernado.
> Materializa operativamente ETS-012/16 (mundo de despliegue) y ETS-005 (los otros mundos NO van aquí). Sin código.

---

## 1. Qué es (y qué no es) una variable de entorno en DeltaOps

**Va en entorno** únicamente lo que cambia entre despliegues del MISMO software: endpoints de servicios (BD, Redis, object storage, proveedor de identidad, proveedor de IA), credenciales (referenciadas, 08), nivel de log, identidad del entorno (DEV/QA/UAT/PROD), y parámetros operativos de plataforma (tamaños de pool, tiempos de espera).

**NO va en entorno, jamás**:
- Configuración de negocio o de tenant → plataforma de configuración (ETS-005).
- Flags de funcionalidad de producto → mundo de configuración, versionado y auditado.
- Constantes del dominio → código del Kernel/módulo.
- Nada cuyo cambio deba auditarse por tenant.

La prueba ácida: *si un cambio de este valor interesa a un tenant o a un auditor, no es variable de entorno.*

## 2. Reglas de diseño

1. **Catálogo único y tipado**: existe UN catálogo de variables (documento vivo en el repo) con nombre, tipo, obligatoriedad, valor por defecto seguro (si lo hay) y entornos donde aplica. Variable no catalogada = variable inexistente.
2. **Validación al arranque, fallo ruidoso**: la aplicación valida el entorno completo al arrancar y muere con mensaje exacto si falta o malforma algo (ETS-012/16 §regla 2) — jamás arranca "a medias".
3. **Nomenclatura**: prefijo `DELTAOPS_`, mayúsculas, palabras por guion bajo, agrupadas por dominio operativo (`DELTAOPS_BD_...`, `DELTAOPS_REDIS_...`, `DELTAOPS_OBS_...`).
4. **Defaults solo seguros y solo locales**: el entorno local funciona con defaults documentados (bootstrap, 05); QA/UAT/PROD no tienen defaults — todo explícito.
5. **Una sola lectura**: el proceso lee el entorno UNA vez al arranque hacia un objeto de configuración validado; prohibido leer variables sueltas por el código (la dispersión de lecturas es deriva).
6. **Sin variables de comportamiento de negocio disfrazadas**: la revisión rechaza toda variable nueva que falle la prueba ácida del §1.

## 3. Plantilla de entorno local

El repositorio incluye la **plantilla de entorno local documentada** (creada bajo DGP): cada variable con comentario, valores de desarrollo funcionales y NINGÚN secreto real. El bootstrap la instancia (05 §2.3). Su drift respecto del catálogo falla CI: plantilla y catálogo se verifican mutuamente.

## 4. Variables por entorno (09)

| Aspecto | DEV local | QA | UAT | PROD |
|---|---|---|---|---|
| Fuente | plantilla del repo | almacén del pipeline | almacén del pipeline | almacén del pipeline |
| Secretos reales | no (08) | de QA | de UAT | de PROD |
| Defaults | sí, documentados | no | no | no |
| Cambio | libre local | por PR/pipeline | por PR/pipeline | por cambio controlado (22) |

---

## Impacto sobre la implementación
El objeto de configuración validado al arranque y el catálogo de variables nacen con el esqueleto; toda pieza que necesite un valor de despliegue lo recibe por el objeto de configuración, nunca leyendo el entorno directo.

## Dependencias
ETS-012/16 (los tres mundos) · ETS-005 (a dónde va lo que NO es entorno) · 08 (secretos) · 09 (entornos oficiales) · 05 (plantilla en bootstrap).

## Riesgos
- Inflación de variables por comodidad → prueba ácida + catálogo con revisión; el catálogo grande es señal de diseño escapándose del mundo correcto.
- Drift plantilla/catálogo/validación → verificación cruzada en CI (regla del §3).

## Decisiones habilitadas
Catálogo inicial de variables (esqueleto), validación de arranque, promoción entre entornos con el mismo artefacto (ESI-001/10).

## Decisiones bloqueadas
Lista concreta inicial de variables — se deriva al construir el esqueleto; gestión física del almacén por entorno — 08/09.
