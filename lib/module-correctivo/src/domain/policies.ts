/**
 * DGP-015 · Módulo Enterprise Corrective Maintenance — Policies de dominio.
 *
 * Declarativas y puras: sin IO, sin conocer el tenant. La capa de aplicación
 * inyecta la coherencia del aggregate en el `subject`. Cada policy está ENLAZADA
 * a un comando concreto. Las policies expresan reglas de NEGOCIO transversales;
 * NO sustituyen al Workflow Engine (que gobierna QUÉ transición es admisible).
 */
export const POLICY_PUEDE_CREAR_SOLICITUD = "modulo.correctivo.puede-crear-solicitud";
export const POLICY_PUEDE_EDITAR_SOLICITUD = "modulo.correctivo.puede-editar-solicitud";
export const POLICY_PUEDE_TRANSICIONAR_SOLICITUD = "modulo.correctivo.puede-transicionar-solicitud";
export const POLICY_PUEDE_DIAGNOSTICAR = "modulo.correctivo.puede-diagnosticar";
export const POLICY_PUEDE_GENERAR_ORDEN = "modulo.correctivo.puede-generar-orden";
export const POLICY_PUEDE_ASIGNAR = "modulo.correctivo.puede-asignar";
export const POLICY_PUEDE_TRANSICIONAR_INTERVENCION = "modulo.correctivo.puede-transicionar-intervencion";
export const POLICY_PUEDE_CONSUMIR_INVENTARIO = "modulo.correctivo.puede-consumir-inventario";

export const POLICIES = [
  POLICY_PUEDE_CREAR_SOLICITUD,
  POLICY_PUEDE_EDITAR_SOLICITUD,
  POLICY_PUEDE_TRANSICIONAR_SOLICITUD,
  POLICY_PUEDE_DIAGNOSTICAR,
  POLICY_PUEDE_GENERAR_ORDEN,
  POLICY_PUEDE_ASIGNAR,
  POLICY_PUEDE_TRANSICIONAR_INTERVENCION,
  POLICY_PUEDE_CONSUMIR_INVENTARIO,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: boolean; reason: string };

const permitir = (reason: string): Decision => ({ allow: true, reason });
const denegar = (reason: string): Decision => ({ allow: false, reason });

export function policiesDelModulo() {
  return [
    {
      name: POLICY_PUEDE_CREAR_SOLICITUD,
      evaluate(_ctx: unknown, _s: Subject): Decision {
        return permitir("creable");
      },
    },
    {
      name: POLICY_PUEDE_EDITAR_SOLICITUD,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "registro");
        if (estado === "aprobada" || estado === "rechazada") {
          return denegar(`Una solicitud "${estado}" es inmutable`);
        }
        return permitir("editable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR_SOLICITUD,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "registro");
        if (estado === "aprobada" || estado === "rechazada") {
          return denegar(`Una solicitud "${estado}" no admite transiciones`);
        }
        return permitir("transicionable");
      },
    },
    {
      name: POLICY_PUEDE_DIAGNOSTICAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "");
        if (estado !== "triage" && estado !== "diagnostico") {
          return denegar("El diagnóstico sólo se registra en triage o diagnóstico");
        }
        return permitir("diagnosticable");
      },
    },
    {
      name: POLICY_PUEDE_GENERAR_ORDEN,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "");
        if (estado !== "aprobada") return denegar("Sólo se genera la OT desde una solicitud aprobada");
        return permitir("generable");
      },
    },
    {
      name: POLICY_PUEDE_ASIGNAR,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "preparacion");
        if (estado === "cerrada") return denegar("Una intervención cerrada no admite asignación");
        return permitir("asignable");
      },
    },
    {
      name: POLICY_PUEDE_TRANSICIONAR_INTERVENCION,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "preparacion");
        if (estado === "cerrada") return denegar("Una intervención cerrada no admite transiciones");
        return permitir("transicionable");
      },
    },
    {
      name: POLICY_PUEDE_CONSUMIR_INVENTARIO,
      evaluate(_ctx: unknown, s: Subject): Decision {
        const estado = String(s["estado"] ?? "");
        if (estado !== "ejecucion" && estado !== "asignacion") {
          return denegar("El consumo de inventario requiere una intervención en asignación o ejecución");
        }
        return permitir("consumible");
      },
    },
  ];
}
