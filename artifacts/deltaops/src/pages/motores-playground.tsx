/**
 * DGP-007 · Playground técnico interactivo de los motores.
 *
 * (a) Editor JSON (Textarea del DS) con una DefinicionFormulario neutra
 *     precargada. Al aplicar, renderiza el formulario dinámicamente
 *     interpretando definición + condicionales + validaciones con los runtimes
 *     REALES de @workspace/dynamic-forms (evaluación client-side pura).
 * (b) Panel de workflow: definición neutra precargada, selector de estado actual
 *     y botones de transición que muestran la evaluación del Transition Engine
 *     (permitida/denegada y por qué) usando el motor de condiciones.
 *
 * Todo en memoria, sin backend. Solo componentes del Design System.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch as DoSwitch,
  FormActions,
  Wizard,
  Stepper,
  Tabs,
  Table as DoTable,
  PageHeader,
  Section,
  ThemeProvider,
} from "@workspace/design-system";
import {
  validarDefinicion,
  camposHoja,
  hijosDe,
  type DefinicionFormulario,
  type NodoFormulario,
  type ContenedorFormulario,
  type CampoFormulario,
} from "@workspace/dynamic-forms/definicion";
import {
  evaluarReglasFormulario,
  type ReglasCampo,
  type EstadoCampoEvaluado,
} from "@workspace/dynamic-forms/condiciones";
import {
  validarSincrono,
  type ValidacionCruzada,
  type Severidad,
} from "@workspace/dynamic-forms/validacion";
import {
  esEstadoFinal,
  type DefinicionWorkflow,
} from "@workspace/workflow-engine/definicion";
import { evaluarTodas } from "@workspace/workflow-engine/condiciones";
import {
  jsonEditorEjemplo,
  definicionWorkflowEjemplo,
  datosWorkflowEjemplo,
} from "@/lib/motores-ejemplos";

/* ============================ Editor + parseo ============================= */

interface ContratoEjemplo {
  definicion: DefinicionFormulario;
  reglasCampo?: ReglasCampo[];
  cruzadas?: ValidacionCruzada[];
}

function parsearContrato(texto: string):
  | { ok: true; valor: ContratoEjemplo }
  | { ok: false; error: string } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (e) {
    return { ok: false, error: `JSON inválido: ${(e as Error).message}` };
  }
  const cont = bruto as Partial<ContratoEjemplo>;
  if (!cont || typeof cont !== "object" || !cont.definicion) {
    return { ok: false, error: "Falta la propiedad «definicion»." };
  }
  try {
    const def = validarDefinicion(cont.definicion);
    return {
      ok: true,
      valor: {
        definicion: def,
        reglasCampo: cont.reglasCampo ?? [],
        cruzadas: cont.cruzadas ?? [],
      },
    };
  } catch (e) {
    return { ok: false, error: `Definición inválida: ${(e as Error).message}` };
  }
}

/* ========================= Render dinámico del form ======================= */

const SEVERIDAD_VARIANT: Record<Severidad, "error" | "advertencia" | "info"> = {
  error: "error",
  bloqueo: "error",
  advertencia: "advertencia",
};

interface RenderCtx {
  datos: Record<string, unknown>;
  estados: Record<string, EstadoCampoEvaluado>;
  onCambio: (clave: string, valor: unknown) => void;
}

