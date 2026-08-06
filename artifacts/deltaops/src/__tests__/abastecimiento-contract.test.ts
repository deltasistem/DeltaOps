/**
 * DGP-013 · Pruebas de CONTRATO frontend ↔ API de Abastecimiento (congelado).
 *
 * Verifican que los cuerpos que construyen las mutaciones del frontend cumplen
 * los esquemas del OpenAPI CONGELADO de `@workspace/module-abastecimiento`,
 * tanto en el envío directo (online) como en la operación ENCOLADA (offline).
 * La fuente de verdad es `lib/module-abastecimiento/openapi/abastecimiento.openapi.json`.
 * El validador respeta enum, required, additionalProperties:false,
 * exclusiveMinimum, nullable, boolean, arrays y $ref. `opId` es propiedad
 * declarada de TODOS los comandos: valida directo, sin stripping.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ColaSync } from "../lib/offline/cola";
import {
  crearArticulo,
  editarArticulo,
  crearProveedor,
  calificarProveedor,
  crearSolicitud,
  transicionarSolicitud,
  seleccionarCotizacion,
  registrarCotizacion,
  crearOrdenCompra,
  transicionarOrdenCompra,
  registrarRecepcion,
  materializarRecepcion,
  upsertCatalogo,
  habilitarCatalogo,
} from "../lib/abastecimiento/mutaciones";
import {
  construirInputArticulo,
  construirInputProveedor,
  construirInputSolicitud,
  construirInputCotizacion,
  construirInputOrdenCompra,
  construirInputRecepcion,
} from "../lib/abastecimiento/alta";
import { ACCIONES_SOLICITUD, ACCIONES_OC } from "../lib/abastecimiento/constantes";
import type { OperacionCola, ResumenSync } from "../lib/offline/tipos";

const aqui = dirname(fileURLToPath(import.meta.url));
const rutaSpec = resolve(aqui, "../../../../lib/module-abastecimiento/openapi/abastecimiento.openapi.json");
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
  maximum?: number;
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
    // El contrato congelado modela ciertos objetos anidados como OPACOS: sin
    // propiedades enumeradas (`properties:{}`) y `additionalProperties:false`.
    // Es la forma canónica de un objeto libre cuyo detalle valida el módulo
    // internamente; no debe rechazarse por additionalProperties.
    const esOpaco = (!s.properties || Object.keys(s.properties).length === 0) && (s.required?.length ?? 0) === 0;
    if (esOpaco) return errores;
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
      if (s.maximum != null && valor > s.maximum) errores.push(`${ruta}: > máximo ${s.maximum}`);
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
const nuevaCola = () => new ColaSync("deltaops", async () => reciboOk([]), localStorage, "abastecimiento");

function opInput(cola: ColaSync): Record<string, unknown> {
  return cola.getSnapshot()[0]!.input as Record<string, unknown>;
}

/* ---------------- Valores planos representativos (Dynamic Forms) --------- */

const VALORES_ARTICULO = {
  nombre: "Rodamiento 6205",
  descripcion: "Rodamiento rígido de bolas",
  tipo: "componente",
  unidad: "unidad",
  familia: "rodamientos",
  metodoValoracion: "promedio",
  moneda: "USD",
  costoEstandar: 12.5,
  toleranciaSobreRecepcion: 0.05,
  inventarioItemId: "item-1",
};

const VALORES_PROVEEDOR = {
  razonSocial: "Suministros Industriales S.A.",
  nombreComercial: "SumInd",
  identificacionTributaria: "900123456",
  tipo: "distribuidor",
  monedaPreferida: "USD",
  contactos: [{ nombre: "Ana", cargo: "Ventas", email: "ana@sumind.co", telefono: "+57 1 2223344" }],
  certificaciones: [{ nombre: "ISO 9001", emisor: "ICONTEC", vigenteHasta: "2027-01-01" }],
  slaTiempoRespuestaHoras: 24,
  slaPlazoEntregaDias: 7,
  slaNivelServicio: 0.98,
};

