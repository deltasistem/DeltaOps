# 08_PORT_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Ports: contratos de necesidad, en vocabulario de quien necesita.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. La forma del puerto

Un puerto (ETS-011/06) es la declaración de una necesidad del núcleo hacia afuera. Se implementa como interfaz mínima:

```
NOMBRE:    la necesidad, no la tecnología (AlmacénDeBinarios, no "S3Client")
FIRMAS:    verbos de negocio/plataforma con tipos del Kernel o del módulo
ERRORES:   los del catálogo, ya traducidos — la interfaz no expone fallas físicas
```

## 2. Reglas de implementación

1. **El dueño del puerto es quien lo consume**: la interfaz se define en la capa que la necesita (dominio o aplicación) y en SU vocabulario; el adaptador se somete a ella — jamás al revés (inversión de dependencia real, no nominal).
2. **Puertos estrechos**: cada puerto declara solo las operaciones que sus consumidores usan hoy (YAGNI). Un puerto con métodos "por completitud" se recorta en revisión. Preferir dos puertos chicos a uno ancho (segregación de interfaces).
3. **Catálogo cerrado**: los 16 géneros de puerto de ETS-011/06 son la lista; un puerto nuevo es decisión de arquitectura registrada, no una comodidad local.
4. **Errores ya del dominio del puerto**: la firma declara qué puede salir mal en términos útiles (no-disponible-reintentable, rechazado-permanente, no-encontrado); los detalles físicos viven en el diagnóstico adjunto, jamás en el tipo del error (ETS-011/26 §traducción).
5. **Sin fugas de tipos**: ningún tipo de librería externa cruza la firma de un puerto — ni conexiones, ni respuestas crudas, ni identificadores propietarios. Lo que cruza es Kernel o vocabulario del módulo.
6. **Todo puerto nace con su fake** (ETS-011/06): fake primero incluso — los casos de uso se prueban contra él desde el día uno; el adaptador real puede llegar después sin bloquear el desarrollo del negocio.
7. **Los puertos son asíncronos por contrato donde la latencia es real** (binarios, IA, conectores, búsqueda): la firma refleja que la operación puede tardar o fallar transitoriamente; el consumidor la trata así desde el diseño, no como sorpresa de producción.
8. **Determinismo instrumental**: reloj, identidad y azar son puertos triviales pero obligatorios (regla de oro 8); ninguna pieza de dominio/aplicación los esquiva "porque es solo una fecha".

## 3. Prueba obligatoria

Toda pareja fake/real comparte una suite de contrato que expresa las promesas del puerto en términos observables (lo planeado se confirma, lo inexistente da no-encontrado, la clave repetida es idempotente…). La suite pertenece al dueño del puerto y crece cuando el contrato crece — nunca por detalles de un adaptador.

---

## Impacto sobre la implementación
Los puertos son el perímetro exacto de lo intercambiable; su disciplina de vocabulario y estrechez es lo que hace reales el testeo en memoria y el reemplazo tecnológico (ETS-011/28).

## ETS relacionados
ETS-011 (06 catálogo, 07 adaptadores, 25, 26) · ETS-012 (07 repositorios como puerto mayor, 09 adaptadores).

## Riesgos
- Puertos-espejo de una API externa (vocabulario ajeno adentro) → regla 1; el puerto habla DeltaOps, el adaptador traduce.
- Proliferación de puertos ad-hoc → regla 3; el catálogo gobierna.

## Decisiones habilitadas
Desarrollo de negocio sin esperar integraciones reales, suites de contrato reutilizables, reemplazo por conmutación.

## Decisiones bloqueadas
Firma sintáctica exacta (convenciones async del lenguaje) — la primera traducción oficial la fija.
