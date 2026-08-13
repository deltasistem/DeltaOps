/**
 * DGP-021.4-E · Superficie de Costos de mantenimiento (comparativa + tendencia).
 * Página bajo el shell existente; sólo lectura. Todo el dato viene de los
 * contratos públicos; el frontend sólo presenta (§26).
 */
import React from "react";
import { PageHeader } from "@workspace/design-system";
import { ShellCostos } from "../lib/costos/Shell";
import { SuperficieCostos } from "../lib/costos/SuperficieCostos";

export default function CostosPage() {
  return (
    <ShellCostos activo="/costos">
      <PageHeader
        titulo="Costos de mantenimiento"
        descripcion="Compara activos y observa la tendencia de costo, horas y km por período. Los importes se muestran por moneda; nunca se combinan monedas."
      />
      <SuperficieCostos />
    </ShellCostos>
  );
}