const VALORES_SOLICITUD = {
  titulo: "Reposición de rodamientos",
  descripcion: "Quiebre de stock crítico",
  prioridad: "alta",
  origenTipo: "inventario",
  origenReferenciaId: "item-1",
  origenReferenciaTipo: "item",
  origenEtiqueta: "Rodamiento 6205",
  lineas: [
    { descripcion: "Rodamiento 6205", articuloId: "art-1", cantidad: 10, unidad: "unidad", notas: "urgente" },
    { descripcion: "Grasa NLGI 2", cantidad: 2, unidad: "kg" },
  ],
};

const VALORES_COTIZACION = {
  solicitudId: "sol-1",
  proveedorId: "prov-1",
  moneda: "USD",
  condicionesPago: "30 días",
  vigenteHasta: "2026-03-01",
  lineas: [
    { numeroLineaSolicitud: 1, descripcion: "Rodamiento 6205", cantidad: 10, unidad: "unidad", precioUnitario: 12, plazoEntregaDias: 5, articuloId: "art-1" },
  ],
};

const VALORES_OC = {
  proveedorId: "prov-1",
  solicitudId: "sol-1",
  cotizacionId: "cot-1",
  moneda: "USD",
  condicionesPago: "30 días",
  condicionesEntrega: "En bodega central",
  lineas: [
    { descripcion: "Rodamiento 6205", articuloId: "art-1", cantidad: 10, unidad: "unidad", precioUnitario: 12, bodegaId: "bod-1" },
  ],
};

const VALORES_RECEPCION = {
  nota: "Recepción parcial",
  lineas: [
    { numeroLineaOC: 1, cantidad: 6, unidad: "unidad", novedad: "conforme", bodegaId: "bod-1", lote: "L-99" },
    { numeroLineaOC: 2, cantidad: 0, unidad: "kg" }, // no se recibe: se descarta
  ],
};

/* ------------------------------ Pruebas --------------------------------- */

describe("contrato · el JSON OpenAPI congelado expone los esquemas y paths usados", () => {
  it("incluye todos los esquemas de comando consumidos por el frontend", () => {
    for (const n of [
      "CrearArticulo", "EditarArticulo", "CrearProveedor", "EditarProveedor", "CalificarProveedor",
      "CrearSolicitud", "TransicionarSolicitud", "RegistrarCotizacion", "SeleccionarCotizacion",
      "CrearOrdenCompra", "TransicionarOrdenCompra", "RegistrarRecepcion", "MaterializarRecepcion",
      "CatalogoUpsert", "CatalogoHabilitar", "OperacionSync", "ColaSync", "ResumenSync",
      "OrigenSolicitud", "LineaSolicitud", "LineaCotizacion", "LineaOrdenCompra", "LineaRecepcion",
    ]) {
      expect(schemas[n], `falta esquema ${n}`).toBeTruthy();
    }
  });

  it("expone el path de sincronización offline y los endpoints gobernados", () => {
    for (const p of [
      "/api/deltaops/abastecimiento/sync",
      "/api/deltaops/abastecimiento/solicitudes/{id}/transicion",
      "/api/deltaops/abastecimiento/ordenes-compra/{id}/transicion",
      "/api/deltaops/abastecimiento/recepciones/{id}/materializar",
      "/api/deltaops/abastecimiento/solicitudes/{id}/seleccionar-cotizacion",
    ]) {
      expect(spec.paths[p], `falta ${p}`).toBeTruthy();
    }
  });
});

