/**
 * DGP-013 · Módulo Enterprise Procurement — Policies de dominio (PolicyEngine).
 *
 * Declarativas y puras: sin IO, sin conocer el tenant. La capa de aplicación lee
 * la configuración `modulo.abastecimiento.<clave>` y la coherencia del aggregate,
 * y las inyecta en el `subject`. Cada policy está ENLAZADA a un comando concreto.
 *
 * Las policies expresan reglas de NEGOCIO transversales; NO sustituyen al
 * Workflow Engine (que gobierna QUÉ transición es admisible).
 */
export const POLICY_PUEDE_CREAR_ARTICULO = "modulo.abastecimiento.puede-crear-articulo";
export const POLICY_PUEDE_EDITAR_ARTICULO = "modulo.abastecimiento.puede-editar-articulo";
export const POLICY_PUEDE_CREAR_PROVEEDOR = "modulo.abastecimiento.puede-crear-proveedor";
export const POLICY_PUEDE_CALIFICAR_PROVEEDOR = "modulo.abastecimiento.puede-calificar-proveedor";
export const POLICY_PUEDE_CREAR_SOLICITUD = "modulo.abastecimiento.puede-crear-solicitud";
export const POLICY_PUEDE_TRANSICIONAR_SOLICITUD = "modulo.abastecimiento.puede-transicionar-solicitud";
export const POLICY_PUEDE_REGISTRAR_COTIZACION = "modulo.abastecimiento.puede-registrar-cotizacion";
export const POLICY_PUEDE_CREAR_OC = "modulo.abastecimiento.puede-crear-orden-compra";
export const POLICY_PUEDE_TRANSICIONAR_OC = "modulo.abastecimiento.puede-transicionar-orden-compra";
export const POLICY_PUEDE_RECIBIR = "modulo.abastecimiento.puede-recibir";

export const POLICIES = [
  POLICY_PUEDE_CREAR_ARTICULO,
  POLICY_PUEDE_EDITAR_ARTICULO,
  POLICY_PUEDE_CREAR_PROVEEDOR,
  POLICY_PUEDE_CALIFICAR_PROVEEDOR,
  POLICY_PUEDE_CREAR_SOLICITUD,
  POLICY_PUEDE_TRANSICIONAR_SOLICITUD,
  POLICY_PUEDE_REGISTRAR_COTIZACION,
  POLICY_PUEDE_CREAR_OC,
  POLICY_PUEDE_TRANSICIONAR_OC,
  POLICY_PUEDE_RECIBIR,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_CREAR_ARTICULO,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_EDITAR_ARTICULO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        return permitir(s["activo"] === false ? "editable-inactivo" : "editable");
      },
    },
    {
      name: POLICY_PUEDE_CREAR_PROVEEDOR,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_CALIFICAR_PROVEEDOR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        if (s["activo"] === false) return denegar("Un proveedor inactivo no puede calificarse");
        return permitir("calificable");
      },
    },
    {
      name: POLICY_PUEDE_CREAR_SOLICITUD,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR_SOLICITUD,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "borrador");
        if (estado === "rechazada" || estado === "cerrada") return denegar(`Una solicitud ${estado} no admite transiciones`);
        return permitir("transicionable");
      },
    },
    {
      name: POLICY_PUEDE_REGISTRAR_COTIZACION,
      evaluate(_ctx: unknown, s: Subject): Decision {
        // Sólo se cotiza una solicitud ENVIADA o APROBADA (necesidad vigente).
        const estado = String(s["estadoSolicitud"] ?? "");
        if (estado !== "enviada" && estado !== "aprobada") {
          return denegar("Sólo se cotizan solicitudes enviadas o aprobadas");
        }
        return permitir("cotizable");
      },
    },
    {
      name: POLICY_PUEDE_CREAR_OC,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR_OC,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "borrador");
        if (estado === "recibida" || estado === "cancelada") return denegar(`Una OC ${estado} no admite transiciones`);
        return permitir("transicionable");
      },
    },
    {
      name: POLICY_PUEDE_RECIBIR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "");
        if (estado !== "enviada" && estado !== "parcialmenteRecibida") {
          return denegar("Sólo se recibe contra una OC enviada o parcialmente recibida");
        }
        return permitir("recibible");
      },
    },
  ];
}
