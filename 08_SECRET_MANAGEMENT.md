# 08_SECRET_MANAGEMENT.md

> **DeltaOps — ESI-002 · v1.0** · Gestión de secretos: nunca en el código, nunca en la imagen, nunca en los logs.
> Sin código.

---

## 1. Principios innegociables

1. **Un secreto jamás toca el repositorio**: ni en código, ni en plantillas, ni en historia. Gitleaks vigila commit e historia (ESI-001/08); el secreto filtrado se considera comprometido y **se rota de inmediato, siempre** — limpiar la historia no des-compromete nada.
2. **Un secreto jamás vive en la imagen** (ESI-001/05 §regla 2): las imágenes OCI son públicas por hipótesis de trabajo.
3. **Un secreto jamás aparece en señales**: ni logs, ni trazas, ni métricas, ni mensajes de error (ETS-011/27 §regla 3); la redacción defensiva del colector es la segunda capa.
4. **Inyección solo por entorno al arranque** (07): la aplicación recibe secretos como recibe cualquier variable — validados, una vez, al arrancar.
5. **Mínimo privilegio y por entorno**: cada entorno (09) tiene sus propios secretos; los de PROD no existen en QA; ningún desarrollador necesita secretos de PROD para trabajar.
6. **El entorno local no usa secretos reales**: los servicios locales (11) usan credenciales de desarrollo generadas localmente y sin valor fuera de la máquina.

## 2. Almacenamiento y distribución

| Ámbito | Dónde viven | Quién accede |
|---|---|---|
| Local (DEV) | credenciales de desarrollo de la plantilla/bootstrap — no son secretos reales | el desarrollador |
| CI/CD | almacén de secretos de la plataforma CI (ESI-001/10 §regla 3), segregado por entorno de destino | el pipeline, por entorno |
| QA/UAT/PROD | almacén del pipeline + inyección al despliegue como entorno | los procesos desplegados |
| Secretos de operación (acceso a BD prod, consolas) | gestor de secretos del equipo con acceso nominal y registrado | roles operativos designados |

No se adopta un servicio de vault dedicado en el MVP: el almacén de la plataforma CI + inyección por entorno cubre el ciclo con una pieza menos que operar. La señal para promover un vault dedicado (rotación automática, secretos dinámicos, auditoría fina) queda registrada en 28 y exige ADR.

## 3. Ciclo de vida

1. **Alta**: todo secreto nuevo se registra en el catálogo de variables (07) como tipo secreto — su existencia es pública, su valor jamás.
2. **Rotación**: todo secreto es rotable sin re-desplegar código (el valor entra por entorno); la rotación periódica es tarea operativa planificada, y la rotación inmediata es la respuesta estándar a cualquier sospecha.
3. **Baja**: el secreto que deja de usarse se elimina del catálogo y de los almacenes — el secreto huérfano es superficie de ataque gratuita.
4. **Auditoría**: quién cambió qué secreto y cuándo queda registrado por el almacén; el valor jamás.

## 4. Responsabilidades

- Todo miembro del equipo (y todo agente IA, 17) conoce la regla 1 y el procedimiento de incidente: reportar de inmediato, rotar, y solo después limpiar.
- La revisión de PR rechaza cualquier valor sospechoso de ser secreto aunque Gitleaks no lo detecte — la herramienta asiste, no exime.

---

## Impacto sobre la implementación
El esqueleto nace con Gitleaks activo, catálogo de variables con tipos secreto/no-secreto, y credenciales locales generadas; ningún flujo de trabajo requiere jamás copiar un secreto real a un archivo del repo.

## Dependencias
07 (catálogo y validación) · 09 (segregación por entorno) · ESI-001/08 (Gitleaks) · ESI-001/10 (almacén del CI) · 17 (obligaciones de agentes IA).

## Riesgos
- Secretos de desarrollo tratados como reales (reutilizados en QA+) → prohibición explícita en 09; los almacenes por entorno no comparten valores.
- Fatiga de rotación → rotación sin re-despliegue (regla del ciclo 2) mantiene el costo bajo; lo barato se hace.

## Decisiones habilitadas
Alta segura de proveedores externos (identidad, IA, correo) cuando los DGP los conecten; respuesta estándar a incidentes de filtración.

## Decisiones bloqueadas
Vault dedicado y rotación automática — roadmap con ADR; procedimientos operativos nominales de PROD — ESI de operación.
