/**
 * DGP-008.3 · Pruebas del filtro de búsqueda local (degradación cliente).
 */
import { describe, it, expect } from "vitest";
import { filtrarLocal } from "../lib/activos/hooks";
import type { ActivoRow } from "../lib/activos/tipos";

function activo(p: Partial<ActivoRow>): ActivoRow {
  return {
    tenantId: "deltaops",
    id: p.id ?? "id",
    codigoEmpresarial: p.codigoEmpresarial ?? "EQ-000",
    nombre: p.nombre ?? "Activo",
    estado: p.estado ?? "OPERATIVO",
    tipo: p.tipo ?? "maquinaria",
    criticidad: p.criticidad ?? null,
    ubicacionId: p.ubicacionId ?? null,
    datos: p.datos ?? {},
    version: p.version ?? 1,
    lastEventId: "e",
    actualizadoAt: "2026-01-01T00:00:00Z",
  };
}

const datos: ActivoRow[] = [
  activo({ id: "1", nombre: "Bomba centrífuga", codigoEmpresarial: "EQ-001", tipo: "bomba" }),
  activo({ id: "2", nombre: "Motor eléctrico", codigoEmpresarial: "EQ-002", tipo: "motor" }),
  activo({ id: "3", nombre: "Compresor", codigoEmpresarial: "CMP-100", tipo: "compresor" }),
];

describe("filtrarLocal", () => {
  it("devuelve todo con menos de 2 caracteres", () => {
    expect(filtrarLocal(datos, "")).toHaveLength(3);
    expect(filtrarLocal(datos, "a")).toHaveLength(3);
  });

  it("filtra por nombre (case-insensitive)", () => {
    const r = filtrarLocal(datos, "bomba");
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("1");
  });

  it("filtra por código empresarial", () => {
    const r = filtrarLocal(datos, "cmp");
    expect(r.map((x) => x.id)).toEqual(["3"]);
  });

  it("filtra por tipo", () => {
    expect(filtrarLocal(datos, "motor").map((x) => x.id)).toEqual(["2"]);
  });

  it("devuelve vacío si no hay coincidencias", () => {
    expect(filtrarLocal(datos, "inexistente")).toHaveLength(0);
  });
});