function CampoDinamico({ campo, ctx }: { campo: CampoFormulario; ctx: RenderCtx }) {
  const estado = ctx.estados[campo.clave];
  if (estado && !estado.visible) return null;

  const obligatorio = estado?.obligatorio ?? campo.obligatorio ?? false;
  const soloLectura = estado?.soloLectura ?? campo.soloLectura ?? false;
  const valorCrudo =
    estado?.valorCalculado !== undefined && estado.valorCalculado !== null
      ? estado.valorCalculado
      : ctx.datos[campo.clave];

  const especializado = ["firma", "ubicacion", "codigoQr", "codigoBarras", "nfc"].includes(campo.tipo);

  function control() {
    const comun = { disabled: soloLectura };
    switch (campo.tipo) {
      case "numero":
      case "decimal":
        return (
          <Input
            type="number"
            step={campo.tipo === "decimal" ? "0.01" : "1"}
            value={valorCrudo === undefined || valorCrudo === null ? "" : String(valorCrudo)}
            onChange={(e) => ctx.onCambio(campo.clave, e.target.value === "" ? undefined : Number(e.target.value))}
            {...comun}
          />
        );
      case "booleano":
        return (
          <DoSwitch
            label={campo.etiqueta}
            checked={Boolean(valorCrudo)}
            onChange={(e) => ctx.onCambio(campo.clave, e.target.checked)}
            disabled={soloLectura}
          />
        );
      case "select":
      case "autocomplete": {
        const opciones = campo.opciones ?? campo.fuente?.opciones ?? [];
        return (
          <Select
            value={valorCrudo === undefined || valorCrudo === null ? "" : String(valorCrudo)}
            onChange={(e) => ctx.onCambio(campo.clave, e.target.value === "" ? undefined : e.target.value)}
            {...comun}
          >
            <option value="">— Seleccione —</option>
            {opciones.map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </Select>
        );
      }
      case "multiSelect": {
        const opciones = campo.opciones ?? campo.fuente?.opciones ?? [];
        const actuales = Array.isArray(valorCrudo) ? (valorCrudo as string[]) : [];
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
            {opciones.map((o) => (
              <Checkbox
                key={o.valor}
                label={o.etiqueta}
                checked={actuales.includes(o.valor)}
                disabled={soloLectura}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...actuales, o.valor]
                    : actuales.filter((v) => v !== o.valor);
                  ctx.onCambio(campo.clave, next);
                }}
              />
            ))}
          </div>
        );
      }
      case "fecha":
        return <Input type="date" value={String(valorCrudo ?? "")} onChange={(e) => ctx.onCambio(campo.clave, e.target.value || undefined)} {...comun} />;
      case "hora":
        return <Input type="time" value={String(valorCrudo ?? "")} onChange={(e) => ctx.onCambio(campo.clave, e.target.value || undefined)} {...comun} />;
      case "fechaHora":
        return <Input type="datetime-local" value={String(valorCrudo ?? "")} onChange={(e) => ctx.onCambio(campo.clave, e.target.value || undefined)} {...comun} />;
      default:
        return (
          <Input
            value={String(valorCrudo ?? "")}
            onChange={(e) => ctx.onCambio(campo.clave, e.target.value || undefined)}
            {...comun}
          />
        );
    }
  }

  const ayudaExtra = estado?.valorCalculado !== undefined
    ? "Valor calculado automáticamente por el motor de condiciones."
    : campo.ayuda;

  if (campo.tipo === "booleano") {
    return (
      <Field label={<span>{campo.etiqueta}{obligatorio && <span style={{ color: "var(--do-error)" }}> *</span>}</span>} description={ayudaExtra}>
        {control()}
      </Field>
    );
  }

  return (
    <Field
      label={
        <span style={{ display: "inline-flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
          {campo.etiqueta}
          {obligatorio && <span style={{ color: "var(--do-error)" }}>*</span>}
          {especializado && <Badge variant="advertencia">captura especializada</Badge>}
        </span>
      }
      description={ayudaExtra}
    >
      {control()}
    </Field>
  );
}

function NodosDinamicos({ nodos, ctx }: { nodos: readonly NodoFormulario[]; ctx: RenderCtx }) {
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
      {nodos.map((n) => (
        <div key={n.clave} style={{ gridColumn: n.clase === "contenedor" ? "1 / -1" : undefined }}>
          {n.clase === "campo"
            ? <CampoDinamico campo={n} ctx={ctx} />
            : <ContenedorDinamico contenedor={n} ctx={ctx} />}
        </div>
      ))}
    </div>
  );
}

function ContenedorDinamico({ contenedor, ctx }: { contenedor: ContenedorFormulario; ctx: RenderCtx }) {
  const [pasoActivo, setPasoActivo] = useState(0);

  if (contenedor.tipo === "seccion" || contenedor.tipo === "grupo") {
    return (
      <Section titulo={contenedor.etiqueta}>
        <NodosDinamicos nodos={hijosDe(contenedor)} ctx={ctx} />
      </Section>
    );
  }

  if (contenedor.tipo === "pestanas") {
    const hijos = contenedor.hijos ?? [];
    return (
      <Tabs
        items={hijos.map((h) => ({
          id: h.clave,
          etiqueta: h.etiqueta,
          contenido:
            h.clase === "campo"
              ? <CampoDinamico campo={h} ctx={ctx} />
              : <NodosDinamicos nodos={hijosDe(h)} ctx={ctx} />,
        }))}
      />
    );
  }

  // wizard
  const pasos = contenedor.pasos ?? [];
  return (
    <Card>
      <CardHeader>
        <span style={{ fontWeight: "var(--do-peso-semibold)" }}>{contenedor.etiqueta}</span>
      </CardHeader>
      <CardContent>
        <Wizard
          actual={pasoActivo}
          onCambio={setPasoActivo}
          pasos={pasos.map((p) => ({
            id: p.clave,
            etiqueta: p.etiqueta,
            contenido: <NodosDinamicos nodos={p.hijos} ctx={ctx} />,
          }))}
        />
      </CardContent>
    </Card>
  );
}

/* ========================= Panel: Dynamic Forms =========================== */

