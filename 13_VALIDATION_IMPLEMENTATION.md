# 13_VALIDATION_IMPLEMENTATION.md

> **DeltaOps — ETS-012 · v1.0** · Implementación de Validaciones: tres capas, tres dueños, cero duplicación.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. Las tres capas y dónde se escriben (ETS-011/13)

| Capa | Qué valida | Dónde se implementa | Cómo |
|---|---|---|---|
| **1. Forma** | tipos, formatos, obligatoriedad, rangos sintácticos | NO se escribe: se genera del contrato ETS-008 | acumula todos los errores |
| **2. Invariante** | reglas de negocio que jamás varían por tenant | agregados y motores (dominio) | rechaza con decisión nombrada |
| **3. Configurable** | reglas que el tenant define | Policies + definiciones versionadas (ETS-005) | acumula, veredicto con causa |

## 2. Reglas de implementación

1. **La capa 1 no se escribe a mano, nunca**: el validador de forma se deriva del contrato generado (API First); escribir a mano una validación de formato es duplicar el contrato y garantizar la divergencia. Si el contrato no expresa la restricción, se corrige el contrato.
2. **Cada regla vive en exactamente una capa** (DRY donde importa): "el folio es obligatorio" es capa 1; "una orden cerrada no se reabre" es capa 2; "el cierre exige evidencia" es capa 3. La prueba del dueño: ¿quién la cambia? — el contrato, el negocio, o el tenant.
3. **La capa 2 no es una lista de validaciones: es el dominio decidiendo**: el agregado rechaza la transición inválida como parte de su método, con decisión nombrada (05 §regla 6); no existe un "servicio validador" separado que inspeccione agregados desde afuera.
4. **Acumular en 1 y 3, cortar en 2**: los errores de forma se juntan todos (el usuario corrige de una vez); las configurables también, entre sí; pero un invariante violado corta — no tiene sentido evaluar reglas sobre una operación imposible.
5. **Validar contra versiones congeladas** (ETS-011/13): la capa 3 evalúa con la configuración que el pipeline congeló al inicio del comando; jamás re-resuelve a mitad de la evaluación.
6. **El tercer desenlace se implementa como decisión, no como excepción**: "apartado/en revisión" (móvil, anomalías registrables) es un valor del Resultado con su causa, persiste el hecho apartado y sigue el flujo normal de respuesta (ETS-011/26 §anomalía).
7. **Los mensajes son códigos, los textos son presentación**: toda falla de validación devuelve código del catálogo + parámetros; el texto humano lo compone la capa de presentación en el idioma del usuario — el núcleo jamás formatea prosa.

## 3. Prueba obligatoria

Capa 1: se prueba una vez por generador, no por operación. Capa 2: la tabla de casos del dominio (05 §3). Capa 3: la matriz de configuración por clave (06 §3). Además, por operación: un caso que atraviesa las tres capas exitosamente y uno que falla en cada capa, afirmando código y desenlace exactos.

---

## Impacto sobre la implementación
El constructor casi nunca "escribe validaciones": genera la capa 1, modela la 2 como dominio y declara la 3 como Policies — el trabajo artesanal de validación desaparece por diseño.

## ETS relacionados
ETS-011 (13, 05, 15, 26) · ETS-008 (contratos como fuente de la capa 1, 07 códigos) · ETS-005 (definiciones de la capa 3).

## Riesgos
- Re-validar forma "por seguridad" en capas internas → duplicación prohibida; la confianza entre capas es parte del diseño.
- Invariantes expresados como Policies "para poder relajarlos después" → si el negocio dice que jamás varía, es capa 2; relajar invariantes es cambio de dominio, no de configuración.

## Decisiones habilitadas
Generación de validadores, mensajes localizables, matrices de prueba por capa.

## Decisiones bloqueadas
Librería/técnica de generación de validadores — con el stack; la arquitectura de tres capas la sobrevive.
