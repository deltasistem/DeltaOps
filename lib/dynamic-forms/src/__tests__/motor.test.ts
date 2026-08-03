/**
 * DGP-007 · Dynamic Forms Engine — Pruebas con adaptadores Fake (offline).
 *
 * Cubre: derivación Zod de todos los tipos de campo, motor de condiciones
 * (visible/oculto/obligatorio/soloLectura/calculado/validación), validaciones
 * (todas las clases + severidades + asincrónica vía query), layout por
 * breakpoint, plantillas (versionado/export/import/rechazo de vocabulario),
 * respuestas (borrador/enviar/conflicto de versión/opId), evidencias selladas y
 * checklist con puntajes. Ejemplos NEUTROS ("revisión genérica").
 */
import { describe, expect, it } from "vitest";
import {
  createExecutionContext,
  MemoryLogger,
  type ExecutionContext,
  type Principal,
} from "@workspace/kernel";
import { officialServices } from "@workspace/platform";
import {
  calcularPuntaje,
  camposHoja,
  crearFormulariosRuntime,
  crearMotorFormularios,
  construirExportacion,
  detectarVocabularioProhibido,
  esNeutro,
  esquemaDatosFormulario,
  evaluarCalculo,
  evaluarCondicion,
  evaluarReglasFormulario,
  itemsPendientes,
  layoutPorDefecto,
  puntajeMaximo,
  resolverLayout,
  sellarEvidencia,
  validarChecklist,
  validarCompleto,
  validarDefinicion,
  validarSincrono,
  ResolutorPlantillaMemoria,
  SERVICIO,
  type DefinicionChecklist,
  type DefinicionFormulario,
  type EjecutorQuery,
  type FormulariosRuntime,
  type ContratoValidacion,
} from "..";

/* ------------------------------ Utilidades -------------------------------- */

const ALL_PERMISSIONS = [
  ...new Set([
    ...officialServices().flatMap((s) => [...s.permissions]),
    ...crearMotorFormularios().permissions,
  ]),
];

const ADMIN: Principal = { id: "admin-1", rol: "admin", permisos: ALL_PERMISSIONS, capacidades: [] };
const LECTOR: Principal = { id: "u-2", rol: "lector", permisos: [`${SERVICIO}.plantilla.read`], capacidades: [] };

function ctxOf(tenantId: string, principal: Principal = ADMIN): ExecutionContext {
  return createExecutionContext({ principal, metadata: { tenantId } });
}

function runtime(motor?: Parameters<typeof crearFormulariosRuntime>[0]): FormulariosRuntime {
  return crearFormulariosRuntime({ logger: new MemoryLogger(), ...motor });
}

const exec = (rt: FormulariosRuntime, ctx: ExecutionContext, cmd: string, input: unknown) =>
  rt.platform.kernel.commands.execute(ctx, cmd, input);
const query = (rt: FormulariosRuntime, ctx: ExecutionContext, q: string, input: unknown) =>
  rt.platform.kernel.queries.execute(ctx, q, input);

