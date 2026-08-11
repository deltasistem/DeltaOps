/**
 * DGP-019.1 · Módulo de Utilización — Policies de dominio.
 *
 * Declarativas y puras (sin IO, sin conocer el tenant). Cada policy está
 * ENLAZADA a un comando concreto y la capa de aplicación la evalúa con el
 * `subject` de coherencia. La regularización de medidor (REINICIO_MEDIDOR) es la
 * operación sensible: exige la capacidad `regularizar` (gate por permiso en el
 * comando) y su policy documenta la regla de negocio.
 */
import type { ExecutionContext } from "@workspace/kernel";

export const POLICY_PUEDE_REGISTRAR_LECTURA = "modulo.utilizacion.puede-registrar-lectura";
export const POLICY_PUEDE_ANULAR_LECTURA = "modulo.utilizacion.puede-anular-lectura";
export const POLICY_PUEDE_REGULARIZAR = "modulo.utilizacion.puede-regularizar-medidor";
export const POLICY_PUEDE_REGISTRAR_TANQUEO = "modulo.utilizacion.puede-registrar-tanqueo";
export const POLICY_PUEDE_ANULAR_TANQUEO = "modulo.utilizacion.puede-anular-tanqueo";

export const POLICIES = [
  POLICY_PUEDE_REGISTRAR_LECTURA,
  POLICY_PUEDE_ANULAR_LECTURA,
  POLICY_PUEDE_REGULARIZAR,
  POLICY_PUEDE_REGISTRAR_TANQUEO,
  POLICY_PUEDE_ANULAR_TANQUEO,
] as const;

type Subject = Record<string, unknown>;
type Decision = { allow: true } | { allow: false; reason: string };

const permitir = (): Decision => ({ allow: true });

export function policiesDelModulo() {
  return [
    { name: POLICY_PUEDE_REGISTRAR_LECTURA, evaluate: (_c: ExecutionContext, _s: Subject): Decision => permitir() },
    { name: POLICY_PUEDE_ANULAR_LECTURA, evaluate: (_c: ExecutionContext, _s: Subject): Decision => permitir() },
    {
      name: POLICY_PUEDE_REGULARIZAR,
      evaluate: (_c: ExecutionContext, s: Subject): Decision => {
        // Regla de negocio: la regularización DEBE declarar un motivo. Una
        // lectura menor NUNCA se interpreta como reinicio automático (eso lo
        // impone el comando); aquí sólo se exige la justificación auditable.
        const motivo = typeof s["motivo"] === "string" ? (s["motivo"] as string).trim() : "";
        if (motivo === "") return { allow: false, reason: "la regularización exige un motivo auditable" };
        return permitir();
      },
    },
    { name: POLICY_PUEDE_REGISTRAR_TANQUEO, evaluate: (_c: ExecutionContext, _s: Subject): Decision => permitir() },
    { name: POLICY_PUEDE_ANULAR_TANQUEO, evaluate: (_c: ExecutionContext, _s: Subject): Decision => permitir() },
  ];
}
