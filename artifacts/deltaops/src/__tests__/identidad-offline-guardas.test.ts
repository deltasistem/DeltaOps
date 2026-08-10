/**
 * DGP-017 · Guardas offline conscientes de identidad/tenant. Un cambio de
 * usuario o de tenant invalida (no reutiliza) las colas offline incompatibles.
 * Ninguna cola de otro tenant sobrevive al cambio de contexto.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  guardarTenantActivo,
  purgarColasDeOtrosTenants,
  purgarAlmacenamientoOffline,
  contextoActivo,
  limpiarContexto,
} from "../lib/identidad/guardas-offline";

function cola(modulo: string, tenant: string, ops: unknown[] = [{ opId: "x" }]) {
  localStorage.setItem(`deltaops:${modulo}:cola:${tenant}`, JSON.stringify(ops));
}

describe("cambio de contexto (usuario/tenant)", () => {
  beforeEach(() => {
    localStorage.clear();
    limpiarContexto();
  });

  it("persiste el contexto activo sin purgar en el primer login", () => {
    cola("ordenes", "tenant-A");
    const cambio = guardarTenantActivo("tenant-A", "user-1");
    expect(cambio).toBe(true); // no había contexto previo
    // No se purga porque no existía contexto anterior.
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-A")).not.toBeNull();
    expect(contextoActivo()).toEqual({ tenantId: "tenant-A", identityId: "user-1" });
  });

  it("un cambio de TENANT purga el almacenamiento offline previo", () => {
    guardarTenantActivo("tenant-A", "user-1");
    cola("ordenes", "tenant-A");
    cola("inventario", "tenant-A");
    const cambio = guardarTenantActivo("tenant-B", "user-1");
    expect(cambio).toBe(true);
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-A")).toBeNull();
    expect(localStorage.getItem("deltaops:inventario:cola:tenant-A")).toBeNull();
    expect(contextoActivo()?.tenantId).toBe("tenant-B");
  });

  it("un cambio de USUARIO en el mismo tenant también purga", () => {
    guardarTenantActivo("tenant-A", "user-1");
    cola("ordenes", "tenant-A");
    const cambio = guardarTenantActivo("tenant-A", "user-2");
    expect(cambio).toBe(true);
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-A")).toBeNull();
  });

  it("mismo usuario y tenant no purga (no hay cambio)", () => {
    guardarTenantActivo("tenant-A", "user-1");
    cola("ordenes", "tenant-A");
    const cambio = guardarTenantActivo("tenant-A", "user-1");
    expect(cambio).toBe(false);
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-A")).not.toBeNull();
  });

  it("purgarColasDeOtrosTenants elimina colas de tenants ajenos y conserva las del activo y las legacy", () => {
    cola("ordenes", "tenant-A");
    cola("ordenes", "tenant-B");
    cola("inventario", "deltaops"); // legacy namespace de los módulos actuales
    purgarColasDeOtrosTenants("tenant-A");
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-A")).not.toBeNull();
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-B")).toBeNull();
    // La cola legacy "deltaops" no se toca (compatibilidad).
    expect(localStorage.getItem("deltaops:inventario:cola:deltaops")).not.toBeNull();
  });

  it("purgarAlmacenamientoOffline preserva el contexto de identidad", () => {
    guardarTenantActivo("tenant-A", "user-1");
    cola("ordenes", "tenant-A");
    purgarAlmacenamientoOffline();
    expect(localStorage.getItem("deltaops:ordenes:cola:tenant-A")).toBeNull();
    // El contexto (clave protegida) sobrevive.
    expect(contextoActivo()?.tenantId).toBe("tenant-A");
  });
});