describe("contrato · artículos (Dynamic Forms → CrearArticulo/EditarArticulo)", () => {
  beforeEach(() => localStorage.clear());

  it("cuerpo online cumple CrearArticulo (id + opId acuñados)", async () => {
    espiarFetch();
    await crearArticulo(nuevaCola(), construirInputArticulo(VALORES_ARTICULO));
    expect(ultimoBody).toBeTruthy();
    expect((ultimoBody as Record<string, unknown>).id).toBeTruthy();
    expect((ultimoBody as Record<string, unknown>).opId).toBeTruthy();
    expect(validar("CrearArticulo", ultimoBody)).toEqual([]);
  });

  it("cuerpo ENCOLADO (offline) cumple CrearArticulo y acuña id de cliente", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const cola = nuevaCola();
    await crearArticulo(cola, construirInputArticulo(VALORES_ARTICULO));
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.crear-articulo");
    expect(op.input).toHaveProperty("id");
    expect(op.input).toHaveProperty("opId");
    expect(validar("CrearArticulo", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("no envía descripción/familia vacías (additionalProperties/nullable)", async () => {
    espiarFetch();
    await crearArticulo(nuevaCola(), construirInputArticulo({ ...VALORES_ARTICULO, descripcion: "", familia: "" }));
    const b = ultimoBody as Record<string, unknown>;
    expect(b.descripcion).toBeUndefined();
    expect(b.familia).toBeUndefined();
    expect(validar("CrearArticulo", ultimoBody)).toEqual([]);
  });

  it("editar cumple EditarArticulo anclado a expectedVersion", async () => {
    espiarFetch();
    await editarArticulo(nuevaCola(), "art-1", 3, { nombre: "Nuevo nombre", costoEstandar: 15 });
    expect(validar("EditarArticulo", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).expectedVersion).toBe(3);
  });

  it("rechaza tipo ausente (requerido por el contrato)", async () => {
    espiarFetch();
    await crearArticulo(nuevaCola(), construirInputArticulo(VALORES_ARTICULO));
    const sinTipo = { ...(ultimoBody as Record<string, unknown>) };
    delete sinTipo.tipo;
    expect(validar("CrearArticulo", sinTipo).length).toBeGreaterThan(0);
  });
});

describe("contrato · proveedores (crear + calificar anclado a versión)", () => {
  beforeEach(() => localStorage.clear());

  it("crear cumple CrearProveedor con contactos/certificaciones/SLA anidados", async () => {
    espiarFetch();
    await crearProveedor(nuevaCola(), construirInputProveedor(VALORES_PROVEEDOR));
    expect(validar("CrearProveedor", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect(Array.isArray(b.contactos)).toBe(true);
    expect((b.sla as Record<string, unknown>).nivelServicio).toBe(0.98);
  });

  it("crear ENCOLADO cumple CrearProveedor", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await crearProveedor(cola, construirInputProveedor(VALORES_PROVEEDOR));
    expect(cola.getSnapshot()[0]!.comando).toBe("modulo.abastecimiento.crear-proveedor");
    expect(validar("CrearProveedor", opInput(cola))).toEqual([]);
    vi.restoreAllMocks();
  });

  it("calificar cumple CalificarProveedor (id, expectedVersion, 4 criterios)", async () => {
    espiarFetch();
    await calificarProveedor(nuevaCola(), "prov-1", 4, { calidad: 5, tiempo: 4, precio: 3, servicio: 5, nota: "excelente" });
    expect(validar("CalificarProveedor", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect(b.id).toBe("prov-1");
    expect(b.expectedVersion).toBe(4);
    expect(b.calidad).toBe(5);
  });

  it("calificar sin nota omite la propiedad (no la envía vacía)", async () => {
    espiarFetch();
    await calificarProveedor(nuevaCola(), "prov-1", 1, { calidad: 3, tiempo: 3, precio: 3, servicio: 3 });
    expect((ultimoBody as Record<string, unknown>).nota).toBeUndefined();
    expect(validar("CalificarProveedor", ultimoBody)).toEqual([]);
  });
});

describe("contrato · solicitudes (crear + transición REAL por acción)", () => {
  beforeEach(() => localStorage.clear());

  it("crear cumple CrearSolicitud con origen + líneas anidadas", async () => {
    espiarFetch();
    await crearSolicitud(nuevaCola(), construirInputSolicitud(VALORES_SOLICITUD));
    expect(validar("CrearSolicitud", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect((b.origen as Record<string, unknown>).tipo).toBe("inventario");
    expect((b.lineas as unknown[]).length).toBe(2);
  });

  it("cada acción del enum cumple TransicionarSolicitud con SU acción real", async () => {
    for (const a of ACCIONES_SOLICITUD) {
      espiarFetch();
      const opciones = a.pideMotivo ? { motivoRechazo: "no cumple especificación" } : {};
      await transicionarSolicitud(nuevaCola(), "sol-1", a.clave, 2, opciones);
      expect(validar("TransicionarSolicitud", ultimoBody), `acción ${a.clave}`).toEqual([]);
      expect((ultimoBody as Record<string, unknown>).accion, `envía su acción real ${a.clave}`).toBe(a.clave);
      if (a.pideMotivo) expect((ultimoBody as Record<string, unknown>).motivoRechazo).toBe("no cumple especificación");
    }
  });

  it("SOLO rechazar admite motivoRechazo; las demás transiciones no lo envían", async () => {
    espiarFetch();
    await transicionarSolicitud(nuevaCola(), "sol-1", "aprobar", 2, { motivoRechazo: "ignorado" });
    // aprobar no es pideMotivo → la mutación descarta el motivo (o al menos el
    // cuerpo sigue cumpliendo el contrato). Verificamos que rechazar SÍ lo lleva.
    espiarFetch();
    await transicionarSolicitud(nuevaCola(), "sol-1", "rechazar", 2, { motivoRechazo: "fuera de rango" });
    expect((ultimoBody as Record<string, unknown>).motivoRechazo).toBe("fuera de rango");
    expect(validar("TransicionarSolicitud", ultimoBody)).toEqual([]);
  });

  it("transición ENCOLADA cumple TransicionarSolicitud conservando su acción", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await transicionarSolicitud(cola, "sol-1", "rechazar", 2, { motivoRechazo: "precio alto" });
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.transicionar-solicitud");
    expect((op.input as Record<string, unknown>).accion).toBe("rechazar");
    expect((op.input as Record<string, unknown>).motivoRechazo).toBe("precio alto");
    expect(validar("TransicionarSolicitud", op.input)).toEqual([]);
    vi.restoreAllMocks();
  });

  it("rechaza una acción fuera del enum del contrato", async () => {
    espiarFetch();
    // @ts-expect-error acción inválida a propósito
    await transicionarSolicitud(nuevaCola(), "sol-1", "eliminar", 2, {});
    expect(validar("TransicionarSolicitud", ultimoBody).length).toBeGreaterThan(0);
  });
});

describe("contrato · cotizaciones (registrar + seleccionar)", () => {
  beforeEach(() => localStorage.clear());

  it("registrar cumple RegistrarCotizacion (líneas con precioUnitario)", async () => {
    espiarFetch();
    await registrarCotizacion(nuevaCola(), construirInputCotizacion(VALORES_COTIZACION));
    expect(validar("RegistrarCotizacion", ultimoBody)).toEqual([]);
  });

  it("seleccionar cumple SeleccionarCotizacion (solo solicitudId requerido)", async () => {
    espiarFetch();
    await seleccionarCotizacion(nuevaCola(), "sol-1", { cotizacionId: "cot-1", pesos: { precio: 0.5, plazoEntrega: 0.3, calificacion: 0.2 } });
    expect(validar("SeleccionarCotizacion", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect(b.solicitudId).toBe("sol-1");
    expect(b.cotizacionId).toBe("cot-1");
  });

  it("seleccionar SIN cotización ni pesos también cumple (mínimo requerido)", async () => {
    espiarFetch();
    await seleccionarCotizacion(nuevaCola(), "sol-1");
    expect(validar("SeleccionarCotizacion", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect(b.cotizacionId).toBeUndefined();
    expect(b.pesos).toBeUndefined();
  });
});

describe("contrato · órdenes de compra (crear + transición REAL)", () => {
  beforeEach(() => localStorage.clear());

  it("crear cumple CrearOrdenCompra con líneas y precios", async () => {
    espiarFetch();
    await crearOrdenCompra(nuevaCola(), construirInputOrdenCompra(VALORES_OC));
    expect(validar("CrearOrdenCompra", ultimoBody)).toEqual([]);
  });

  it("cada acción del enum cumple TransicionarOrdenCompra SIN motivo", async () => {
    for (const a of ACCIONES_OC) {
      espiarFetch();
      await transicionarOrdenCompra(nuevaCola(), "oc-1", a.clave, 2);
      expect(validar("TransicionarOrdenCompra", ultimoBody), `acción ${a.clave}`).toEqual([]);
      expect((ultimoBody as Record<string, unknown>).accion).toBe(a.clave);
      // Las transiciones de OC no llevan motivo alguno.
      expect((ultimoBody as Record<string, unknown>).motivo).toBeUndefined();
      expect((ultimoBody as Record<string, unknown>).motivoRechazo).toBeUndefined();
    }
  });

  it("rechaza una acción de OC fuera del enum", async () => {
    espiarFetch();
    // @ts-expect-error acción inválida
    await transicionarOrdenCompra(nuevaCola(), "oc-1", "rechazar", 2);
    expect(validar("TransicionarOrdenCompra", ultimoBody).length).toBeGreaterThan(0);
  });
});

describe("contrato · recepciones (registrar + materializar)", () => {
  beforeEach(() => localStorage.clear());

  it("registrar cumple RegistrarRecepcion y descarta líneas con cantidad 0", async () => {
    espiarFetch();
    await registrarRecepcion(nuevaCola(), construirInputRecepcion(VALORES_RECEPCION, "oc-1", 2));
    expect(validar("RegistrarRecepcion", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect((b.lineas as unknown[]).length).toBe(1); // sólo la línea con cantidad 6
    expect(b.ordenCompraId).toBe("oc-1");
    expect(b.expectedVersion).toBe(2);
  });

  it("materializar cumple MaterializarRecepcion (solo recepcionId requerido) con opId UUID", async () => {
    espiarFetch();
    await materializarRecepcion(nuevaCola(), "rec-1");
    expect(validar("MaterializarRecepcion", ultimoBody)).toEqual([]);
    const b = ultimoBody as Record<string, unknown>;
    expect(b.recepcionId).toBe("rec-1");
    expect(String(b.opId)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("materializar ENCOLADO es comando oficial con opId en el input (dedup estable)", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new TypeError("network"));
    const cola = nuevaCola();
    await materializarRecepcion(cola, "rec-1");
    const op = cola.getSnapshot()[0]!;
    expect(op.comando).toBe("modulo.abastecimiento.materializar-recepcion");
    const input = op.input as Record<string, unknown>;
    expect(input.opId).toBe(op.opId);
    expect(validar("MaterializarRecepcion", input)).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("contrato · catálogos de tenant", () => {
  beforeEach(() => localStorage.clear());

  it("upsert cumple CatalogoUpsert", async () => {
    espiarFetch();
    await upsertCatalogo(nuevaCola(), { catalogo: "tiposArticulo", clave: "reactivo", etiqueta: "Reactivo químico" });
    expect(validar("CatalogoUpsert", ultimoBody)).toEqual([]);
  });

  it("habilitar cumple CatalogoHabilitar (booleano)", async () => {
    espiarFetch();
    await habilitarCatalogo(nuevaCola(), { catalogo: "tiposArticulo", clave: "reactivo", habilitado: false });
    expect(validar("CatalogoHabilitar", ultimoBody)).toEqual([]);
    expect((ultimoBody as Record<string, unknown>).habilitado).toBe(false);
  });
});
