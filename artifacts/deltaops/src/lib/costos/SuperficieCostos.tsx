/**
 * DGP-021.4-E · Superficie de COSTOS (comparativa + tendencia), sobre el shell
 * existente (no app paralela). Todo el dato proviene de los contratos públicos
 * `GET /comparativa` y `GET /tendencia/activo/:id` — CERO reglas económicas en
 * React (§26): sólo se FORMATEAN cadenas exactas; jamás `parseFloat`/`Number`
 * sobre dinero. El ORDEN de la comparativa se hace comparando las CADENAS decimales
 * exactas dígito a dígito (helper `compararDecimal`), no con aritmética de floats.
 *
 * §13 Comparativa: SIEMPRE por MONEDA seleccionada; jamás ranking combinado entre
 * monedas. §14 Tendencia: serie mensual con huecos «Sin datos» (nunca 0 inventado).
 * §16/§17: jerarquía clara, lenguaje operacional, comparación sencilla, sin Excel.
 */
import React, { useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, Field, Input, Select, Alert, Spinner, Table, Badge, EmptyState,
} from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { useListado } from "../activos/hooks";
import { capacidadesCostos } from "./capacidades";
import { useComparativa, useTendencia, type FiltroPeriodo } from "./hooks";
import { mensajeDeError } from "./api";
import { PERIODOS, type PeriodoClave } from "./constantes";
import {
  formatearMoneda, formatearRatio, formatearMagnitud, formatearMes, SIN_DATOS_TEXTO,
} from "./formato";
import { EstadoIndicadorBadge } from "./componentes";
import type { ComparativaActivos, TendenciaActivo, FilaComparativa } from "./tipos";

/* ----------------------------- Orden string-safe ------------------------- */

/**
 * Compara dos CADENAS decimales exactas (numeric 18,6) SIN convertir a float.
 * Devuelve <0, 0, >0. `null` se ordena SIEMPRE al final (ausencia ≠ 0, §4).
 */
export function compararDecimal(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const na = a.trim().startsWith("-");
  const nb = b.trim().startsWith("-");
  if (na !== nb) return na ? -1 : 1; // negativo < positivo
  const cmpAbs = compararAbs(na ? a.slice(1) : a, nb ? b.slice(1) : b);
  return na ? -cmpAbs : cmpAbs;
}

function compararAbs(a: string, b: string): number {
  const [ea = "0", da = ""] = a.split(".");
  const [eb = "0", db = ""] = b.split(".");
  const ia = ea.replace(/^0+(?=\d)/, "");
  const ib = eb.replace(/^0+(?=\d)/, "");
  if (ia.length !== ib.length) return ia.length - ib.length;
  if (ia !== ib) return ia < ib ? -1 : 1;
  const len = Math.max(da.length, db.length);
  const fa = da.padEnd(len, "0");
  const fb = db.padEnd(len, "0");
  if (fa === fb) return 0;
  return fa < fb ? -1 : 1;
}

/* -------------------------------- Comparativa ---------------------------- */

export type CriterioOrden = "total" | "costoPorHora" | "costoPorKm";

const CRITERIOS: readonly { clave: CriterioOrden; etiqueta: string }[] = [
  { clave: "total", etiqueta: "Costo total" },
  { clave: "costoPorHora", etiqueta: "Costo por hora" },
  { clave: "costoPorKm", etiqueta: "Costo por km" },
];

function valorOrden(f: FilaComparativa, criterio: CriterioOrden): string | null {
  if (criterio === "total") return f.total;
  if (criterio === "costoPorHora") return f.costoPorHora;
  return f.costoPorKm;
}

export interface PanelComparativaProps {
  readonly datos: ComparativaActivos | null;
  readonly cargando?: boolean;
  readonly error?: string | null;
  readonly nombrePorId?: Readonly<Record<string, string>>;
  /** Sin activos seleccionados aún. */
  readonly vacioSeleccion?: boolean;
}