/** Formulario neutro con muchos tipos de campo para derivación Zod. */
function formularioAmplio(): DefinicionFormulario {
  return {
    clave: "revision-generica",
    titulo: "Revisión genérica",
    nodos: [
      {
        clase: "contenedor",
        clave: "sec1",
        tipo: "seccion",
        etiqueta: "Datos",
        hijos: [
          { clase: "campo", clave: "texto", tipo: "texto", etiqueta: "Texto", obligatorio: true, restricciones: { longitudMax: 10 } },
          { clase: "campo", clave: "entero", tipo: "numero", etiqueta: "Entero", restricciones: { minimo: 0, maximo: 100 } },
          { clase: "campo", clave: "dec", tipo: "decimal", etiqueta: "Decimal" },
          { clase: "campo", clave: "fecha", tipo: "fecha", etiqueta: "Fecha" },
          { clase: "campo", clave: "hora", tipo: "hora", etiqueta: "Hora" },
          { clase: "campo", clave: "fh", tipo: "fechaHora", etiqueta: "Fecha-hora" },
          { clase: "campo", clave: "flag", tipo: "booleano", etiqueta: "Sí/No" },
          { clase: "campo", clave: "sel", tipo: "select", etiqueta: "Selección", opciones: [{ valor: "a", etiqueta: "A" }, { valor: "b", etiqueta: "B" }] },
          { clase: "campo", clave: "multi", tipo: "multiSelect", etiqueta: "Multi", opciones: [{ valor: "x", etiqueta: "X" }, { valor: "y", etiqueta: "Y" }] },
          { clase: "campo", clave: "auto", tipo: "autocomplete", etiqueta: "Auto", fuente: { catalogo: "catalogo-demo" } },
        ],
      },
      {
        clase: "contenedor",
        clave: "wiz",
        tipo: "wizard",
        etiqueta: "Asistente",
        pasos: [
          {
            clave: "p1",
            etiqueta: "Paso 1",
            hijos: [
              { clase: "campo", clave: "tabla", tipo: "tabla", etiqueta: "Tabla", subcampos: [{ clase: "campo", clave: "n", tipo: "numero", etiqueta: "N", obligatorio: true }] },
              { clase: "campo", clave: "adj", tipo: "adjunto", etiqueta: "Adjunto" },
              { clase: "campo", clave: "firma", tipo: "firma", etiqueta: "Firma" },
              { clase: "campo", clave: "ubic", tipo: "ubicacion", etiqueta: "Ubicación" },
              { clase: "campo", clave: "qr", tipo: "codigoQr", etiqueta: "QR" },
              { clase: "campo", clave: "barras", tipo: "codigoBarras", etiqueta: "Barras" },
              { clase: "campo", clave: "nfc", tipo: "nfc", etiqueta: "NFC" },
              { clase: "campo", clave: "img", tipo: "imagen", etiqueta: "Imagen" },
              { clase: "campo", clave: "chk", tipo: "checklist", etiqueta: "Checklist", checklistRef: "chk-demo" },
            ],
          },
        ],
      },
    ],
  };
}

/* ---------------------------- 1. Definición Zod --------------------------- */

describe("Definición y derivación Zod", () => {
  it("valida la estructura recursiva de la definición", () => {
    expect(() => validarDefinicion(formularioAmplio())).not.toThrow();
  });

  it("rechaza una estructura inválida (campo sin tipo)", () => {
    expect(() =>
      validarDefinicion({ clave: "x", titulo: "X", nodos: [{ clase: "campo", clave: "a", etiqueta: "A" }] }),
    ).toThrow();
  });

  it("aplana todos los campos hoja atravesando contenedores y wizard", () => {
    const campos = camposHoja(formularioAmplio()).map((c) => c.clave);
    expect(campos).toContain("texto");
    expect(campos).toContain("tabla");
    expect(campos).toContain("chk");
    expect(campos).toHaveLength(19);
  });

  it("deriva el esquema Zod de datos para todos los tipos", () => {
    const schema = esquemaDatosFormulario(formularioAmplio());
    const datos = {
      texto: "hola",
      entero: 5,
      dec: 3.14,
      fecha: "2020-01-01",
      hora: "10:00",
      fh: "2020-01-01T10:00:00Z",
      flag: true,
      sel: "a",
      multi: ["x", "y"],
      auto: "algo",
      tabla: [{ n: 1 }],
      adj: "att-1",
      firma: { dataUrl: "data:", firmante: "u", timestamp: "2020-01-01T00:00:00Z" },
      ubic: { lat: 1, lng: 2, precision: 5 },
      qr: "QR-1",
      barras: "B-1",
      nfc: "N-1",
      img: ["i-1"],
      chk: { total: 10 },
    };
    expect(schema.safeParse(datos).success).toBe(true);
  });

  it("respeta obligatoriedad, longitud y rangos en el esquema", () => {
    const schema = esquemaDatosFormulario(formularioAmplio());
    expect(schema.safeParse({}).success).toBe(false); // texto obligatorio
    expect(schema.safeParse({ texto: "12345678901" }).success).toBe(false); // longitud > 10
    expect(schema.safeParse({ texto: "ok", entero: 200 }).success).toBe(false); // rango
  });

  it("select/multiSelect derivan enum de sus opciones", () => {
    const schema = esquemaDatosFormulario(formularioAmplio());
    expect(schema.safeParse({ texto: "ok", sel: "z" }).success).toBe(false);
    expect(schema.safeParse({ texto: "ok", multi: ["z"] }).success).toBe(false);
  });

  it("valida formato email/patrón en campo de texto", () => {
    const def: DefinicionFormulario = {
      clave: "f", titulo: "F",
      nodos: [{ clase: "campo", clave: "correo", tipo: "texto", etiqueta: "Correo", restricciones: { formato: "email" } }],
    };
    const schema = esquemaDatosFormulario(def);
    expect(schema.safeParse({ correo: "no-es-email" }).success).toBe(false);
    expect(schema.safeParse({ correo: "a@b.com" }).success).toBe(true);
  });
});

