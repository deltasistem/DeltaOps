/**
 * DGP-021.1 · Fundación del Módulo de Costos — Contrato OpenAPI 3 (contract-first)
 * VERIFICABLE. Generador DETERMINISTA y AUTOSUFICIENTE (sin imports del
 * workspace) para poder ejecutarse con `node --experimental-strip-types`.
 *
 * Cubre TODAS las superficies HTTP del módulo bajo `/api/deltaops/costos`:
 * materialización de hechos económicos OTROS (costo manual autorizado), anulación
 * auditable y consultas (detalle / hechos / por-moneda). El DINERO viaja como
 * CADENA decimal exacta (punto fijo, numeric(18,6)) — nunca number JS.
 *
 * DGP-021.2 (R2) · ANTI-BYPASS (§20): el comando `hecho.materializar-material` NO
 * se publica como ruta HTTP. La ÚNICA vía de MATERIAL es la ORQUESTACIÓN interna
 * del api-server tras un movimiento físico confirmado (toda la procedencia se
 * DERIVA del snapshot del movimiento, nunca de un body). La recuperación es
 * `POST /pendientes/reprocesar`. Por eso el esquema `MaterializarMaterial` queda
 * documentado como CONTRATO INTERNO de la orquestación (no como requestBody de
 * ninguna operación HTTP). Ver DGP-021.2-auditoria-inventario.md §D5.
 *
 * Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.
 *
 * El test `openapi.test.ts` valida que el JSON comprometido está SINCRONIZADO
 * (regenerar == comprometido) y que enumera cada comando/consulta HTTP-expuesto
 * (el comando interno `hecho.materializar-material` se excluye explícitamente).
 */

const BASE = "/api/deltaops/costos";

type Schema = Record<string, unknown>;

