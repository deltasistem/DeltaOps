/** DGP-011.1 · Pruebas de las 10 POLICIES (decisiones puras, ambas ramas). */
import { describe, expect, it } from "vitest";
import {
  POLICIES,
  POLICY_PUEDE_AJUSTAR,
  POLICY_PUEDE_CERRAR_CONTEO,
  POLICY_PUEDE_CONTAR,
  POLICY_PUEDE_CREAR_ITEM,
  POLICY_PUEDE_ELIMINAR_ITEM,
  POLICY_PUEDE_LIBERAR_RESERVA,
  POLICY_PUEDE_MODIFICAR_ITEM,
  POLICY_PUEDE_MOVER_INVENTARIO,
  POLICY_PUEDE_RESERVAR,
  POLICY_PUEDE_TRANSFERIR,
  policiesDelModulo,
} from "..";

const registro = new Map(policiesDelModulo().map((p) => [p.name, p]));
function decidir(name: string, subject: Record<string, unknown>) {
  return registro.get(name)!.evaluate({}, subject).allow;
}

describe("Policies · catálogo completo (10) enlazadas a comandos", () => {
  it("expone exactamente 10 policies con nombre único bajo el módulo", () => {
    expect(POLICIES).toHaveLength(10);
    expect(new Set(POLICIES).size).toBe(10);
    for (const p of POLICIES) expect(p.startsWith("modulo.inventario.")).toBe(true);
  });

  it("puede-crear-item permite", () => {
    expect(decidir(POLICY_PUEDE_CREAR_ITEM, {})).toBe(true);
  });
  it("puede-modificar-item deniega si eliminado", () => {
    expect(decidir(POLICY_PUEDE_MODIFICAR_ITEM, { eliminado: false })).toBe(true);
    expect(decidir(POLICY_PUEDE_MODIFICAR_ITEM, { eliminado: true })).toBe(false);
  });
  it("puede-mover-inventario respeta eliminado y exigencia de item activo", () => {
    expect(decidir(POLICY_PUEDE_MOVER_INVENTARIO, {})).toBe(true);
    expect(decidir(POLICY_PUEDE_MOVER_INVENTARIO, { itemEliminado: true })).toBe(false);
    expect(decidir(POLICY_PUEDE_MOVER_INVENTARIO, { exigirItemActivo: true, itemActivo: false })).toBe(false);
    expect(decidir(POLICY_PUEDE_MOVER_INVENTARIO, { exigirItemActivo: true, itemActivo: true })).toBe(true);
  });
  it("puede-reservar deniega item eliminado", () => {
    expect(decidir(POLICY_PUEDE_RESERVAR, {})).toBe(true);
    expect(decidir(POLICY_PUEDE_RESERVAR, { itemEliminado: true })).toBe(false);
  });
  it("puede-liberar-reserva solo si activa", () => {
    expect(decidir(POLICY_PUEDE_LIBERAR_RESERVA, { estadoReserva: "activa" })).toBe(true);
    expect(decidir(POLICY_PUEDE_LIBERAR_RESERVA, { estadoReserva: "liberada" })).toBe(false);
  });
  it("puede-transferir deniega estados terminales", () => {
    expect(decidir(POLICY_PUEDE_TRANSFERIR, { estado: "en-transito" })).toBe(true);
    expect(decidir(POLICY_PUEDE_TRANSFERIR, { estado: "completada" })).toBe(false);
    expect(decidir(POLICY_PUEDE_TRANSFERIR, { estado: "cancelada" })).toBe(false);
  });
  it("puede-ajustar deniega estados terminales", () => {
    expect(decidir(POLICY_PUEDE_AJUSTAR, { estado: "borrador" })).toBe(true);
    expect(decidir(POLICY_PUEDE_AJUSTAR, { estado: "aplicado" })).toBe(false);
    expect(decidir(POLICY_PUEDE_AJUSTAR, { estado: "rechazado" })).toBe(false);
  });
  it("puede-contar deniega conteo cerrado", () => {
    expect(decidir(POLICY_PUEDE_CONTAR, { estado: "abierto" })).toBe(true);
    expect(decidir(POLICY_PUEDE_CONTAR, { estado: "cerrado" })).toBe(false);
  });
  it("puede-cerrar-conteo deniega cerrado o con pendientes", () => {
    expect(decidir(POLICY_PUEDE_CERRAR_CONTEO, {})).toBe(true);
    expect(decidir(POLICY_PUEDE_CERRAR_CONTEO, { estado: "cerrado" })).toBe(false);
    expect(decidir(POLICY_PUEDE_CERRAR_CONTEO, { hayPendientes: true })).toBe(false);
  });
  it("puede-eliminar-item deniega eliminado o con existencias", () => {
    expect(decidir(POLICY_PUEDE_ELIMINAR_ITEM, {})).toBe(true);
    expect(decidir(POLICY_PUEDE_ELIMINAR_ITEM, { eliminado: true })).toBe(false);
    expect(decidir(POLICY_PUEDE_ELIMINAR_ITEM, { conExistencias: true })).toBe(false);
  });
});