/* ---------------------------- 2. Condiciones ------------------------------ */

describe("Conditional Engine", () => {
  const datos = { tipo: "critico", cantidad: 5, nombre: "demo" };

  it("evalúa comparaciones atómicas", () => {
    expect(evaluarCondicion({ campo: "tipo", operador: "igual", valor: "critico" }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "cantidad", operador: "mayor", valor: 3 }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "cantidad", operador: "menor", valor: 3 }, datos)).toBe(false);
    expect(evaluarCondicion({ campo: "nombre", operador: "empiezaCon", valor: "de" }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "ausente", operador: "vacio" }, datos)).toBe(true);
    expect(evaluarCondicion({ campo: "nombre", operador: "existe" }, datos)).toBe(true);
  });

  it("compone condiciones con y/o/no", () => {
    expect(
      evaluarCondicion({ y: [{ campo: "tipo", operador: "igual", valor: "critico" }, { campo: "cantidad", operador: "mayorIgual", valor: 5 }] }, datos),
    ).toBe(true);
    expect(
      evaluarCondicion({ o: [{ campo: "tipo", operador: "igual", valor: "menor" }, { campo: "cantidad", operador: "igual", valor: 5 }] }, datos),
    ).toBe(true);
    expect(evaluarCondicion({ no: { campo: "tipo", operador: "igual", valor: "critico" } }, datos)).toBe(false);
  });

  it("calcula expresiones aritméticas y de concatenación (sin eval)", () => {
    expect(evaluarCalculo({ op: "+", args: [{ ref: "cantidad" }, { literal: 10 }] }, datos)).toBe(15);
    expect(evaluarCalculo({ op: "*", args: [{ ref: "cantidad" }, { literal: 2 }] }, datos)).toBe(10);
    expect(evaluarCalculo({ concat: [{ literal: "n=" }, { ref: "nombre" }] }, datos)).toBe("n=demo");
    expect(evaluarCalculo({ redondear: { op: "/", args: [{ literal: 10 }, { literal: 3 }] }, decimales: 2 }, datos)).toBe(3.33);
  });

  it("resuelve visible/oculto/obligatorio/soloLectura/calculado por campo", () => {
    const { estados, datosEfectivos } = evaluarReglasFormulario(
      [
        { campo: "detalle", visibleCuando: { campo: "tipo", operador: "igual", valor: "critico" }, obligatorioCuando: { campo: "tipo", operador: "igual", valor: "critico" } },
        { campo: "oculto", ocultoCuando: { campo: "tipo", operador: "igual", valor: "critico" } },
        { campo: "bloqueado", soloLecturaCuando: { campo: "cantidad", operador: "mayor", valor: 0 } },
        { campo: "doble", calculadoCuando: { expresion: { op: "*", args: [{ ref: "cantidad" }, { literal: 2 }] } } },
      ],
      datos,
    );
    expect(estados.detalle?.visible).toBe(true);
    expect(estados.detalle?.obligatorio).toBe(true);
    expect(estados.oculto?.visible).toBe(false);
    expect(estados.bloqueado?.soloLectura).toBe(true);
    expect(datosEfectivos.doble).toBe(10);
  });

  it("un campo no visible nunca es obligatorio", () => {
    const { estados } = evaluarReglasFormulario(
      [{ campo: "x", visibleCuando: { campo: "tipo", operador: "igual", valor: "otro" }, obligatorioCuando: { campo: "tipo", operador: "existe" } }],
      datos,
    );
    expect(estados.x?.visible).toBe(false);
    expect(estados.x?.obligatorio).toBe(false);
  });
});

