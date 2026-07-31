# 03_APPLICATION_SERVICES.md

> **DeltaOps — ETS-011 · v1.0** · Casos de Uso (Application Services): la unidad de trabajo del Core.
> Documento de diseño. Sin código, sin clases.

---

## 1. Definición

Un Caso de Uso es **la orquestación de una operación del catálogo** (ETS-008/03 comandos, /04 consultas): recibe un sobre del Kernel con contexto de ejecución, coordina dominio y puertos, y termina en exactamente un Resultado. **Uno por operación del catálogo** — el catálogo de la API y el catálogo de casos de uso son la misma lista con dos proyecciones (API First hacia afuera, Core hacia adentro).

## 2. Anatomía de un caso de uso de comando

```text
recibe   SobreDeComando + ContextoDeEjecución (ya autenticado/atribuido)
usa      pipeline de comando (11): idempotencia → autorización (14)
         → validación (13) → configuración resuelta (15)
carga    el/los agregados por sus repositorios (puertos, 06)
invoca   el dominio: método del agregado o Domain Service (04) —
         AQUÍ y solo aquí viven las decisiones de negocio
confirma Unit of Work (08): estado + eventos + outbox + resultado
responde Resultado del Kernel (confirmado / rechazado / en revisión)
```

## 3. Reglas normativas

1. **Orquesta, no decide**: el caso de uso no contiene reglas de negocio; si un `si… entonces…` de negocio aparece en él, pertenece al agregado, a un Domain Service o a una Policy (05). Su lógica admisible: secuencia, carga de datos, manejo del Resultado.
2. **Sin lógica de presentación**: no formatea, no traduce, no pagina "bonito" — devuelve el Resultado y el adaptador de entrada lo proyecta al contrato (ETS-008).
3. **Un comando = una transacción = un agregado principal** (09): coordinar varios agregados es señal de que falta un Domain Service (mismo módulo) o un proceso por eventos (entre módulos).
4. **Consultas sin dominio**: el caso de uso de consulta va del sobre a un puerto de lectura (read model, ETS-010/10) sin pasar por agregados — CQRS real (12).
5. **Idempotencia y canal son invisibles**: el caso de uso no sabe si vino de web, móvil o integración; el pipeline ya lo resolvió (Offline First §3.4 de 01).
6. **Todo caso de uso declara** (metadatos, no código): operación del catálogo que sirve, permiso requerido (ETS-004/10), configuración que consume, agregado principal, eventos que puede emitir, errores de catálogo posibles — la base de la trazabilidad contrato↔core y del checklist ETS-008/18.

## 4. Catálogo

El inventario completo es el catálogo ETS-008/03-04 proyectado módulo por módulo; no se duplica aquí. Ejemplos del patrón de nombres (español, verbo en infinitivo + agregado): `CrearOrdenDeTrabajo`, `RegistrarTanqueo`, `DespacharRepuesto`, `ConsultarHojaDeVidaActivo`, `SincronizarBitacoraMovil`.

## 5. Casos de uso internos (no expuestos en API)

Los procesos de plataforma (proyectar, despachar outbox, reconciliar, sellar periodos, temperaturas) siguen la misma forma — sobre + contexto (actor = sistema) + resultado — para que auditoría y observabilidad sean uniformes. Se catalogan aparte como operaciones de plataforma.

---

## Impacto sobre la implementación
La implementación crea exactamente un caso de uso por operación del catálogo, con sus metadatos declarados; los generadores de documentación y el checklist de API se alimentan de esos metadatos.

## ETS relacionados
ETS-008 (03-04 catálogos, 18 checklist) · ETS-004 (10 permisos) · ETS-011 (04-15: las piezas que orquesta).

## Riesgos
- Casos de uso "gordos" que absorben reglas de negocio → regla §3.1 + revisión; señal: pruebas del caso de uso que prueban negocio en vez de secuencia.
- Divergencia catálogo API ↔ casos de uso → metadatos declarados y verificación automática de correspondencia.

## Decisiones habilitadas
Trazabilidad contrato↔core, generación de documentación, plantilla única de caso de uso para todos los módulos.

## Decisiones bloqueadas
Firma y forma concreta de los casos de uso (implementación) y el mecanismo de registro/descubrimiento.
