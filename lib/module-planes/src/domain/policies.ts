/**
 * DGP-012 · Módulo Enterprise Maintenance Plans — Policies de dominio (PolicyEngine).
 *
 * Declarativas y puras: sin IO, sin conocer el tenant. La capa de aplicación lee
 * la configuración `modulo.planes.<clave>` y la coherencia del aggregate, y las
 * inyecta en el `subject`. Cada policy está ENLAZADA a un comando concreto.
 *
 * Las policies expresan reglas de NEGOCIO transversales; NO sustituyen al
 * Workflow Engine (que gobierna QUÉ transición de plan es admisible).
 */
export const POLICY_PUEDE_CREAR_PLAN = "modulo.planes.puede-crear-plan";
export const POLICY_PUEDE_EDITAR_PLAN = "modulo.planes.puede-editar-plan";
export const POLICY_PUEDE_PUBLICAR_PLAN = "modulo.planes.puede-publicar-plan";
export const POLICY_PUEDE_TRANSICIONAR_PLAN = "modulo.planes.puede-transicionar-plan";
export const POLICY_PUEDE_GENERAR_ORDEN = "modulo.planes.puede-generar-orden";
export const POLICY_PUEDE_ARCHIVAR_PLAN = "modulo.planes.puede-archivar-plan";

export const POLICIES = [
  POLICY_PUEDE_CREAR_PLAN,
  POLICY_PUEDE_EDITAR_PLAN,
  POLICY_PUEDE_PUBLICAR_PLAN,
  POLICY_PUEDE_TRANSICIONAR_PLAN,
  POLICY_PUEDE_GENERAR_ORDEN,
  POLICY_PUEDE_ARCHIVAR_PLAN,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_CREAR_PLAN,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_EDITAR_PLAN,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["estado"] === "archivado") return denegar("Un plan archivado es inmutable");
        return permitir("editable");
      },
    },
    {
      name: POLICY_PUEDE_PUBLICAR_PLAN,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["estado"] === "archivado") return denegar("Un plan archivado no puede publicarse");
        if (s["hayBorrador"] !== true) return denegar("No hay una versión borrador pendiente");
        return permitir("publicable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR_PLAN,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "borrador");
        if (estado === "archivado" || estado === "finalizado") {
          return denegar(`Un plan ${estado} no admite transiciones`);
        }
        return permitir("transicionable");
      },
    },
    {
      name: POLICY_PUEDE_GENERAR_ORDEN,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Sólo un plan VIGENTE genera órdenes automáticamente.
        if (s["estado"] !== "vigente") return denegar("Sólo un plan vigente genera órdenes");
        return permitir("generable");
      },
    },
    {
      name: POLICY_PUEDE_ARCHIVAR_PLAN,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["estado"] === "archivado") return denegar("El plan ya está archivado");
        return permitir("archivable");
      },
    },
  ];
}
