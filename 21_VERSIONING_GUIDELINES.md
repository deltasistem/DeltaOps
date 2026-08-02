# 21_VERSIONING_GUIDELINES.md

> **DeltaOps — ESI-002 · v1.0** · Guía de versionado: qué significa cada número y quién lo mueve.
> Desarrolla ESI-001/10 (SemVer + Conventional Commits). Sin código.

---

## 1. La versión de producto (única, 02 §4)

`vMAYOR.MENOR.PARCHE` sobre todo el monorepo:

| Componente | Se incrementa cuando | Autoridad |
|---|---|---|
| **MAYOR** | ruptura de contrato externo: API pública (ETS-008), formato de eventos consumibles por integraciones, requisitos de despliegue incompatibles | decisión explícita con expediente N/N-1 (ETS-008/17); jamás automática sin revisión |
| **MENOR** | capacidad nueva compatible: comandos/consultas nuevos, pantallas nuevas, módulos nuevos | derivada de commits `feat` desde el último tag |
| **PARCHE** | correcciones y mejoras sin capacidad nueva | derivada de `fix`/`perf`/otros |

La derivación es automática desde los commits convencionales (04 §4); el humano confirma el incremento propuesto al preparar el release (22).

## 2. Qué se versiona aparte (y qué no)

| Cosa | Versionado |
|---|---|
| **API pública** | política N/N-1 de ETS-008: la compatibilidad es del contrato, no del número de producto; la versión de producto SEÑALA la ruptura, el contrato la GOBIERNA |
| **Eventos** | versionado de esquema de eventos según ETS-011 (sobres versionados); independiente del número de producto |
| **Esquema de BD** | por migraciones ordenadas (Alembic), lineal; el número de producto no lo describe |
| **Paquetes internos** | NO se versionan (02 §4) |
| **Documentos de ingeniería** | v y fecha en el encabezado; los congelados solo cambian por supersesión (ESI-001/11 §0) |
| **Configuración de tenants** | versionado propio de la plataforma de configuración (ETS-005) — fuera de este esquema |

## 3. Reglas

1. **El tag es la única declaración de versión**: no hay archivos de versión editados a mano; la versión visible en la aplicación y en las señales (ESI-001/09) se inyecta en el build desde el tag.
2. **Compatibilidad N/N-1 obligatoria** entre releases consecutivos desplegados (ETS-008/17): el consumidor del release N-1 funciona contra el N; esto habilita despliegues sin ventana muerta y rollback sin drama.
3. **Pre-releases**: los candidatos a UAT (09) se marcan como pre-release del tag objetivo; el pre-release jamás llega a PROD.
4. **La versión no comunica marketing**: los nombres comerciales de versiones (si existieran) viven en producto, no en el tag.

---

## Impacto sobre la implementación
La automatización de releases (22) deriva el incremento de los commits; el expediente N/N-1 y la revisión humana custodian el MAYOR; la versión fluye del tag al build y a las señales sin ediciones manuales.

## Dependencias
04 (commits convencionales) · 22 (proceso de release) · ETS-008/17 (gobierno de compatibilidad) · ETS-011 (versionado de eventos) · ESI-001/10.

## Riesgos
- Rupturas disfrazadas de MENOR → la verificación de contrato (Schemathesis + diff de OpenAPI en la puerta) detecta cambios incompatibles mecánicamente; el marcador de ruptura sin expediente falla revisión.
- Inflación de MAYOR por miedo o descuido → el MAYOR exige expediente; sin expediente no hay MAYOR.

## Decisiones habilitadas
Automatización de notas de release, política de soporte de versiones para integraciones, ventanas de deprecación.

## Decisiones bloqueadas
Política de deprecación detallada de API por versión — se gobierna con ETS-008/17 al publicar el primer contrato externo.
