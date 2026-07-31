# 18_FILE_PIPELINE.md

> **DeltaOps — ETS-011 · v1.0** · Pipeline de archivos: cómo el Core gobierna binarios sin tocarlos.
> Documento de diseño. Sin código, sin clases.

---

## 1. Las etapas (el ciclo del binario)

```text
SUBIDA
  1. PLAN        comando "solicitar subida": valida tipo/tamaño/
                 categoría contra Policy (05), autoriza contra el
                 dueño lógico (14), crea metadato en estado
                 pendiente y plan por partes si aplica (ETS-008/11)
  2. TRANSFEREN. el cliente sube DIRECTO al almacén de objetos con
                 URL firmada — los bytes jamás pasan por el Core
  3. CONFIRMACIÓN comando "confirmar": verifica huella y tipo real,
                 transiciona a disponible (o cuarentena), emite
                 evento ArchivoDisponible
DESCARGA
  4. ACCESO      consulta autorizada por el dueño lógico → URL
                 firmada de corta vida; si es Restringido, hecho de
                 acceso sensible (17)
DERIVADOS
  5. PROCESO     miniaturas/previsualizaciones como consumidores del
                 evento (10), desechables por convención de nombre
```

## 2. Reglas normativas

1. **El Core gobierna metadatos y permisos; el almacén guarda bytes** (ETS-010/17): ningún puerto del Core transporta contenido binario — solo planes, huellas, estados y URLs.
2. **El permiso del archivo es el permiso de su dueño lógico** (la OT, el activo, el checklist — polimorfismo controlado ETS-010/04 §5): no existe ACL propia de archivos que divergiría de la del recurso.
3. **Evidencia obligatoria es Policy** (05): "el cierre de esta OT exige N fotos" es configuración del tenant validada en el comando de cierre (13 capa 3), no en el pipeline de archivos.
4. **Estados explícitos con vencimiento**: `pendiente` que no confirma vence y termina auditado (ETS-010/17); las consultas operativas ("evidencias sin subir del canal móvil") son read models.
5. **Offline First**: el móvil captura la foto, registra el hecho con la referencia local y sube el binario cuando hay red — el hecho no espera al binario; el estado del archivo lo cuenta (ETS-008/12).
6. **Huella siempre**: sin huella verificada no hay `disponible`; la evidencia es demostrable a perpetuidad (cadena probatoria, 17).

---

## Impacto sobre la implementación
El módulo de archivos implementa los comandos/consultas del ciclo y el adaptador del almacén de objetos; los demás módulos solo referencian archivos por su dueño lógico y declaran sus Policies de evidencia.

## ETS relacionados
ETS-008 (11 contrato) · ETS-009 (13 estrategia) · ETS-010 (17 físico) · ETS-007 (07, NT-09) · ETS-011 (05, 10, 14, 17).

## Riesgos
- Módulos que inventan adjuntos propios fuera del ciclo → un solo módulo de archivos; el lint de dependencias y la revisión lo cierran.
- URLs firmadas de larga vida circulando → vida corta obligatoria y hecho de acceso por emisión (lo fija el contrato ETS-008/11).

## Decisiones habilitadas
Implementación del módulo de archivos, Policies de evidencia por operación, procesadores de derivados.

## Decisiones bloqueadas
Proveedor de objetos y parámetros de vida de URLs (implementación, con ETS-010/17).