/* ---------------------------- 3. Validación ------------------------------- */

describe("Validation Runtime", () => {
  const def: DefinicionFormulario = {
    clave: "solicitud-generica",
    titulo: "Solicitud genérica",
    nodos: [
      { clase: "campo", clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true, restricciones: { longitudMin: 3 } },
      { clase: "campo", clave: "monto", tipo: "numero", etiqueta: "Monto", restricciones: { minimo: 0 } },
      { clase: "campo", clave: "nota", tipo: "texto", etiqueta: "Nota" },
    ],
  };

  it("detecta obligatoriedad, longitud y rango", () => {
    const r = validarSincrono(def, { titulo: "ab", monto: -1 });
    expect(r.valido).toBe(false);
    expect(r.hallazgos.some((h) => h.regla === "formato:texto")).toBe(true);
    expect(r.hallazgos.some((h) => h.campo === "monto")).toBe(true);
  });

  it("aplica validación cruzada declarativa", () => {
    const contrato: ContratoValidacion = {
      cruzadas: [
        { cuando: { y: [{ campo: "monto", operador: "mayor", valor: 1000 }, { campo: "nota", operador: "vacio" }] }, campo: "nota", mensaje: "Nota requerida para montos altos", regla: "nota-alta" },
      ],
    };
    const r = validarSincrono(def, { titulo: "abc", monto: 5000 }, contrato);
    expect(r.hallazgos.some((h) => h.regla === "nota-alta")).toBe(true);
  });

  it("distingue severidades: advertencia no bloquea, bloqueo impide borrador", () => {
    const contrato: ContratoValidacion = {
      cruzadas: [
        { cuando: { campo: "monto", operador: "mayor", valor: 100 }, severidad: "advertencia", mensaje: "Monto elevado", regla: "adv" },
        { cuando: { campo: "titulo", operador: "igual", valor: "PROHIBIDO" }, severidad: "bloqueo", mensaje: "Título prohibido", regla: "bloq" },
      ],
    };
    const soloAdv = validarSincrono(def, { titulo: "abc", monto: 500 }, contrato);
    expect(soloAdv.hayError).toBe(false);
    expect(soloAdv.hayBloqueo).toBe(false);
    expect(soloAdv.valido).toBe(true);

    const conBloqueo = validarSincrono(def, { titulo: "PROHIBIDO", monto: 500 }, contrato);
    expect(conBloqueo.hayBloqueo).toBe(true);
    expect(conBloqueo.valido).toBe(false);
  });

  it("ejecuta validación asincrónica vía QueryBus (unicidad)", async () => {
    const ejecutor: EjecutorQuery = {
      async execute(_ctx, _q, input) {
        const { valor } = input as { valor: unknown };
        return { ok: true, value: { valido: valor !== "duplicado", mensaje: "Ya existe" } };
      },
    };
    const contrato: ContratoValidacion = {
      asincronas: [{ nombre: "unicidad-titulo", campo: "titulo", query: "demo.unicidad", mensaje: "Duplicado" }],
    };
    const ctx = ctxOf("t1");
    const okr = await validarCompleto(def, { titulo: "unico" }, contrato, ctx, ejecutor);
    expect(okr.valido).toBe(true);
    const dup = await validarCompleto(def, { titulo: "duplicado" }, contrato, ctx, ejecutor);
    expect(dup.valido).toBe(false);
    expect(dup.hallazgos.some((h) => h.regla === "unicidad-titulo")).toBe(true);
  });
});

/* ------------------------------- 4. Layout -------------------------------- */

describe("Dynamic Layout Runtime", () => {
  const def = formularioAmplio();

  it("deriva layout por defecto con 3 breakpoints", () => {
    const l = layoutPorDefecto(def);
    expect(l.escritorio.columnas).toBe(12);
    expect(l.tableta.columnas).toBe(8);
    expect(l.movil.columnas).toBe(4);
    expect(l.escritorio.campos).toHaveLength(camposHoja(def).length);
  });

  it("campos grandes ocupan fila completa en escritorio", () => {
    const l = layoutPorDefecto(def);
    const tabla = l.escritorio.campos.find((c) => c.clave === "tabla");
    expect(tabla?.ancho).toBe(12);
  });

  it("aplica overrides por breakpoint (orden/ancho) manteniendo defaults", () => {
    const l = resolverLayout(def, { movil: { columnas: 2, campos: [{ clave: "texto", ancho: 2, orden: 0 }] } });
    expect(l.movil.columnas).toBe(2);
    const texto = l.movil.campos.find((c) => c.clave === "texto");
    expect(texto?.ancho).toBe(2);
  });
});

