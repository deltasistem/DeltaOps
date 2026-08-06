/**
 * DGP-014 · Módulo Enterprise Preventive Maintenance — Policies de dominio.
 *
 * Declarativas y puras: sin IO, sin conocer el tenant. La capa de aplicación lee
 * la configuración `modulo.preventivo.<clave>` y la coherencia del aggregate, y
 * las inyecta en el `subject`. Cada policy está ENLAZADA a un comando concreto.
 *
 * Las policies expresan reglas de NEGOCIO transversales; NO sustituyen al
 * Workflow Engine (que gobierna QUÉ transición es admisible).
 */
export const POLICY_PUEDE_CREAR_PROGRAMA = "modulo.preventivo.puede-crear-programa";
export const POLICY_PUEDE_EDITAR_PROGRAMA = "modulo.preventivo.puede-editar-programa";
export const POLICY_PUEDE_TRANSICIONAR_PROGRAMA = "modulo.preventivo.puede-transicionar-programa";
export const POLICY_PUEDE_VERSIONAR_PROGRAMA = "modulo.preventivo.puede-versionar-programa";
export const POLICY_PUEDE_DEFINIR_ACTIVIDAD = "modulo.preventivo.puede-definir-actividad";
export const POLICY_PUEDE_PROGRAMAR = "modulo.preventivo.puede-programar";
export const POLICY_PUEDE_GENERAR = "modulo.preventivo.puede-generar";

export const POLICIES = [
  POLICY_PUEDE_CREAR_PROGRAMA,
  POLICY_PUEDE_EDITAR_PROGRAMA,
  POLICY_PUEDE_TRANSICIONAR_PROGRAMA,
  POLICY_PUEDE_VERSIONAR_PROGRAMA,
  POLICY_PUEDE_DEFINIR_ACTIVIDAD,
  POLICY_PUEDE_PROGRAMAR,
  POLICY_PUEDE_GENERAR,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_CREAR_PROGRAMA,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_EDITAR_PROGRAMA,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "preparacion");
        if (estado !== "preparacion" && estado !== "revision") {
          return denegar(`Un programa en estado "${estado}" no se edita; use versionado`);
        }
        return permitir("editable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR_PROGRAMA,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "preparacion");
        if (estado === "archivado") return denegar("Un programa archivado no admite transiciones");
        return permitir("transicionable");
      },
    },
    {
      name: POLICY_PUEDE_VERSIONAR_PROGRAMA,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "");
        if (estado !== "publicado" && estado !== "suspendido") {
          return denegar("Sólo se versiona un programa publicado o suspendido");
        }
        return permitir("versionable");
      },
    },
    {
      name: POLICY_PUEDE_DEFINIR_ACTIVIDAD,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estadoPrograma"] ?? "preparacion");
        if (estado === "archivado") return denegar("No se definen actividades en un programa archivado");
        return permitir("definible");
      },
    },
    {
      name: POLICY_PUEDE_PROGRAMAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estadoPrograma"] ?? "");
        if (estado !== "publicado") return denegar("Sólo se programa un programa publicado");
        return permitir("programable");
      },
    },
    {
      name: POLICY_PUEDE_GENERAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estadoPrograma"] ?? "");
        if (estado !== "publicado") return denegar("Sólo se genera desde un programa publicado");
        return permitir("generable");
      },
    },
  ];
}
