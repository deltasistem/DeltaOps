# 24_PACKAGE_STRUCTURE.md

> **DeltaOps — ETS-011 · v1.0** · Estructura de paquetes: la forma física del Core que hace las reglas de dependencia (23) inevitables.
> Conceptual e independiente del lenguaje. Documento de diseño. Sin código.

---

## 1. La estructura normativa

```text
deltaops/
├── kernel/                    los contratos universales (02) — sin dependencias
├── plataforma/                lo compartido por todos los módulos, sin negocio
│   ├── pipeline_comandos/     11 · pipeline_consultas/ 12
│   ├── unidad_de_trabajo/     08 (patrón; la implementación por módulo lo usa)
│   ├── despachador/           10 (despacho + framework de consumidor)
│   ├── resolucion_config/     15 · autorizacion/ 14 · validacion/ 13
│   └── telemetria/            27
├── modulos/
│   └── <modulo>/              uno por módulo ETS-007 (activos, ordenes_trabajo,
│       │                      inventario, combustible_energia, compras, …)
│       ├── contratos/         SOLO lo publicado: sobres de eventos, referencias
│       │                      (la única parte importable por otros módulos, M3)
│       ├── dominio/           agregados, eventos, motores (04), policies (05)
│       ├── aplicacion/        casos de uso (03), puertos (06), lectores
│       └── adaptadores/
│           ├── entrada/       rutas API del módulo, consumidores, jobs
│           └── salida/        persistencia (esquema propio ETS-010), otros
└── arranque/                  composición: cablea adaptadores a puertos,
                               registra módulos, configura pipelines — el único
                               lugar que conoce TODO (composition root)
```

## 2. Reglas normativas

1. **La estructura es idéntica en todos los módulos**: quien conoce un módulo conoce todos; las plantillas de módulo nuevo generan esta forma (28).
2. **`contratos/` es la única superficie pública** de un módulo (M3): el build impide importar `dominio/`, `aplicacion/` o `adaptadores/` ajenos (23 §3.1).
3. **`arranque/` es el único lugar con visión total**: la inyección de dependencias vive ahí; ningún módulo se auto-cablea ni conoce el registro global.
4. **Un despliegue, muchos módulos** (monolito modular, ETS-007): esta estructura permite después extraer `modulos/<x>/` + `plataforma/` a proceso propio sin re-cortar nada (ETS-010/21 §1.6) — el paquete ya es el límite.
5. **Las pruebas espejan la estructura** (25): pruebas de dominio junto al dominio, de contrato de puerto junto al puerto, de módulo dentro del módulo.
6. **Nada fuera del árbol**: sin paquetes "utils", "common", "helpers" huérfanos — lo universal es del Kernel (con su gobierno), lo compartido ejecutable es de plataforma, lo demás es de un módulo.

---

## Impacto sobre la implementación
El repositorio de implementación nace con este árbol; las plantillas de módulo y el lint de dependencias lo refuerzan; cualquier desviación es decisión de arquitectura explícita, no accidente.

## ETS relacionados
ETS-007 (02-03 módulos) · ETS-010 (02 esquema por módulo — el espejo físico de este árbol) · ETS-011 (23 reglas que materializa, 28 evolución).

## Riesgos
- El paquete `plataforma/` tienta a meter negocio "compartido" → regla M5: plataforma sin negocio; lo que menciona conceptos de dominio pertenece a un módulo.
- Estructuras divergentes entre módulos por estilos personales → plantilla única y revisión.

## Decisiones habilitadas
Plantilla de módulo, lint de dependencias sobre paquetes reales, plan de extracción futura.

## Decisiones bloqueadas
Correspondencia exacta con el sistema de paquetes del lenguaje elegido — implementación.