/* ------------------------------ 5. Checklist ------------------------------ */

describe("Checklist Runtime", () => {
  const chk: DefinicionChecklist = {
    clave: "revision-chk",
    titulo: "Revisión genérica",
    version: 1,
    items: [
      { clave: "i1", etiqueta: "Ítem 1", obligatorio: true, puntaje: 10, evidenciasRequeridas: ["fotografia"] },
      { clave: "i2", etiqueta: "Ítem 2", puntaje: 20, firmaRequerida: true },
      { clave: "i3", etiqueta: "Ítem 3", puntaje: 30 },
    ],
  };

  it("valida su estructura y calcula puntaje máximo", () => {
    expect(() => validarChecklist(chk)).not.toThrow();
    expect(puntajeMaximo(chk)).toBe(60);
  });

  it("calcula puntaje total/porcentaje excluyendo los N/A", () => {
    const r = calcularPuntaje(chk, [
      { clave: "i1", estado: true, evidencias: ["f-1"] },
      { clave: "i2", estado: false },
      { clave: "i3", estado: "na" },
    ]);
    expect(r.puntajeObtenido).toBe(10);
    expect(r.puntajeMaximo).toBe(30); // i3 (na) excluido
    expect(r.itemsConformes).toBe(1);
    expect(r.itemsNoConformes).toBe(1);
    expect(r.itemsNoAplica).toBe(1);
    expect(r.porcentaje).toBeCloseTo(33.33, 1);
  });

  it("detecta ítems pendientes por obligatoriedad, evidencia y firma", () => {
    const pend = itemsPendientes(chk, [
      { clave: "i1", estado: true },
      { clave: "i2", estado: true },
    ]);
    expect(pend.some((p) => p.clave === "i1" && p.motivo.includes("evidencia"))).toBe(true);
    expect(pend.some((p) => p.clave === "i2" && p.motivo.includes("firma"))).toBe(true);
  });
});

/* ------------------------------ 6. Evidencias ----------------------------- */

describe("Evidence Runtime", () => {
  it("sella la evidencia con usuarioId/timestamp del contexto (no del cliente)", () => {
    const ctx = ctxOf("t1");
    const r = sellarEvidencia(
      { tipo: "geolocalizacion", campo: "ubic", lat: 1, lng: 2, precision: 3, opId: "op-1" },
      ctx,
      new Date("2020-01-01T00:00:00Z"),
      "dispositivo-demo",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sello.usuarioId).toBe(ADMIN.id);
    expect(r.value.sello.timestamp).toBe("2020-01-01T00:00:00.000Z");
    expect(r.value.sello.dispositivo).toBe("dispositivo-demo");
  });

  it("rechaza una evidencia mal formada", () => {
    const ctx = ctxOf("t1");
    const r = sellarEvidencia({ tipo: "firma", campo: "f", dataUrl: "", firmante: "" } as never, ctx, new Date());
    expect(r.ok).toBe(false);
  });
});

/* ------------------------------ 7. Vocabulario ---------------------------- */

describe("Guardarraíl de vocabulario neutro", () => {
  it("detecta términos de negocio prohibidos", () => {
    expect(detectarVocabularioProhibido({ titulo: "control de activo" })).toContain("activo");
    expect(detectarVocabularioProhibido({ a: ["orden", "compra"] }).sort()).toEqual(["compra", "orden"]);
  });

  it("acepta contenido neutro", () => {
    expect(esNeutro({ titulo: "Revisión genérica", nota: "expediente demo" })).toBe(true);
  });
});

/* -------------------------- 8. Plantillas (runtime) ----------------------- */