/** Comparativa PRESENTACIONAL pura: una moneda a la vez, ordenable. */
export function PanelComparativa(props: PanelComparativaProps) {
  const { datos, cargando, error, nombrePorId = {}, vacioSeleccion } = props;
  const monedas = useMemo(() => (datos?.rankingPorMoneda ?? []).map((s) => s.moneda), [datos]);
  const [moneda, setMoneda] = useState<string>("");
  const [criterio, setCriterio] = useState<CriterioOrden>("total");
  const [desc, setDesc] = useState(true);

  const monedaActiva = moneda && monedas.includes(moneda) ? moneda : monedas[0] ?? "";
  const serie = datos?.rankingPorMoneda.find((s) => s.moneda === monedaActiva);

  const filas = useMemo(() => {
    const arr = [...(serie?.activos ?? [])];
    arr.sort((x, y) => {
      const c = compararDecimal(valorOrden(x, criterio), valorOrden(y, criterio));
      return desc ? -c : c;
    });
    return arr;
  }, [serie, criterio, desc]);

  if (vacioSeleccion) {
    return (
      <EmptyState
        titulo="Elige activos para comparar"
        descripcion="Selecciona dos o más activos y un período para ver su costo total y sus indicadores por uso, siempre en una misma moneda."
      />
    );
  }
  if (error) return <Alert variant="error" titulo="No se pudo cargar la comparativa">{error}</Alert>;
  if (cargando && !datos) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>;
  }
  if (!datos || monedas.length === 0) {
    return <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>{SIN_DATOS_TEXTO} para los activos y el período elegidos.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {/* §13: selector de moneda — la comparación es SIEMPRE dentro de una moneda. */}
      <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
        <Field label="Moneda" description="La comparación nunca combina monedas.">
          <Select value={monedaActiva} onChange={(e) => setMoneda(e.target.value)}>
            {monedas.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Ordenar por">
          <Select value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioOrden)}>
            {CRITERIOS.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta}</option>)}
          </Select>
        </Field>
        <Field label="Sentido">
          <Select value={desc ? "desc" : "asc"} onChange={(e) => setDesc(e.target.value === "desc")}>
            <option value="desc">Mayor a menor</option>
            <option value="asc">Menor a mayor</option>
          </Select>
        </Field>
      </div>

      {monedas.length > 1 && (
        <Alert variant="info" titulo="Comparación por moneda">
          Estos activos registran costos en varias monedas ({monedas.join(", ")}). Cada
          moneda se compara por separado; no existe un ranking combinado.
        </Alert>
      )}

      <Table caption={`Comparativa de activos en ${monedaActiva}`} compacta>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left" }}>Activo</th>
            <th scope="col" style={{ textAlign: "right" }}>Costo total</th>
            <th scope="col" style={{ textAlign: "right" }}>Costo/hora</th>
            <th scope="col" style={{ textAlign: "right" }}>Costo/km</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.activoId}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 600 }}>
                {nombrePorId[f.activoId] ?? f.activoId}
              </th>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {formatearMoneda(f.total, monedaActiva) ?? `${f.total} ${monedaActiva}`}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: f.costoPorHora == null ? "var(--do-texto-suave)" : undefined }}>
                {f.costoPorHora != null ? (formatearRatio(f.costoPorHora, monedaActiva, "h") ?? "—") : SIN_DATOS_TEXTO}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: f.costoPorKm == null ? "var(--do-texto-suave)" : undefined }}>
                {f.costoPorKm != null ? (formatearRatio(f.costoPorKm, monedaActiva, "km") ?? "—") : SIN_DATOS_TEXTO}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/* --------------------------------- Tendencia ----------------------------- */

export interface PanelTendenciaProps {
  readonly datos: TendenciaActivo | null;
  readonly cargando?: boolean;
  readonly error?: string | null;
  readonly requiereRango?: boolean;
}