function PanelFormulario() {
  const [texto, setTexto] = useState(jsonEditorEjemplo);
  const [contrato, setContrato] = useState<ContratoEjemplo>(() => {
    const r = parsearContrato(jsonEditorEjemplo);
    return r.ok ? r.valor : { definicion: { clave: "x", titulo: "x", nodos: [] } };
  });
  const [errorParse, setErrorParse] = useState<string | null>(null);
  const [datos, setDatos] = useState<Record<string, unknown>>({});

  function aplicar() {
    const r = parsearContrato(texto);
    if (!r.ok) {
      setErrorParse(r.error);
      return;
    }
    setErrorParse(null);
    setContrato(r.valor);
    setDatos({});
  }

  // Evaluación en vivo del motor de condiciones + validación (runtimes reales).
  const { estados, resultado } = useMemo(() => {
    const bases: Record<string, { obligatorio?: boolean; soloLectura?: boolean }> = {};
    for (const c of camposHoja(contrato.definicion)) {
      bases[c.clave] = { obligatorio: c.obligatorio, soloLectura: c.soloLectura };
    }
    const { estados } = evaluarReglasFormulario(contrato.reglasCampo ?? [], datos, bases);
    const resultado = validarSincrono(contrato.definicion, datos, {
      reglasCampo: contrato.reglasCampo,
      cruzadas: contrato.cruzadas,
    });
    return { estados, resultado };
  }, [contrato, datos]);

  const ctx: RenderCtx = {
    datos,
    estados,
    onCambio: (clave, valor) => setDatos((d) => ({ ...d, [clave]: valor })),
  };

  return (
    <div style={{ display: "grid", gap: "var(--do-sp-5)", gridTemplateColumns: "minmax(min(320px, 100%), 1fr) minmax(min(360px, 100%), 1.2fr)" }}>
      <Card>
        <CardHeader>
          <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Editor de definición (JSON)</span>
        </CardHeader>
        <CardContent>
          <Field label="Contrato: { definicion, reglasCampo, cruzadas }" description="Editable. Se valida con la estructura Zod real del motor al aplicar.">
            <Textarea
              rows={22}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}
              invalid={!!errorParse}
            />
          </Field>
          {errorParse && <Alert variant="error" titulo="No se pudo aplicar">{errorParse}</Alert>}
          <FormActions>
            <Button variant="secundario" onClick={() => { setTexto(jsonEditorEjemplo); setErrorParse(null); }}>Restaurar ejemplo</Button>
            <Button onClick={aplicar}>Aplicar definición</Button>
          </FormActions>
        </CardContent>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
        <Card>
          <CardHeader>
            <span style={{ fontWeight: "var(--do-peso-semibold)" }}>{contrato.definicion.titulo}</span>
          </CardHeader>
          <CardContent>
            {contrato.definicion.descripcion && (
              <p style={{ color: "var(--do-texto-suave)", marginBottom: "var(--do-sp-3)" }}>{contrato.definicion.descripcion}</p>
            )}
            <NodosDinamicos nodos={contrato.definicion.nodos} ctx={ctx} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Validación en vivo</span>
              {resultado.valido
                ? <Badge variant="exito">Válido</Badge>
                : <Badge variant="error">{resultado.hallazgos.length} hallazgo(s)</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {resultado.hallazgos.length === 0 ? (
              <Alert variant="exito" titulo="Sin hallazgos">Los datos capturados satisfacen todas las reglas.</Alert>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                {resultado.hallazgos.map((h, i) => (
                  <Alert key={`${h.campo}-${i}`} variant={SEVERIDAD_VARIANT[h.severidad]} titulo={`${h.campo} · ${h.severidad}`}>
                    {h.mensaje} <code style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>({h.regla})</code>
                  </Alert>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================ Panel: Workflow ============================= */

function PanelWorkflow() {
  const wf: DefinicionWorkflow = definicionWorkflowEjemplo;
  const [estadoActual, setEstadoActual] = useState<string>(
    wf.estados.find((e) => e.inicial)?.nombre ?? wf.estados[0]!.nombre,
  );
  const [datos, setDatos] = useState<Record<string, unknown>>({ ...datosWorkflowEjemplo });

  const salientes = wf.transiciones.filter((t) => t.de === estadoActual);

  const ordenEstados = wf.estados.map((e) => e.nombre);
  const pasosStepper = wf.estados.map((e) => ({ id: e.nombre, etiqueta: e.etiqueta ?? e.nombre }));

  return (
    <div style={{ display: "grid", gap: "var(--do-sp-5)", gridTemplateColumns: "minmax(min(320px, 100%), 1fr) minmax(min(360px, 100%), 1.2fr)" }}>
      <Card>
        <CardHeader>
          <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Estado e payload (en memoria)</span>
        </CardHeader>
        <CardContent>
          <Stepper pasos={pasosStepper} actual={Math.max(0, ordenEstados.indexOf(estadoActual))} orientation="vertical" />
          <Divider />
          <Field label="Estado actual">
            <Select value={estadoActual} onChange={(e) => setEstadoActual(e.target.value)}>
              {wf.estados.map((e) => (
                <option key={e.nombre} value={e.nombre}>{e.etiqueta ?? e.nombre}</option>
              ))}
            </Select>
          </Field>
          <Divider />
          <p style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)", marginBottom: "var(--do-sp-2)" }}>
            Payload que evalúan las guardas (precondiciones):
          </p>
          <Field label="titulo">
            <Input value={String(datos.titulo ?? "")} onChange={(e) => setDatos((d) => ({ ...d, titulo: e.target.value || undefined }))} />
          </Field>
          <Field label="total">
            <Input type="number" value={String(datos.total ?? "")} onChange={(e) => setDatos((d) => ({ ...d, total: e.target.value === "" ? undefined : Number(e.target.value) }))} />
          </Field>
          <Field label="revisado">
            <DoSwitch label="revisado = true" checked={Boolean(datos.revisado)} onChange={(e) => setDatos((d) => ({ ...d, revisado: e.target.checked }))} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Transiciones evaluadas (Transition Engine)</span>
        </CardHeader>
        <CardContent>
          {esEstadoFinal(wf, estadoActual) && (
            <Alert variant="info" titulo="Estado final">Este estado no tiene transiciones salientes.</Alert>
          )}
          {salientes.length === 0 && !esEstadoFinal(wf, estadoActual) && (
            <Alert variant="info" titulo="Sin transiciones">No hay transiciones declaradas desde este estado.</Alert>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
            {salientes.map((t) => {
              const guarda = evaluarTodas(t.precondiciones, datos);
              const permitida = guarda.ok;
              return (
                <Card key={`${t.comando}-${t.a}`}>
                  <CardContent>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
                        <code style={{ fontFamily: "var(--do-font-mono)" }}>{t.comando}</code>
                        <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                          → {wf.estados.find((e) => e.nombre === t.a)?.etiqueta ?? t.a}
                        </span>
                      </div>
                      <Button
                        variant={permitida ? "primario" : "secundario"}
                        disabled={!permitida}
                        onClick={() => setEstadoActual(t.a)}
                      >
                        {permitida ? "Ejecutar" : "Bloqueada"}
                      </Button>
                    </div>
                    <Divider />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)", alignItems: "center" }}>
                      {permitida
                        ? <Badge variant="exito">Permitida</Badge>
                        : <Badge variant="error">Denegada</Badge>}
                      {!permitida && <span style={{ fontSize: "var(--do-text-sm)" }}>{guarda.motivo}</span>}
                      {t.permiso && <Badge variant="info">permiso: {t.permiso}</Badge>}
                      {t.aprobacion && <Badge variant="advertencia">aprobación (gate): {t.aprobacion.nombre}</Badge>}
                    </div>
                    {t.precondiciones && t.precondiciones.length > 0 && (
                      <DoTable caption="Precondiciones evaluadas">
                        <thead><tr><th>Condición</th><th>Resultado</th></tr></thead>
                        <tbody>
                          {t.precondiciones.map((c, i) => {
                            const r = evaluarTodas([c], datos);
                            return (
                              <tr key={i}>
                                <td><code style={{ fontSize: "var(--do-text-xs)" }}>{JSON.stringify(c)}</code></td>
                                <td>{r.ok ? <Badge variant="exito">✓</Badge> : <Badge variant="error">✕</Badge>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </DoTable>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ================================ Página ================================== */

export default function MotoresPlaygroundPage() {
  return (
    <ThemeProvider>
      <div className="do-root" style={{ minHeight: "100vh", background: "var(--do-bg)", padding: "var(--do-sp-6)" }}>
        <div style={{ maxWidth: "var(--do-max-ancho)", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }}>
          <PageHeader
            titulo="Playground técnico de motores"
            descripcion="Ejecución client-side pura de los runtimes reales: Dynamic Forms + Transition Engine, todo en memoria."
            acciones={
              <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
                <Link href="/motores">
                  <Button variant="secundario">Galería de motores</Button>
                </Link>
                <Link href="/">
                  <Button variant="fantasma">Consola</Button>
                </Link>
              </div>
            }
          />

          <Tabs
            items={[
              { id: "forms", etiqueta: "Dynamic Forms", contenido: <PanelFormulario /> },
              { id: "workflow", etiqueta: "Workflow", contenido: <PanelWorkflow /> },
            ]}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}
