/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — Policies de dominio (Kernel PolicyEngine).
 *
 * Declarativas y puras. Se registran una sola vez al montar el módulo y se
 * evalúan en la autorización de cada comando. Su comportamiento es CONFIGURABLE
 * por tenant: la capa de aplicación lee la configuración `modulo.ordenes.<clave>`
 * y la pasa como parte del `subject`, de modo que las policies nunca hacen IO ni
 * conocen el tenant.
 *
 * IMPORTANTE: las policies NO reemplazan al Workflow Engine. El motor gobierna
 * QUÉ transición es admisible; estas policies expresan reglas de NEGOCIO
 * transversales (p.ej. una OT en estado final es inmutable, la edición requiere
 * borrador según configuración, la asociación de formularios exige un estado
 * mínimo, etc.).
 */
export const POLICY_PUEDE_CREAR = "modulo.ordenes.puede-crear";
export const POLICY_PUEDE_EDITAR = "modulo.ordenes.puede-editar";
export const POLICY_PUEDE_ASIGNAR = "modulo.ordenes.puede-asignar";
export const POLICY_PUEDE_EJECUTAR = "modulo.ordenes.puede-ejecutar";
export const POLICY_PUEDE_ASOCIAR_FORMULARIO = "modulo.ordenes.puede-asociar-formulario";
export const POLICY_PUEDE_ASOCIAR_CHECKLIST = "modulo.ordenes.puede-asociar-checklist";
export const POLICY_PUEDE_AGREGAR_EVIDENCIA = "modulo.ordenes.puede-agregar-evidencia";
export const POLICY_PUEDE_TRANSICIONAR = "modulo.ordenes.puede-transicionar";

export const POLICIES = [
  POLICY_PUEDE_CREAR,
  POLICY_PUEDE_EDITAR,
  POLICY_PUEDE_ASIGNAR,
  POLICY_PUEDE_EJECUTAR,
  POLICY_PUEDE_ASOCIAR_FORMULARIO,
  POLICY_PUEDE_ASOCIAR_CHECKLIST,
  POLICY_PUEDE_AGREGAR_EVIDENCIA,
  POLICY_PUEDE_TRANSICIONAR,
] as const;

const FINALES = new Set(["CERRADA", "CANCELADA"]);

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_CREAR,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        // Crear siempre parte de BORRADOR; no hay restricción adicional.
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_EDITAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (FINALES.has(String(s["estado"]))) return denegar("Una OT en estado final es inmutable");
        // La configuración del tenant puede exigir edición solo en BORRADOR.
        if (s["soloBorrador"] === true && s["estado"] !== "BORRADOR") {
          return denegar("La configuración del tenant solo permite editar en BORRADOR");
        }
        return permitir("editable");
      },
    },
    {
      name: POLICY_PUEDE_ASIGNAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return FINALES.has(String(s["estado"]))
          ? denegar("No se asigna una OT en estado final")
          : permitir("asignable");
      },
    },
    {
      name: POLICY_PUEDE_EJECUTAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // La ejecución (diagnóstico/tiempos/costos reales) requiere haber
        // pasado a EN_EJECUCION o posteriores no finales.
        const estado = String(s["estado"]);
        if (FINALES.has(estado)) return denegar("Una OT en estado final no admite ejecución");
        const admitidos = new Set(["EN_EJECUCION", "PAUSADA", "EN_VALIDACION"]);
        return admitidos.has(estado)
          ? permitir("ejecutable")
          : denegar(`No se registra ejecución en estado ${estado}`);
      },
    },
    {
      name: POLICY_PUEDE_ASOCIAR_FORMULARIO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return FINALES.has(String(s["estado"]))
          ? denegar("No se asocian formularios a una OT en estado final")
          : permitir("asociable");
      },
    },
    {
      name: POLICY_PUEDE_ASOCIAR_CHECKLIST,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return FINALES.has(String(s["estado"]))
          ? denegar("No se asocian checklists a una OT en estado final")
          : permitir("asociable");
      },
    },
    {
      name: POLICY_PUEDE_AGREGAR_EVIDENCIA,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Las evidencias pueden agregarse hasta el cierre (inclusive validación),
        // pero no sobre una OT CANCELADA.
        return s["estado"] === "CANCELADA"
          ? denegar("No se agregan evidencias a una OT CANCELADA")
          : permitir("evidenciable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Guardarraíl de negocio previo a delegar en el Workflow Engine: una OT
        // ya finalizada no admite nuevas transiciones (el motor también lo
        // impide; esto da un error de dominio claro y evita llamadas inútiles).
        return FINALES.has(String(s["estado"]))
          ? denegar("Una OT en estado final no admite transiciones")
          : permitir("transicionable");
      },
    },
  ];
}