describe("Template Runtime (comandos/consultas del Kernel)", () => {
  const contenido = () => ({
    definicion: {
      clave: "revision-generica",
      titulo: "Revisión genérica",
      nodos: [{ clase: "campo", clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true }],
    } as DefinicionFormulario,
  });

  it("crea un borrador, lo publica como versión 1 ACTIVA y la exporta", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const creada = await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, {
      id: "b-1", opId: "op-1", clave: "revision-generica", contenido: contenido(),
    });
    expect(creada.ok).toBe(true);

    const pub = await exec(rt, ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-1" });
    expect(pub.ok).toBe(true);
    if (pub.ok) {
      expect((pub.value as { version: number }).version).toBe(1);
      expect((pub.value as { estado: string }).estado).toBe("ACTIVA");
    }

    const doc = await query(rt, ctx, `${SERVICIO}.plantilla.exportar`, { clave: "revision-generica", version: 1 });
    expect(doc.ok).toBe(true);
    if (doc.ok) {
      expect((doc.value as { formatoExport: string }).formatoExport).toBe("deltaops.dynamic-forms.plantilla.v1");
    }
  });

  it("publicar N+1 incrementa versión y desactiva la anterior (una sola activa)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    // Versión 1
    await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-a", opId: "o1", clave: "k", contenido: contenido() });
    const p1 = await exec(rt, ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-a" });
    expect(p1.ok).toBe(true);
    // Versión 2
    await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-b", opId: "o2", clave: "k", contenido: contenido() });
    const p2 = await exec(rt, ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-b" });
    expect(p2.ok).toBe(true);
    if (p2.ok) expect((p2.value as { version: number }).version).toBe(2);

    // La activa es la 2; la 1 sigue existiendo pero INACTIVA.
    const activa = await query(rt, ctx, `${SERVICIO}.plantilla.obtenerActiva`, { clave: "k" });
    expect(activa.ok).toBe(true);
    if (activa.ok) expect((activa.value as { data: { version: number } }).data.version).toBe(2);

    const v1 = await query(rt, ctx, `${SERVICIO}.plantilla.obtener`, { clave: "k", version: 1 });
    expect(v1.ok).toBe(true);
    if (v1.ok) expect((v1.value as { estado: string }).estado).toBe("INACTIVA");

    // Solo UNA versión activa por clave.
    const listado = await query(rt, ctx, `${SERVICIO}.plantilla.listar`, { clave: "k", estado: "ACTIVA" });
    expect(listado.ok).toBe(true);
    if (listado.ok) expect((listado.value as unknown[]).length).toBe(1);
  });

  it("resuelve versiones históricas: publicar N+1 no rompe la validación de respuestas N", async () => {
    // Resolutor respaldado por el mismo store del runtime.
    const rt = runtime();
    const ctx = ctxOf("t1");
    // Publicar versión 1 de la plantilla.
    await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-h", opId: "oh", clave: "hist", contenido: contenido() });
    await exec(rt, ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-h" });

    // Respuesta pinneada a la versión 1 (activa en ese momento).
    const g1 = await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "rh-1", opId: "gh", plantillaClave: "hist", datos: { titulo: "demo v1" },
    });
    expect(g1.ok).toBe(true);
    if (g1.ok) expect((g1.value as { estado: string }).estado).toBe("BORRADOR");

    // Publicar versión 2 (nueva activa).
    await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-h2", opId: "oh2", clave: "hist", contenido: contenido() });
    const p2 = await exec(rt, ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-h2" });
    if (p2.ok) expect((p2.value as { version: number }).version).toBe(2);

    // La respuesta creada con la versión 1 SIGUE validando/enviándose contra la v1.
    const enviar = await exec(rt, ctx, `${SERVICIO}.respuesta.enviar`, { id: "rh-1", opId: "eh", version: 1 });
    expect(enviar.ok).toBe(true);
    if (enviar.ok) expect((enviar.value as { estado: string }).estado).toBe("ENVIADA");

    // Y su versión histórica sigue siendo resoluble.
    const compat = await query(rt, ctx, `${SERVICIO}.plantilla.compatibilidad`, { clave: "hist", version: 1 });
    if (compat.ok) expect((compat.value as { compatible: boolean }).compatible).toBe(true);
  });

  it("es idempotente al crear un borrador con el mismo id de cliente (offline)", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const a = await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-2", opId: "op", clave: "k", contenido: contenido() });
    const b = await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-2", opId: "op", clave: "k", contenido: contenido() });
    expect(a.ok && b.ok).toBe(true);
    if (b.ok) expect((b.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("rechaza crear plantilla con vocabulario de negocio prohibido", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const mala = {
      definicion: { clave: "x", titulo: "control de activo", nodos: [{ clase: "campo", clave: "a", tipo: "texto", etiqueta: "A" }] },
    };
    const r = await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-3", opId: "op", clave: "k", contenido: mala });
    expect(r.ok).toBe(false);
  });

  it("importa un documento válido y rechaza uno con vocabulario prohibido", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const doc = construirExportacion("revision-generica", 1, contenido());
    const okr = await exec(rt, ctx, `${SERVICIO}.plantilla.importar`, { documento: doc });
    expect(okr.ok).toBe(true);

    const docMalo = construirExportacion("otra-clave", 1, contenido());
    const bad = await exec(rt, ctx, `${SERVICIO}.plantilla.importar`, {
      documento: { ...docMalo, definicion: { ...docMalo.definicion, titulo: "orden de compra" } },
    });
    expect(bad.ok).toBe(false);
  });

  it("import de una versión ya existente → conflicto", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    const doc = construirExportacion("dup", 1, contenido());
    const primero = await exec(rt, ctx, `${SERVICIO}.plantilla.importar`, { documento: doc });
    expect(primero.ok).toBe(true);
    const duplicado = await exec(rt, ctx, `${SERVICIO}.plantilla.importar`, { documento: doc });
    expect(duplicado.ok).toBe(false);
  });

  it("reporta compatibilidad según exista la versión con la que se llenó la respuesta", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1");
    await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-4", opId: "op", clave: "k", contenido: contenido() });
    await exec(rt, ctx, `${SERVICIO}.plantilla.publicar`, { id: "b-4" });
    const compat = await query(rt, ctx, `${SERVICIO}.plantilla.compatibilidad`, { clave: "k", version: 1 });
    expect(compat.ok).toBe(true);
    if (compat.ok) expect((compat.value as { compatible: boolean }).compatible).toBe(true);
    const incompat = await query(rt, ctx, `${SERVICIO}.plantilla.compatibilidad`, { clave: "k", version: 9 });
    if (incompat.ok) expect((incompat.value as { compatible: boolean }).compatible).toBe(false);
  });

  it("respeta permisos: un lector no puede crear plantillas", async () => {
    const rt = runtime();
    const ctx = ctxOf("t1", LECTOR);
    const r = await exec(rt, ctx, `${SERVICIO}.plantilla.crear`, { id: "b-x", opId: "op", clave: "k", contenido: contenido() });
    expect(r.ok).toBe(false);
  });
});

