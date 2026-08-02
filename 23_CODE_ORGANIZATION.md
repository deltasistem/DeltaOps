# 23_CODE_ORGANIZATION.md

> **DeltaOps — ETS-012 · v1.0** · Organización física del código: el árbol de ETS-011/24 como norma de trabajo diario.
> Manual de implementación independiente de tecnología. Sin código.

---

## 1. El árbol normativo (invariante ante cualquier stack)

```
kernel/                      contratos universales (02 de ETS-011) — sin dependencias
plataforma/                  pipelines, UoW, despachador, resolutor, frameworks de consumidor
modulos/
  <modulo>/
    contratos/               lo ÚNICO importable desde otros módulos (eventos, identidades)
    dominio/                 agregados, motores, Policies, interfaces de repositorio
    aplicacion/              casos de uso + metadatos, interfaces de puertos propios
    adaptadores/             entrada (API, consumidores) y salida (persistencia, externos)
arranque/                    composición: construye todo, valida el grafo, inicia
```

## 2. Reglas de organización

1. **La estructura es idéntica en cada módulo, sin excepciones por tamaño**: el módulo chico tiene las mismas cuatro carpetas que el grande; la uniformidad vale más que el ahorro de una carpeta "porque solo hay dos archivos".
2. **La pertenencia se decide por dependencia, no por afinidad temática**: ¿importa infraestructura? → adaptadores. ¿Orquesta puertos? → aplicación. ¿Puro negocio? → dominio. ¿Lo necesita otro módulo? → contratos. El archivo que no encaja limpio revela una pieza mal cortada — se corta bien, no se crea la carpeta "común".
3. **Prohibidas las carpetas basurero**: `utils/`, `helpers/`, `common/`, `shared/` no existen. Lo universal de verdad va a `kernel/` o `plataforma/` (con el gobierno que eso implica); lo demás pertenece a un módulo. La carpeta basurero es el acoplamiento del futuro.
4. **Un archivo, una pieza nombrable**: un agregado, un motor, un caso de uso, un adaptador — con el nombre de la pieza (24). Archivos-cajón con "todas las policies del módulo" dificultan revisión y propiedad.
5. **Las pruebas espejan el árbol**: la prueba de una pieza vive en la posición espejo de la pieza; las suites transversales (ETS-011/25) viven en plataforma. Encontrar la prueba de algo jamás requiere buscar.
6. **Las reglas R1-R5 y M1-M5 se verifican en CI** (ETS-011/23): la herramienta de verificación de dependencias es parte del esqueleto inicial del proyecto — no un añadido posterior; el build falla ante la violación, y el archivo de excepciones (con fecha de retiro) es la única válvula.
7. **`arranque/` es el único lugar con permiso total**: solo ahí se importa todo, se leen variables de entorno, se construyen adaptadores reales y se registran los grafos de cada pipeline. Si algo fuera de arranque necesita "conocer el conjunto", está mal diseñado.
8. **Generado y escrito no se mezclan**: los artefactos generados del contrato (tipos de frontera, validadores de forma) viven en zonas marcadas de solo-generación, regeneradas en CI; editarlos a mano falla el build (09 §regla 5).

## 3. El módulo nuevo

Se crea desde la plantilla oficial (ETS-011/28): las cuatro carpetas, el esquema físico propio, el registro en arranque y las suites transversales conectadas — el primer commit de un módulo nuevo ya compila, ya pasa CI y ya no puede violar la Regla de Dependencia.

---

## Impacto sobre la implementación
Cualquier constructor encuentra cualquier cosa en segundos y coloca lo nuevo sin deliberar; la estructura hace el trabajo que de otro modo harían la memoria y la disciplina.

## ETS relacionados
ETS-011 (23, 24, 28) · ETS-010 (esquema físico por módulo) · ETS-012 (24 nombres, 28 checklist).

## Riesgos
- La primera `utils/` "temporal" → regla 3 sin excepciones; el checklist de PR la caza.
- Estructura respetada en carpetas pero violada en imports → regla 6: la verificación es mecánica, no visual.

## Decisiones habilitadas
Extracción futura de módulos, generación de plantillas, revisión por posición, propiedad clara por carpeta.

## Decisiones bloqueadas
Convenciones de empaquetado del lenguaje concreto (proyectos, workspaces) — la traducción oficial mapea este árbol al stack una sola vez.