const ref = (n: string): Schema => ({ $ref: `#/components/schemas/${n}` });
const str = (extra: Schema = {}): Schema => ({ type: "string", ...extra });
const int = (extra: Schema = {}): Schema => ({ type: "integer", ...extra });
const bool = (): Schema => ({ type: "boolean" });
const objAny = (): Schema => ({ type: "object", additionalProperties: true });
const obj = (props: Record<string, Schema>, required: string[] = []): Schema => ({
  type: "object",
  properties: props,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const arr = (items: Schema): Schema => ({ type: "array", items });

function errores(...codigos: Array<"400" | "401" | "403" | "404" | "409" | "500">): Record<string, Schema> {
  const mapa: Record<string, string> = {
    "400": "Validación fallida (KRN-VAL)",
    "401": "No autenticado (sesión ausente)",
    "403": "No autorizado (KRN-AUTH)",
    "404": "No encontrado (KRN-NF)",
    "409": "Conflicto de concurrencia/duplicado (KRN-CFL)",
    "500": "Error de infraestructura (KRN-INF)",
  };
  const out: Record<string, Schema> = {};
  for (const c of codigos) out[c] = { description: mapa[c], content: { "application/json": { schema: ref("Error") } } };
  return out;
}

const jsonBody = (schema: Schema): Schema => ({ required: true, content: { "application/json": { schema } } });
const jsonOk = (schema: Schema, description = "OK"): Schema => ({ description, content: { "application/json": { schema } } });
const queryParam = (name: string, description: string): Schema => ({ name, in: "query", required: false, schema: str(), description });
const pathParam = (name: string, description: string): Schema => ({ name, in: "path", required: true, schema: str(), description });

export function construirOpenApi(): Record<string, unknown> {
  // DGP-021.1 · el DINERO/cantidad viaja como CADENA decimal exacta (PUNTO FIJO)
  // — nunca como number JS, para no perder precisión en JSON.
  const dineroReq = str({
    pattern: "^\\d{1,12}(\\.\\d{1,6})?$",
    description: "Monto/cantidad en PUNTO FIJO como CADENA decimal (string-only; \\d{1,12}(\\.\\d{1,6})?). Un número JSON es rechazado.",
  });
  const dineroCanon = str({
    pattern: "^\\d{1,12}\\.\\d{6}$",
    description: "Monto en PUNTO FIJO canónico numeric(18,6) como cadena (6 decimales).",
  });
  // DGP-021.1 · idempotencia INVARIANTE (§16): opId OBLIGATORIO y ACOTADO en toda
  // mutación. El servidor NUNCA genera opId de fallback (haría duplicados por
  // reintento). 8..200 caracteres imprimibles ASCII sin espacios.
  const opIdReq = str({
    minLength: 8,
    maxLength: 200,
    pattern: "^[\\x21-\\x7e]+$",
    description: "Clave de idempotencia OBLIGATORIA (invariante): 8..200 caracteres imprimibles ASCII sin espacios. Un reintento con el mismo opId devuelve el mismo resultado sin duplicar.",
  });

  const schemas: Record<string, Schema> = {
    Error: obj({ error: str(), code: str({ example: "KRN-VAL-001" }) }, ["error", "code"]),
    ResultadoComando: obj({ ok: bool(), idempotente: bool() }),

    // ---- Materialización ----
    MaterializarMaterial: obj(
      {
        opId: opIdReq,
        costoId: str({ format: "uuid" }),
        otId: str({ description: "OT verificada por contrato público; el activo se DERIVA de la relación canónica" }),
        articuloId: str({ description: "Artículo cuyo costo EXACTO se snapshotea (DGP-021.0)" }),
        movimientoId: str({ description: "DGP-021.2 ANTI-BYPASS (§20): movimiento de inventario de ORIGEN (OBLIGATORIO). MATERIAL sólo se materializa desde un movimiento físico confirmado; la orquestación de servicio deriva el opId determinista inv:<movimientoId>. NO existe MATERIAL manual." }),
        familia: str({ description: "DGP-021.2 (R1): FAMILIA contable del movimiento (auditoría). Deriva la NATURALEZA del hecho: 'devolucion' ⇒ ABONO (crédito compensatorio); consumo/salida ⇒ CARGO. Se registra cruda en fuente.familia. Omitida ⇒ CARGO." }),
        cantidad: dineroReq,
        unidad: str(),
        moneda: str({ description: "Moneda del hecho; debe existir costo exacto en esa moneda (SIN COSTO ≠ 0)" }),
        ocurridoAt: str({ format: "date-time" }),
      },
      ["opId", "otId", "articuloId", "movimientoId", "cantidad", "unidad", "moneda"],
    ),
    MaterializarOtros: obj(
      {
        opId: opIdReq,
        costoId: str({ format: "uuid" }),
        otId: str(),
        concepto: str({ description: "Concepto auditable del costo manual (origen no es texto libre suelto)" }),
        cantidad: dineroReq,
        unidad: str(),
        costoUnitario: dineroReq,
        moneda: str(),
        ocurridoAt: str({ format: "date-time" }),
      },
      ["opId", "otId", "concepto", "cantidad", "unidad", "costoUnitario", "moneda"],
    ),
    AnularHecho: obj(
      { opId: opIdReq, motivo: str({ description: "Motivo auditable de la anulación" }) },
      ["opId", "motivo"],
    ),

    // ---- Hecho económico (identidad + snapshot inmutable + auditoría) ----
    Hecho: obj(
      {
        costoId: str(),
        tipo: str({ enum: ["MATERIAL", "COMBUSTIBLE", "MANO_DE_OBRA", "OTROS"] }),
        naturaleza: str({ enum: ["CARGO", "ABONO"], description: "DGP-021.2 (R1) · signo SEMÁNTICO del ledger: CARGO = costo (consumo), ABONO = crédito compensatorio (devolución). Importes SIEMPRE no negativos; el signo lo lleva este campo, nunca un monto negativo." }),
        originType: str(), originId: str(),
        otId: str(), activoId: str({ nullable: true, description: "Derivado de la OT; null si la OT no tiene activo principal" }),
        identityId: str({ nullable: true }),
        movimientoId: str({ nullable: true, description: "DGP-021.2 · movimiento de inventario de origen (null si el hecho no proviene de un movimiento, p.ej. OTROS)" }),
        articuloId: str({ nullable: true, description: "DGP-021.2 · artículo/ítem del hecho (null si no aplica)" }),
        opId: str(),
        estado: str({ enum: ["ACTIVO", "ANULADO"] }),
        cantidad: dineroCanon, unidad: str(),
        costoUnitario: dineroCanon, costoTotal: dineroCanon, moneda: str(),
        fuente: objAny(),
        ocurridoAt: str({ format: "date-time" }),
        registradoAt: str({ format: "date-time" }), registradoPor: str(),
        anuladoAt: str({ format: "date-time", nullable: true }),
        anuladoPor: str({ nullable: true }),
        motivoAnulacion: str({ nullable: true }),
      },
      ["costoId", "tipo", "naturaleza", "otId", "estado", "cantidad", "costoUnitario", "costoTotal", "moneda"],
    ),
    SerieMoneda: obj({ moneda: str(), hechos: arr(ref("Hecho")) }, ["moneda", "hechos"]),
  };

  const paths: Record<string, Record<string, unknown>> = {};
  const add = (path: string, method: string, op: Record<string, unknown>): void => {
    paths[path] ??= {};
    paths[path][method] = op;
  };

  // ---- Materialización ----
  // DGP-021.2 (R2) · ANTI-BYPASS: NO se expone `POST /hechos/material`. MATERIAL
  // sólo se materializa por la ORQUESTACIÓN interna (movimiento físico confirmado);
  // la recuperación administrativa es `POST /pendientes/reprocesar`. El esquema
  // `MaterializarMaterial` se conserva como CONTRATO INTERNO de la orquestación.
  add(`${BASE}/hechos/otros`, "post", {
    tags: ["Materialización"], operationId: "costos.hecho.materializar-otros",
    summary: "Materializa un hecho económico OTROS (costo manual autorizado)",
    description:
      "El importe unitario lo aporta el autorizante (string-safe). La identidad canónica del autorizante se toma de la SESIÓN (nunca del frontend). Verifica la OT y deriva el activo. Idempotente por opId.",
    requestBody: jsonBody(ref("MaterializarOtros")),
    responses: { "200": jsonOk(ref("Hecho")), ...errores("400", "401", "403", "404", "409") },
  });
  add(`${BASE}/hechos/{costoId}/anular`, "post", {
    tags: ["Materialización"], operationId: "costos.hecho.anular",
    summary: "Anula un hecho económico (append-only, auditable; snapshot intacto)",
    description:
      "Ruta anidada tenant-scoped: un costoId de otro tenant devuelve 404 (aislamiento/IDOR). No borra ni edita el snapshot; sólo cambia el estado a ANULADO con motivo/autor/fecha.",
    parameters: [pathParam("costoId", "Identificador del hecho a anular")],
    requestBody: jsonBody(ref("AnularHecho")),
    responses: { "200": jsonOk(ref("Hecho")), ...errores("400", "401", "403", "404", "409") },
  });

  // ---- Consultas (CQRS: read models tenant-scoped) ----
  add(`${BASE}/hechos/{costoId}`, "get", {
    tags: ["Consulta"], operationId: "costos.hecho.detalle",
    summary: "Detalle de un hecho económico (por read model tenant-scoped)",
    description: "Ruta anidada: un costoId de otro tenant devuelve 404 (aislamiento/IDOR).",
    parameters: [pathParam("costoId", "Identificador del hecho")],
    responses: { "200": jsonOk(obj({ hecho: ref("Hecho") }, ["hecho"])), ...errores("401", "403", "404") },
  });
  add(`${BASE}/hechos`, "get", {
    tags: ["Consulta"], operationId: "costos.hechos",
    summary: "Listar hechos económicos (por OT/activo/movimiento/artículo/tipo/moneda/período/estado)",
    parameters: [
      queryParam("otId", "Filtro por OT"), queryParam("activoId", "Filtro por activo"),
      queryParam("movimientoId", "DGP-021.2 · Filtro por movimiento de inventario (trazabilidad de origen)"),
      queryParam("articuloId", "DGP-021.2 · Filtro por artículo/ítem"),
      queryParam("tipo", "MATERIAL | COMBUSTIBLE | MANO_DE_OBRA | OTROS"),
      queryParam("naturaleza", "DGP-021.2 (R1) · CARGO (costo) | ABONO (crédito/devolución)"),
      queryParam("moneda", "Filtro por moneda (serie por moneda; nunca se suman)"),
      queryParam("estado", "ACTIVO | ANULADO"),
      queryParam("desde", "ocurridoAt >= (ISO)"), queryParam("hasta", "ocurridoAt < (ISO)"),
    ],
    responses: { "200": jsonOk(obj({ hechos: arr(ref("Hecho")) }, ["hechos"])), ...errores("401", "403") },
  });
  add(`${BASE}/hechos/por-moneda`, "get", {
    tags: ["Consulta"], operationId: "costos.hechos.por-moneda",
    summary: "Hechos AGRUPADOS por moneda como SERIES SEPARADAS (nunca suma COP+USD)",
    parameters: [queryParam("otId", "Filtro por OT"), queryParam("activoId", "Filtro por activo"), queryParam("estado", "ACTIVO | ANULADO")],
    responses: { "200": jsonOk(obj({ monedas: arr(ref("SerieMoneda")) }, ["monedas"])), ...errores("401", "403") },
  });

  return {
    openapi: "3.0.3",
    info: {
      title: "DeltaOps · Fundación del Módulo de Costos (DGP-021.1)",
      version: "1.0.0",
      description:
        "Contrato OpenAPI generado (contract-first) desde los esquemas del módulo. " +
        "Materializa HECHOS ECONÓMICOS exactos con snapshot inmutable (ACTIVO/ANULADO); " +
        "no calcula agregados/KPIs ni duplica fuentes de verdad. El costo exacto de materiales " +
        "proviene del contrato público de Abastecimiento (DGP-021.0). Dinero string-safe. " +
        "Errores kernel→HTTP: AUTH→403, NF→404, CFL→409, VAL→400, INF→500.",
    },
    servers: [{ url: "/", description: "API DeltaOps" }],
    tags: [{ name: "Materialización" }, { name: "Consulta" }],
    paths,
    components: { schemas },
  };
}

/** Serialización canónica (2 espacios + newline final) para diffs estables. */
export function serializarOpenApi(): string {
  return `${JSON.stringify(construirOpenApi(), null, 2)}\n`;
}