/* --------------------------- 9. Respuestas (runtime) ---------------------- */

function resolutorDemo(): ResolutorPlantillaMemoria {
  const prov = new ResolutorPlantillaMemoria();
  const def: DefinicionFormulario = {
    clave: "solicitud-generica",
    titulo: "Solicitud genérica",
    nodos: [
      { clase: "campo", clave: "titulo", tipo: "texto", etiqueta: "Título", obligatorio: true },
      { clase: "campo", clave: "monto", tipo: "numero", etiqueta: "Monto" },
    ],
  };
  const contrato: ContratoValidacion = {
    cruzadas: [
      { cuando: { campo: "titulo", operador: "igual", valor: "NO-BORRADOR" }, severidad: "bloqueo", mensaje: "Título bloqueado", regla: "bloq" },
    ],
  };
  prov.registrar("solicitud-generica", 1, def, contrato);
  return prov;
}

describe("Response Runtime (borrador → enviada)", () => {
  it("guarda borrador (solo bloqueos), envía con validación completa y emite eventos", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    const ctx = ctxOf("t1");
    const g = await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-1", opId: "g-1", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "demo", monto: 5 },
    });
    expect(g.ok).toBe(true);
    if (g.ok) expect((g.value as { estado: string }).estado).toBe("BORRADOR");

    const e = await exec(rt, ctx, `${SERVICIO}.respuesta.enviar`, { id: "r-1", opId: "e-1", version: 1 });
    expect(e.ok).toBe(true);
    if (e.ok) expect((e.value as { estado: string }).estado).toBe("ENVIADA");
  });

  it("un borrador con bloqueo no puede guardarse", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    const ctx = ctxOf("t1");
    const g = await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-2", opId: "g-2", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "NO-BORRADOR" },
    });
    expect(g.ok).toBe(false);
  });

  it("enviar rechaza datos incompletos (obligatorio faltante)", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    const ctx = ctxOf("t1");
    await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-3", opId: "g-3", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { monto: 5 },
    });
    const e = await exec(rt, ctx, `${SERVICIO}.respuesta.enviar`, { id: "r-3", opId: "e-3", version: 1 });
    expect(e.ok).toBe(false);
  });

  it("es idempotente por opId en guardarBorrador y enviar", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    const ctx = ctxOf("t1");
    await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-4", opId: "g", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "demo" },
    });
    const dup = await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-4", opId: "g", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "otro" },
    });
    expect(dup.ok).toBe(true);
    if (dup.ok) expect((dup.value as { idempotente: boolean }).idempotente).toBe(true);
  });

  it("detecta conflicto de versión optimista al enviar", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    const ctx = ctxOf("t1");
    await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-5", opId: "g", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "demo" },
    });
    const conflicto = await exec(rt, ctx, `${SERVICIO}.respuesta.enviar`, { id: "r-5", opId: "e", version: 99 });
    expect(conflicto.ok).toBe(false);
  });

  it("sella evidencias en el borrador con la identidad del contexto", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    const ctx = ctxOf("t1");
    await exec(rt, ctx, `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-6", opId: "g", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "demo" },
      evidencias: { titulo: [{ tipo: "comentario", campo: "titulo", texto: "nota demo" }] },
    });
    const r = await query(rt, ctx, `${SERVICIO}.respuesta.obtener`, { id: "r-6" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const ev = (r.value as { data: { evidencias: { sello: { usuarioId: string } }[] } }).data.evidencias;
      expect(ev[0]?.sello.usuarioId).toBe(ADMIN.id);
    }
  });

  it("aísla por tenant (multitenancy)", async () => {
    const rt = runtime({ motor: { resolutor: resolutorDemo() } });
    await exec(rt, ctxOf("t1"), `${SERVICIO}.respuesta.guardarBorrador`, {
      id: "r-7", opId: "g", plantillaClave: "solicitud-generica", plantillaVersion: 1, datos: { titulo: "demo" },
    });
    const enOtro = await query(rt, ctxOf("t2"), `${SERVICIO}.respuesta.obtener`, { id: "r-7" });
    expect(enOtro.ok).toBe(false);
  });
});

/* --------------------------- 10. Registro del motor ----------------------- */

describe("Registro automático del motor", () => {
  it("se inscribe en los registros oficiales con contrato completo", () => {
    const rt = runtime();
    const names = rt.platform.registries.services.list().map((s) => s.name);
    expect(names).toContain(SERVICIO);
    const caps = rt.platform.registries.capabilities.list().map((c) => c.name);
    expect(caps).toContain("disenar-formularios");
    expect(caps).toContain("capturar-respuestas");
    const g = rt.platform.registries.knowledgeGraph.snapshot();
    expect(g.nodes.some((n) => n.id === `service:${SERVICIO}`)).toBe(true);
    expect(g.edges.some((e) => e.from === `service:${SERVICIO}` && e.relation === "emits")).toBe(true);
  });

  it("incluye el health check del motor", async () => {
    const rt = runtime();
    const statuses = await rt.platform.registries.observability.checkAll();
    const mod = statuses.find((s) => s.service === SERVICIO);
    expect(mod?.healthy).toBe(true);
  });

  it("el contrato declara eventos, permisos y recordTypes", () => {
    const def = crearMotorFormularios();
    expect(def.events.length).toBeGreaterThan(0);
    expect(def.recordTypes).toContain("plantilla-formulario");
    expect(def.recordTypes).toContain("respuesta-formulario");
    expect(Object.keys(def.configDefaults).length).toBeGreaterThan(0);
  });
});