/** Tendencia PRESENTACIONAL pura: serie mensual con huecos «Sin datos». */
export function PanelTendencia(props: PanelTendenciaProps) {
  const { datos, cargando, error, requiereRango } = props;
  if (requiereRango) {
    return (
      <Alert variant="info" titulo="Elige un rango de fechas">
        La tendencia mensual necesita un período con fechas de inicio y fin. Selecciona
        «Rango personalizado» y define desde/hasta.
      </Alert>
    );
  }
  if (error) return <Alert variant="error" titulo="No se pudo cargar la tendencia">{error}</Alert>;
  if (cargando && !datos) {
    return <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>;
  }
  if (!datos || datos.puntos.length === 0) {
    return <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>{SIN_DATOS_TEXTO} en el rango elegido.</p>;
  }

  return (
    <Table caption="Tendencia mensual de costo, horas y km" compacta>
      <thead>
        <tr>
          <th scope="col" style={{ textAlign: "left" }}>Mes</th>
          <th scope="col" style={{ textAlign: "left" }}>Estado</th>
          <th scope="col" style={{ textAlign: "right" }}>Costo del mes</th>
          <th scope="col" style={{ textAlign: "right" }}>Horas</th>
          <th scope="col" style={{ textAlign: "right" }}>Km</th>
        </tr>
      </thead>
      <tbody>
        {datos.puntos.map((p) => {
          const sinDatos = p.estado !== "COMPLETO";
          return (
            <tr key={p.mes}>
              <th scope="row" style={{ textAlign: "left", fontWeight: 600 }}>{formatearMes(p.mes)}</th>
              <td style={{ textAlign: "left" }}>
                {sinDatos ? <Badge variant="neutro">{SIN_DATOS_TEXTO}</Badge> : <Badge variant="exito">Con datos</Badge>}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: sinDatos ? "var(--do-texto-suave)" : undefined }}>
                {p.costoPorMoneda && p.costoPorMoneda.length > 0
                  ? p.costoPorMoneda.map((t) => (
                      <div key={t.moneda}>{formatearMoneda(t.total, t.moneda) ?? `${t.total} ${t.moneda}`}</div>
                    ))
                  : SIN_DATOS_TEXTO}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.horas == null ? "var(--do-texto-suave)" : undefined }}>
                {p.horas != null ? (formatearMagnitud(p.horas, "h") ?? "—") : SIN_DATOS_TEXTO}
              </td>
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.km == null ? "var(--do-texto-suave)" : undefined }}>
                {p.km != null ? (formatearMagnitud(p.km, "km") ?? "—") : SIN_DATOS_TEXTO}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/* -------------------------- Superficie conectada ------------------------- */

/** Selector de período compartido por ambas vistas (mismo período aplica a todo). */
function SelectorPeriodo({
  periodo, desde, hasta, onPeriodo, onDesde, onHasta,
}: {
  periodo: PeriodoClave; desde: string; hasta: string;
  onPeriodo: (p: PeriodoClave) => void; onDesde: (v: string) => void; onHasta: (v: string) => void;
}) {
  return (
    <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))" }}>
      <Field label="Período">
        <Select value={periodo} onChange={(e) => onPeriodo(e.target.value as PeriodoClave)}>
          {PERIODOS.map((p) => <option key={p.clave} value={p.clave}>{p.etiqueta}</option>)}
        </Select>
      </Field>
      {periodo === "rango" && (
        <>
          <Field label="Desde"><Input type="date" value={desde} onChange={(e) => onDesde(e.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={hasta} onChange={(e) => onHasta(e.target.value)} /></Field>
        </>
      )}
    </div>
  );
}

/**
 * Superficie conectada: elección de activos (comparativa) o de un activo (tendencia),
 * período compartido, y RBAC de presentación (fallo cerrado: sin permiso, no se
 * muestra). El backend es la autoridad y recorta por rol/tenant.
 */
