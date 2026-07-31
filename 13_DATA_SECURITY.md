# 13_DATA_SECURITY.md

> **DeltaOps — ETS-006 · v1.0** · Seguridad de datos: clasificación y protección.
> Documento de diseño. No implementa nada.

---

## 1. Clasificación (cinco niveles)

Todo tipo de dato lleva clasificación asignada por el producto (el tenant puede subirla, nunca bajarla):

| Nivel | Definición | Ejemplos | Protección mínima |
|---|---|---|---|
| **Público** | Puede verse fuera del tenant sin daño | Nombre comercial del tenant, catálogos globales (países, unidades) | Integridad |
| **Interno** | Cualquier usuario autenticado del tenant, en su alcance | Catálogos del tenant, estructura organizacional, fichas de activos | Autenticación + alcance |
| **Confidencial** | Solo roles con permiso explícito | Costos, compras, contratos, indicadores financieros, datos de proveedores | Permiso explícito + acceso auditado |
| **Restringido** | Datos personales y de terceros con obligación legal | Datos de personas (contacto, documentos de identidad), firmas, evaluaciones de contratistas | Minimización, máscara por defecto, acceso auditado con motivo |
| **Crítico** | Su compromiso daña la confianza del sistema | Credenciales, secretos de integraciones, cadena de auditoría, claves de firma | Bóveda, nunca visibles tras guardarse, doble control en cambios |

## 2. Encriptación

- **En tránsito:** todo canal cifrado, sin excepciones (web, móvil, API, webhooks, sincronización).
- **En reposo:** todo el patrimonio cifrado; los niveles Restringido y Crítico con claves separadas por tenant y rotación gobernada.
- **Secretos:** en bóveda dedicada (credenciales de integraciones, ETS-005/10); jamás en configuración legible ni exportaciones.
- **Evidencias:** fotos/firmas/GPS heredan el nivel de su hecho; las firmas son Restringido siempre.

## 3. Máscaras

- Los datos Restringidos se muestran **enmascarados por defecto** (documento de identidad: `•••••1234`); revelar exige permiso y queda auditado con motivo.
- Las exportaciones aplican la máscara del rol que exporta: exportar no des-enmascara.
- Los marts de BI y las vistas de IA reciben datos personales **ya minimizados** (rol/cargo en lugar de persona cuando el análisis lo permite).

## 4. Anonimización

- **Supresión de datos personales** (→ `09_DATA_LIFECYCLE.md`): reemplazo irreversible y consistente de la identidad en maestros, hechos, evidencias y auditoría — la historia operativa queda íntegra ("un técnico certificado"), la persona desaparece.
- **Consistente:** la misma persona anonimizada recibe el mismo seudónimo irreversible, para que los análisis (productividad por técnico) no se rompan.
- **Datos para mejora de modelos de IA:** solo con política del tenant que lo permita y siempre anonimizados (ETS-005/11; por defecto: no).

## 5. Acceso

1. **Mínimo privilegio por contexto:** todo acceso se evalúa con rol + contexto activo + vigencia de membresía (Core); denegado por defecto.
2. **Accesos auditados:** lectura de Confidencial en adelante deja rastro; patrones anómalos (exportaciones masivas, lecturas fuera de horario/ámbito) generan alertas de seguridad.
3. **Cuentas de servicio con alcance propio** para integraciones y BI; jamás credenciales personales embebidas.
4. **Aislamiento multi-tenant absoluto:** ningún nivel de permiso cruza tenants; ni siquiera el soporte del fabricante accede a datos del tenant sin acceso otorgado, temporal y auditado.

## 6. Retención de seguridad

- Registros de acceso y seguridad: retención larga (misma clase que auditoría).
- Datos personales: solo mientras la relación y la ley lo exijan; después, anonimización programada (no depende de que alguien se acuerde).
- Credenciales y secretos: rotación periódica; los revocados se destruyen, no se archivan.

## 7. Privacy by Design (síntesis)

Minimizar en la captura (solo lo necesario para operar) · clasificar en el diseño (todo tipo de dato nace clasificado) · proteger por defecto (máscaras, cifrado, denegado por defecto) · auditar el acceso (ver también es un hecho) · borrar por diseño (anonimización programada, supresión ejercitable, salida del tenant limpia).
