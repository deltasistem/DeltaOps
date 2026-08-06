/**
 * DGP-011.3 · Pruebas de CONTRATO frontend ↔ API de Inventario (011.x congelada).
 *
 * Verifican que los cuerpos que construyen las mutaciones del frontend coinciden
 * con los esquemas del contrato OpenAPI CONGELADO de `@workspace/module-inventario`,
 * tanto en el envío directo (online) como en la operación ENCOLADA (offline).
 * La fuente de verdad es `lib/module-inventario/openapi/inventario.openapi.json`.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearItem,
  editarItem,
  mover,
  reservar,
  liberarReserva,
  transferir,
  transicionarTransferencia,
  ajustar,
  iniciarConteo,
  registrarConteo,
  cerrarConteo,
  crearLote,
  registrarSerie,
  crearBodega,
  crearUbicacion,
} from "../lib/inventario/mutaciones";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-inventario/openapi/inventario.openapi.json");
const spec = JSON.parse(readFileSync(rutaSpec, "utf8")) as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, JsonSchema> };
};
const schemas = spec.components.schemas;

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: string[];
  minimum?: number;
  exclusiveMinimum?: number;
  minLength?: number;
  maxLength?: number;
  nullable?: boolean;
  $ref?: string;
  items?: JsonSchema;
  format?: string;
}

function resolver(s: JsonSchema): JsonSchema {
  if (s.$ref) return schemas[s.$ref.replace("#/components/schemas/", "")]!;
  return s;
}

function validar(nombre: string, valor: unknown, ruta = nombre): string[] {
  const s = resolver(schemas[nombre] ?? ({} as JsonSchema));
  return validarContra(s, valor, ruta);
}

function validarContra(schemaIn: JsonSchema, valor: unknown, ruta: string): string[] {
  const s = resolver(schemaIn);
  const errores: string[] = [];
  if (valor === null) {
    if (!s.nullable) errores.push(`${ruta}: null no permitido`);
    return errores;
  }
  if (s.enum && !s.enum.includes(valor as string)) {
    errores.push(`${ruta}: "${String(valor)}" no está en enum [${s.enum.join(", ")}]`);
  }
  if (s.type === "object") {
    if (typeof valor !== "object" || Array.isArray(valor)) {
      errores.push(`${ruta}: se esperaba objeto`);
      return errores;
    }
    const v = valor as Record<string, unknown>;
    for (const req of s.required ?? []) {
      if (v[req] === undefined) errores.push(`${ruta}: falta propiedad requerida "${req}"`);
    }
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      const propSchema = s.properties?.[k];
      if (!propSchema) {
        if (s.additionalProperties === false) errores.push(`${ruta}.${k}: propiedad no permitida (additionalProperties:false)`);
        continue;
      }
      errores.push(...validarContra(propSchema, val, `${ruta}.${k}`));
    }
  } else if (s.type === "string") {
    if (typeof valor !== "string") errores.push(`${ruta}: se esperaba string`);
    else {
      if (s.minLength != null && valor.length < s.minLength) errores.push(`${ruta}: longitud < ${s.minLength}`);
      if (s.maxLength != null && valor.length > s.maxLength) errores.push(`${ruta}: longitud > ${s.maxLength}`);
    }
  } else if (s.type === "integer" || s.type === "number") {
    if (typeof valor !== "number") errores.push(`${ruta}: se esperaba número`);
    else {
      if (s.minimum != null && valor < s.minimum) errores.push(`${ruta}: < mínimo ${s.minimum}`);
      if (s.exclusiveMinimum != null && valor <= s.exclusiveMinimum) errores.push(`${ruta}: <= exclusiveMinimum ${s.exclusiveMinimum}`);
    }
  } else if (s.type === "boolean") {
    if (typeof valor !== "boolean") errores.push(`${ruta}: se esperaba boolean`);
  } else if (s.type === "array") {
    if (!Array.isArray(valor)) errores.push(`${ruta}: se esperaba array`);
    else if (s.items) valor.forEach((el, i) => errores.push(...validarContra(s.items!, el, `${ruta}[${i}]`)));
  }
  return errores;
}

let ultimoBody: Record<string, unknown> | null = null;
function espiarFetch(respuesta: unknown = { ok: true }): void {
  ultimoBody = null;
  vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
    ultimoBody = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    return new Response(JSON.stringify(respuesta), { status: 200, headers: { "Content-Type": "application/json" } });
  });
}

function reciboOk(ops: OperacionCola[]): ResumenSync {
  return {
    total: ops.length, aplicadas: ops.length, idempotentes: 0, conflictos: 0,
    reintentables: 0, rechazadas: 0,
    resultados: ops.map((o) => ({ opId: o.opId, comando: o.comando, estado: "aplicada" })),
  };
}
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "inventario");

function opInput(cola: ColaSync): Record<string, unknown> {
  return cola.getSnapshot()[0]!.input as Record<string, unknown>;
}

describe("contrato · el JSON OpenAPI congelado expone los esquemas usados", () => {
  it("incluye todos los esquemas de comando consumidos por el frontend", () => {
    for (const n of [
      "CrearItem", "EditarItem", "Mover", "Reservar", "LiberarReserva", "Transferir",
      "TransicionarTransferencia", "Ajustar", "IniciarConteo", "RegistrarConteo", "CerrarConteo",
      "CrearLote", "RegistrarSerie", "CrearBodega", "CrearUbicacion", "OperacionSync", "ColaSync",
    ]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });

  it("expone el path de sincronización offline por orquestación", () => {
    expect(spec.paths["/api/deltaops/inventario/sync"], "falta /sync").toBeTruthy();
  });
});

describe("contrato · crear item", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple CrearItem (unidadBase + modoTrazabilidad + id acuñado)", async () => {
    espiarFetch();
    await crearItem(nuevaCola(), {
      sku: "FLT-1", nombre: "Filtro", tipoItem: "filtro", modoTrazabilidad: "lote",
      unidadBase: { clave: "u" }, categoria: "consumibles", reposicion: { minimo: 2, puntoReorden: 5 },
    });
    expect(ultimoBody).toBeTruthy();
    expect((ultimoBody as Record<string, unknown>).id).toBeTruthy();
    expect((ultimoBody as Record<string, unknown>).opId).toBeTruthy();
    expect(validar("CrearItem", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO (offline) cumple CrearItem y acuña id de cliente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await crearItem(cola, { sku: "S", nombre: "N", tipoItem: "t", modoTrazabilidad: "ninguna", unidadBase: { clave: "u" } });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.inventario.crear-item");
    expect(op.input).toHaveProperty("id");
    expect(validar("CrearItem", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("rechaza modoTrazabilidad ausente (requerido por el contrato)", async () => {
    espiarFetch();
    await crearItem(nuevaCola(), { sku: "S", nombre: "N", tipoItem: "t", unidadBase: { clave: "u" }, modoTrazabilidad: undefined as unknown as string });
    // el builder pone un valor por defecto; forzamos la ausencia validando sin él
    const sinModo = { ...(ultimoBody as Record<string, unknown>) };
    delete sinModo.modoTrazabilidad;
    expect(validar("CrearItem", sinModo).length).toBeGreaterThan(0);
  });
});

describe("contrato · editar item (anclado a expectedVersion)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple EditarItem", async () => {
    espiarFetch();
    await editarItem(nuevaCola(), "i1", 3, { nombre: "Nuevo", estado: "ACTIVO" });
    expect(validar("EditarItem", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).expectedVersion).toBe(3);
  });

  it("cuerpo ENCOLADO cumple EditarItem", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await editarItem(cola, "i1", 1, { descripcion: "x" });
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.editar-item");
    expect(validar("EditarItem", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · movimiento", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple Mover", async () => {
    espiarFetch();
    await mover(nuevaCola(), { itemId: "i1", bodegaId: "b1", ubicacionId: "u1", tipo: "entrada", cantidad: 5, referencia: "GR-1" });
    expect(validar("Mover", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO cumple Mover", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await mover(cola, { itemId: "i1", bodegaId: "b1", ubicacionId: "u1", tipo: "salida", cantidad: 2 });
    expect(validar("Mover", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · reservas", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple Reservar (demanda:{tipo,id})", async () => {
    espiarFetch();
    await reservar(nuevaCola(), { itemId: "i1", bodegaId: "b1", ubicacionId: "u1", cantidad: 3, demanda: { tipo: "orden", id: "o9" } });
    expect(validar("Reservar", ultimoBody)).toEqual([]);
  });

  it("liberar reserva: cuerpo online cumple LiberarReserva", async () => {
    espiarFetch();
    await liberarReserva(nuevaCola(), "r1", 2, "consumo");
    expect(validar("LiberarReserva", ultimoBody)).toEqual([]);
  });

  it("liberar reserva ENCOLADA cumple el contrato", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await liberarReserva(cola, "r1", 1);
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.liberar-reserva");
    expect(validar("LiberarReserva", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · transferencias (gobernadas por Workflow)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple Transferir (origen/destino/lineas)", async () => {
    espiarFetch();
    await transferir(nuevaCola(), {
      origen: { bodegaId: "b1", ubicacionId: "u1" },
      destino: { bodegaId: "b2", ubicacionId: "u2" },
      lineas: [{ itemId: "i1", cantidad: 4 }],
    });
    expect(validar("Transferir", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO cumple Transferir y acuña id", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transferir(cola, {
      origen: { bodegaId: "b1", ubicacionId: "u1" },
      destino: { bodegaId: "b2", ubicacionId: "u2" },
      lineas: [{ itemId: "i1", cantidad: 1, loteCodigo: "L1" }],
    });
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.transferir");
    expect(opInput(cola)).toHaveProperty("id");
    expect(validar("Transferir", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });

  it("cada acción de transición cumple TransicionarTransferencia con SU acción real", async () => {
    for (const accion of ["recibir", "completar", "cancelar", "rechazar"] as const) {
      espiarFetch();
      await transicionarTransferencia(nuevaCola(), "t1", accion, 2, accion === "cancelar" || accion === "rechazar" ? "motivo x" : undefined);
      expect(validar("TransicionarTransferencia", ultimoBody), `acción ${accion}`).toEqual([]);
      expect((ultimoBody as Record<string, unknown>).accion, `envía su acción real ${accion}`).toBe(accion);
    }
  });

  it("transición ENCOLADA (offline) cumple TransicionarTransferencia", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarTransferencia(cola, "t1", "rechazar", 4, "sin stock");
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.transicionar-transferencia");
    expect(validar("TransicionarTransferencia", opInput(cola))).toEqual([]);
    expect((opInput(cola) as Record<string, unknown>).accion).toBe("rechazar");
    vi.restoreAllMocks();
  });

  it("rechaza una acción fuera del enum del contrato", async () => {
    espiarFetch();
    // @ts-expect-error acción inválida a propósito
    await transicionarTransferencia(nuevaCola(), "t1", "despachar", 2);
    expect(validar("TransicionarTransferencia", ultimoBody).length).toBeGreaterThan(0);
  });

  it("rechaza una línea con cantidad 0 (exclusiveMinimum del contrato)", async () => {
    espiarFetch();
    await transferir(nuevaCola(), {
      origen: { bodegaId: "b1", ubicacionId: "u1" },
      destino: { bodegaId: "b2", ubicacionId: "u2" },
      lineas: [{ itemId: "i1", cantidad: 0 }],
    });
    expect(validar("Transferir", ultimoBody).length).toBeGreaterThan(0);
  });
});

describe("contrato · ajustes (Workflow, decisión explícita)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple Ajustar (tipo+motivo)", async () => {
    espiarFetch();
    await ajustar(nuevaCola(), { itemId: "i1", bodegaId: "b1", ubicacionId: "u1", tipo: "negativo", cantidad: 2, motivo: "merma" });
    expect(validar("Ajustar", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO cumple Ajustar", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await ajustar(cola, { itemId: "i1", bodegaId: "b1", ubicacionId: "u1", tipo: "positivo", cantidad: 10, motivo: "correccion" });
    expect(validar("Ajustar", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · conteos", () => {
  beforeEach(() => localStorage.clear());

  it("iniciar cumple IniciarConteo (tipo + lineas:[{inventarioId}] + alcance)", async () => {
    espiarFetch();
    await iniciarConteo(nuevaCola(), { tipo: "ciclico", lineas: [{ inventarioId: "e1" }, { inventarioId: "e2" }], alcance: { tipo: "bodega", id: "b1" } });
    expect(validar("IniciarConteo", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).lineas).toHaveLength(2);
  });

  it("rechaza iniciar sin lineas (requeridas por el contrato)", async () => {
    espiarFetch();
    await iniciarConteo(nuevaCola(), { tipo: "fisico", lineas: [] });
    const sinLineas = { ...(ultimoBody as Record<string, unknown>) };
    delete sinLineas.lineas;
    expect(validar("IniciarConteo", sinLineas).length).toBeGreaterThan(0);
  });

  it("registrar cumple RegistrarConteo (contados:[{inventarioId,cantidad}])", async () => {
    espiarFetch();
    await registrarConteo(nuevaCola(), "c1", 2, [{ inventarioId: "e1", cantidad: 7 }]);
    expect(validar("RegistrarConteo", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).contados).toBeTruthy();
  });

  it("cerrar SIN aplicar diferencias cumple CerrarConteo (aplicarDiferencias:false, no muta stock)", async () => {
    espiarFetch();
    await cerrarConteo(nuevaCola(), "c1", 3, false);
    expect(validar("CerrarConteo", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).aplicarDiferencias).toBe(false);
    expect((ultimoBody as Record<string, unknown>).aprobado).toBeUndefined();
  });

  it("cerrar Y aplicar diferencias cumple CerrarConteo (aplicarDiferencias:true)", async () => {
    espiarFetch();
    await cerrarConteo(nuevaCola(), "c1", 3, true);
    expect(validar("CerrarConteo", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).aplicarDiferencias).toBe(true);
  });

  it("registrar ENCOLADO cumple RegistrarConteo", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await registrarConteo(cola, "c1", 1, [{ inventarioId: "e1", cantidad: 1 }]);
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.registrar-conteo");
    expect(validar("RegistrarConteo", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });

  it("cerrar ENCOLADO conserva aplicarDiferencias explícito", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await cerrarConteo(cola, "c1", 2, true);
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.cerrar-conteo");
    expect(validar("CerrarConteo", opInput(cola))).toEqual([]);
    expect((opInput(cola) as Record<string, unknown>).aplicarDiferencias).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("contrato · lotes y series", () => {
  beforeEach(() => localStorage.clear());

  it("crear lote cumple CrearLote", async () => {
    espiarFetch();
    await crearLote(nuevaCola(), { itemId: "i1", codigo: "L-2025", vencimiento: "2025-12-31" });
    expect(validar("CrearLote", ultimoBody)).toEqual([]);
  });

  it("registrar serie cumple RegistrarSerie", async () => {
    espiarFetch();
    await registrarSerie(nuevaCola(), { itemId: "i1", numero: "SN-1" });
    expect(validar("RegistrarSerie", ultimoBody)).toEqual([]);
  });
});

describe("contrato · bodegas y ubicaciones", () => {
  beforeEach(() => localStorage.clear());

  it("crear bodega cumple CrearBodega", async () => {
    espiarFetch();
    await crearBodega(nuevaCola(), { codigo: "B1", nombre: "Central", tipo: "central" });
    expect(validar("CrearBodega", ultimoBody)).toEqual([]);
  });

  it("crear ubicación cumple CrearUbicacion", async () => {
    espiarFetch();
    await crearUbicacion(nuevaCola(), { bodegaId: "b1", nivel: "pasillo", valor: "A" });
    expect(validar("CrearUbicacion", ultimoBody)).toEqual([]);
  });

  it("crear ubicación ENCOLADA cumple CrearUbicacion", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await crearUbicacion(cola, { bodegaId: "b1", nivel: "estante", valor: "3", padreId: "up" });
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.inventario.crear-ubicacion");
    expect(validar("CrearUbicacion", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });
});