export function SuperficieCostos() {
  const { sesion } = useSesion();
  const cap = capacidadesCostos(sesion);

  const [vista, setVista] = useState<"comparativa" | "tendencia">("comparativa");
  const [periodo, setPeriodo] = useState<PeriodoClave>("anio");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [activoTendencia, setActivoTendencia] = useState<string>("");

  const filtro: FiltroPeriodo = { periodo, desde: desde || undefined, hasta: hasta || undefined };

  // Lista de activos del tenant (contrato público de Activos) para los selectores.
  const activos = useListado({});
  const nombrePorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of activos.datos ?? []) m[a.id] = `${a.nombre} · ${a.codigoEmpresarial}`;
    return m;
  }, [activos.datos]);

  const comparativa = useComparativa(vista === "comparativa" ? seleccion : [], filtro);
  const requiereRango = periodo === "rango" && !(desde && hasta);
  const tendencia = useTendencia(vista === "tendencia" && !requiereRango ? (activoTendencia || null) : null, filtro);

  if (!cap.leer) {
    return (
      <Card>
        <CardContent>
          <EmptyState titulo="Sin acceso" descripcion="Tu perfil no tiene permiso para ver los costos de mantenimiento." />
        </CardContent>
      </Card>
    );
  }

  const opcionesActivo = activos.datos ?? [];

  return (
    <Card>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
          <strong>Costos de mantenimiento</strong>
          <div role="tablist" aria-label="Vista de costos" style={{ display: "flex", gap: "var(--do-sp-2)" }}>
            <button
              role="tab" aria-selected={vista === "comparativa"} onClick={() => setVista("comparativa")}
              className="do-boton" style={tabStyle(vista === "comparativa")}
            >Comparativa</button>
            <button
              role="tab" aria-selected={vista === "tendencia"} onClick={() => setVista("tendencia")}
              className="do-boton" style={tabStyle(vista === "tendencia")}
            >Tendencia</button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
          {cap.vistaRecortada && (
            <Alert variant="info" titulo="Vista parcial">
              Ves los costos que tu perfil permite. Algunos conceptos pueden no ser visibles para tu rol.
            </Alert>
          )}

          <SelectorPeriodo
            periodo={periodo} desde={desde} hasta={hasta}
            onPeriodo={setPeriodo} onDesde={setDesde} onHasta={setHasta}
          />

          {vista === "comparativa" ? (
            <>
              <Field label="Activos a comparar" description="Elige dos o más activos.">
                <select
                  multiple
                  aria-label="Activos a comparar"
                  value={seleccion}
                  onChange={(e) => setSeleccion(Array.from(e.target.selectedOptions, (o) => o.value))}
                  className="do-select"
                  style={{ minHeight: 140, width: "100%", padding: "var(--do-sp-2)", borderRadius: "var(--do-radius-md)", border: "1px solid var(--do-borde)", background: "var(--do-surface)", color: "var(--do-texto)" }}
                >
                  {opcionesActivo.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre} · {a.codigoEmpresarial}</option>
                  ))}
                </select>
              </Field>
              <PanelComparativa
                datos={comparativa.datos}
                cargando={comparativa.cargando}
                error={comparativa.error ? mensajeDeError(comparativa.error) : null}
                nombrePorId={nombrePorId}
                vacioSeleccion={seleccion.length === 0}
              />
            </>
          ) : (
            <>
              <Field label="Activo">
                <Select value={activoTendencia} onChange={(e) => setActivoTendencia(e.target.value)} placeholder="Selecciona un activo">
                  {opcionesActivo.map((a) => (
                    <option key={a.id} value={a.id}>{a.nombre} · {a.codigoEmpresarial}</option>
                  ))}
                </Select>
              </Field>
              {!activoTendencia && !requiereRango ? (
                <EmptyState titulo="Elige un activo" descripcion="Selecciona un activo para ver su tendencia mensual de costo, horas y km." />
              ) : (
                <PanelTendencia
                  datos={tendencia.datos}
                  cargando={tendencia.cargando}
                  error={tendencia.error ? mensajeDeError(tendencia.error) : null}
                  requiereRango={requiereRango}
                />
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function tabStyle(activo: boolean): React.CSSProperties {
  return {
    padding: "var(--do-sp-2) var(--do-sp-3)",
    borderRadius: "var(--do-radius-md)",
    border: "1px solid var(--do-borde)",
    background: activo ? "var(--do-primario)" : "transparent",
    color: activo ? "var(--do-primario-contraste)" : "var(--do-texto)",
    fontWeight: 600,
    cursor: "pointer",
  };
}
