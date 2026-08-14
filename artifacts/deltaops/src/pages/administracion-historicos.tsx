/**
 * DELTAOPS LITE-09 · Administración → Datos históricos → Importar.
 *
 * Superficie de ESCRITORIO EXCLUSIVA de administración de empresa (TENANT_ADMIN /
 * SUPER_ADMIN). Recorre un asistente de 8 pasos sobre los endpoints ya expuestos
 * (`/deltaops/activos/historicos/*`): tipos de fuente → selección de archivo
 * (servidor o subida) → analizar (detección) → vista previa → validar (dry-run
 * con ✓/⚠/✕ y reporte de exclusiones) → confirmación explícita → importar →
 * resultado (conteos + registros omitidos).
 *
 * El backend es la AUTORIDAD: el tenant proviene del contexto autenticado y los
 * roles no autorizados reciben 403 (aquí se presenta honestamente). Estados de
 * carga/error/vacío explícitos. Solo Design System y tokens `--do-*`.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  Section,
  Card,
  CardContent,
  Button,
  Alert,
  Spinner,
  Badge,
  Table,
  EmptyState,
  Field,
  RadioGroup,
  Radio,
  Checkbox,
  Stepper,
  FormActions,
} from "@workspace/design-system";
import { Database, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesion } from "@/lib/identidad/sesion";
import {
  obtenerTiposFuente,
  obtenerArchivosDisponibles,
  analizarArchivo,
  validarArchivo,
  importarArchivoRemoto,
  subirArchivo,
  mensajeDeError,
  type TipoFuenteItem,
  type ArchivoDisponible,
  type AnalisisArchivo,
  type ReporteImportacion,
  type ReferenciaArchivo,
  type TipoFuente,
} from "@/lib/historicos/api";

const PASOS = [
  { id: "tipo", etiqueta: "Tipo de fuente" },
  { id: "archivo", etiqueta: "Archivo" },
  { id: "analizar", etiqueta: "Analizar" },
  { id: "previa", etiqueta: "Vista previa" },
  { id: "validar", etiqueta: "Validación" },
  { id: "confirmar", etiqueta: "Confirmación" },
  { id: "importar", etiqueta: "Importar" },
  { id: "resultado", etiqueta: "Resultado" },
] as const;

const gap = (n: 1 | 2 | 3 | 4 | 5 | 6) => `var(--do-sp-${n})`;

/* ------------------------------ Utilidades ------------------------------- */

function nombreArchivo(ref: ReferenciaArchivo | null, nombreSubido: string | null): string {
  if (!ref) return "—";
  if ("archivo" in ref) return ref.archivo;
  return nombreSubido ?? ref.uploadId;
}

/** Resumen ✓/⚠/✕ de un reporte (dry-run o importación). */
function ResumenConteos({ rep }: { rep: ReporteImportacion }) {
  const items: Array<{ icono: React.ReactNode; etiqueta: string; valor: number; color: string }> = [
    { icono: <CheckCircle2 size={18} />, etiqueta: "Válidos", valor: rep.validos, color: "var(--do-exito, var(--do-success))" },
    { icono: <AlertTriangle size={18} />, etiqueta: "Con advertencias", valor: rep.advertencias, color: "var(--do-advertencia, var(--do-warning))" },
    { icono: <XCircle size={18} />, etiqueta: "Rechazados", valor: rep.rechazados, color: "var(--do-error)" },
    { icono: <FileSpreadsheet size={18} />, etiqueta: "Omitidos (fuera de flota)", valor: rep.filasExcluidas.length, color: "var(--do-text-muted, var(--do-fg-muted))" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: gap(3) }}>
      {items.map((it) => (
        <Card key={it.etiqueta}>
          <CardContent>
            <div style={{ display: "flex", alignItems: "center", gap: gap(2), color: it.color }}>
              {it.icono}
              <span style={{ fontSize: "var(--do-fs-sm)" }}>{it.etiqueta}</span>
            </div>
            <div style={{ fontSize: "var(--do-fs-2xl, 1.75rem)", fontWeight: 700, marginTop: gap(1) }}>{it.valor}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ReporteExclusiones({ rep }: { rep: ReporteImportacion }) {
  if (rep.filasExcluidas.length === 0 && rep.incidencias.length === 0) {
    return <Alert variant="exito" titulo="Sin exclusiones ni incidencias">Todas las filas reconocidas corresponden a la flota histórica.</Alert>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: gap(4) }}>
      {rep.filasExcluidas.length > 0 && (
        <div>
          <h4 style={{ margin: `0 0 ${gap(2)}` }}>Registros omitidos ({rep.filasExcluidas.length})</h4>
          <p style={{ color: "var(--do-text-muted, var(--do-fg-muted))", fontSize: "var(--do-fs-sm)", marginTop: 0 }}>
            Filas cuyo código no pertenece a la flota histórica: no se importan y quedan documentadas.
          </p>
          <Table caption="Registros omitidos" compacta>
            <thead>
              <tr><th scope="col">Fila</th><th scope="col">Código</th><th scope="col">Motivo</th></tr>
            </thead>
            <tbody>
              {rep.filasExcluidas.slice(0, 200).map((f, i) => (
                <tr key={`${f.fila}-${i}`}><td>{f.fila}</td><td>{f.codigo || "—"}</td><td>{f.motivo}</td></tr>
              ))}
            </tbody>
          </Table>
          {rep.filasExcluidas.length > 200 && (
            <p style={{ color: "var(--do-text-muted, var(--do-fg-muted))", fontSize: "var(--do-fs-sm)" }}>
              Se muestran los primeros 200 de {rep.filasExcluidas.length} registros omitidos.
            </p>
          )}
        </div>
      )}
      {rep.incidencias.length > 0 && (
        <div>
          <h4 style={{ margin: `0 0 ${gap(2)}` }}>Incidencias ({rep.incidencias.length})</h4>
          <Table caption="Incidencias" compacta>
            <thead>
              <tr><th scope="col">Fila</th><th scope="col">Nivel</th><th scope="col">Detalle</th></tr>
            </thead>
            <tbody>
              {rep.incidencias.slice(0, 200).map((inc, i) => (
                <tr key={`${inc.fila}-${i}`}>
                  <td>{inc.fila}</td>
                  <td><Badge variant={inc.nivel === "error" ? "error" : "advertencia"}>{inc.nivel === "error" ? "Error" : "Aviso"}</Badge></td>
                  <td>{inc.mensaje}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rep.incidencias.length > 200 && (
            <p style={{ color: "var(--do-text-muted, var(--do-fg-muted))", fontSize: "var(--do-fs-sm)" }}>
              Se muestran las primeras 200 de {rep.incidencias.length} incidencias.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Asistente -------------------------------- */

function AsistenteImportacion() {
  const [paso, setPaso] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Estado del flujo.
  const [tipos, setTipos] = useState<TipoFuenteItem[] | null>(null);
  const [tipoElegido, setTipoElegido] = useState<TipoFuente | "">("");
  const [archivos, setArchivos] = useState<ArchivoDisponible[] | null>(null);
  const [refArchivo, setRefArchivo] = useState<ReferenciaArchivo | null>(null);
  const [nombreSubido, setNombreSubido] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisArchivo | null>(null);
  const [dryRun, setDryRun] = useState<ReporteImportacion | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [resultado, setResultado] = useState<ReporteImportacion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  // Carga inicial de catálogos (pasos 1 y 2).
  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([obtenerTiposFuente(ctrl.signal), obtenerArchivosDisponibles(ctrl.signal)])
      .then(([t, a]) => {
        setTipos(t.tipos);
        setArchivos(a.archivos);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(mensajeDeError(e));
      });
    return () => ctrl.abort();
  }, []);

  function reiniciar() {
    setPaso(0);
    setError(null);
    setTipoElegido("");
    setRefArchivo(null);
    setNombreSubido(null);
    setAnalisis(null);
    setDryRun(null);
    setConfirmado(false);
    setResultado(null);
  }

  const archivosDelTipo = useMemo(() => {
    if (!archivos) return [];
    if (!tipoElegido) return archivos;
    return archivos.filter((a) => a.tipo === tipoElegido);
  }, [archivos, tipoElegido]);

  async function accion<T>(fn: () => Promise<T>, luego: (v: T) => void) {
    setError(null);
    setOcupado(true);
    try {
      const v = await fn();
      luego(v);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setOcupado(false);
    }
  }

  async function onSubir(archivo: File) {
    setError(null);
    setSubiendo(true);
    try {
      const r = await subirArchivo(archivo);
      setRefArchivo({ uploadId: r.uploadId });
      setNombreSubido(r.nombre);
      setAnalisis(null);
      setDryRun(null);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setSubiendo(false);
    }
  }

  // Avanza ejecutando la acción de red del paso actual cuando corresponde.
  function siguiente() {
    setError(null);
    switch (paso) {
      case 0: // Tipo → Archivo
        if (!tipoElegido) { setError("Selecciona un tipo de fuente."); return; }
        setPaso(1);
        return;
      case 1: // Archivo → Analizar (dispara /analizar)
        if (!refArchivo) { setError("Selecciona un archivo del servidor o sube uno."); return; }
        void accion(() => analizarArchivo(refArchivo), (a) => { setAnalisis(a); setPaso(2); });
        return;
      case 2: // Análisis mostrado → Vista previa
        if (!analisis) { setError("Aún no se ha analizado el archivo."); return; }
        setPaso(3);
        return;
      case 3: // Vista previa → Validar (dispara /validar dry-run)
        if (!refArchivo) return;
        void accion(() => validarArchivo(refArchivo), (r) => { setDryRun(r); setPaso(4); });
        return;
      case 4: // Validación → Confirmación
        setPaso(5);
        return;
      case 5: // Confirmación → Importar (dispara /importar)
        if (!confirmado) { setError("Confirma la importación para continuar."); return; }
        if (!refArchivo) return;
        void accion(() => importarArchivoRemoto(refArchivo), (r) => { setResultado(r); setPaso(7); });
        return;
      default:
        return;
    }
  }

  function anterior() {
    setError(null);
    if (paso > 0) setPaso(Math.min(paso, PASOS.length - 1) - 1);
  }

  const esUltimo = paso >= PASOS.length - 1;
  const tipoReconocidoNoCoincide = analisis && tipoElegido && analisis.tipo && analisis.tipo !== tipoElegido;

  /* ------------------------------- Render -------------------------------- */

  function contenidoPaso(): React.ReactNode {
    switch (paso) {
      case 0:
        if (!tipos) return <Spinner label="Cargando tipos de fuente…" />;
        return (
          <Field label="Tipo de fuente histórica" description="Determina cómo se interpretan las columnas del Excel.">
            <RadioGroup
              name="tipo-fuente"
              label="Tipo de fuente histórica"
              value={tipoElegido}
              onChange={(v: string) => setTipoElegido(v as TipoFuente)}
            >
              {tipos.map((t) => (
                <Radio key={t.tipo} value={t.tipo} label={t.etiqueta} />
              ))}
            </RadioGroup>
          </Field>
        );
      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: gap(4) }}>
            <div>
              <h4 style={{ margin: `0 0 ${gap(2)}` }}>Archivos disponibles en el servidor</h4>
              {!archivos ? (
                <Spinner label="Cargando archivos…" />
              ) : archivosDelTipo.length === 0 ? (
                <EmptyState titulo="Sin archivos para este tipo" descripcion="No hay archivos reconocidos para el tipo seleccionado. Puedes subir uno manualmente." />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: gap(2) }}>
                  {archivosDelTipo.map((a) => {
                    const sel = refArchivo && "archivo" in refArchivo && refArchivo.archivo === a.nombre;
                    return (
                      <Card key={a.nombre}>
                        <CardContent>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: gap(3) }}>
                            <div style={{ display: "flex", alignItems: "center", gap: gap(2), minWidth: 0 }}>
                              <FileSpreadsheet size={18} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nombre}</div>
                                <div style={{ fontSize: "var(--do-fs-sm)", color: "var(--do-text-muted, var(--do-fg-muted))" }}>
                                  {a.etiqueta ?? "Tipo no reconocido por el nombre"}
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant={sel ? "primario" : "secundario"}
                              onClick={() => { setRefArchivo({ archivo: a.nombre }); setNombreSubido(null); setAnalisis(null); setDryRun(null); }}
                            >
                              {sel ? "Seleccionado" : "Seleccionar"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <h4 style={{ margin: `0 0 ${gap(2)}` }}>O sube un archivo</h4>
              <label
                style={{
                  display: "inline-flex", alignItems: "center", gap: gap(2), cursor: "pointer",
                  padding: `${gap(2)} ${gap(3)}`, border: "1px dashed var(--do-border)", borderRadius: "var(--do-radius-md, 8px)",
                }}
              >
                <Upload size={18} />
                <span>{subiendo ? "Subiendo…" : "Elegir archivo .xlsx"}</span>
                <input
                  type="file"
                  accept=".xlsx"
                  style={{ display: "none" }}
                  disabled={subiendo}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onSubir(f); e.target.value = ""; }}
                />
              </label>
              {refArchivo && !("archivo" in refArchivo) && (
                <p style={{ marginTop: gap(2), fontSize: "var(--do-fs-sm)" }}>
                  Archivo subido: <strong>{nombreArchivo(refArchivo, nombreSubido)}</strong>
                </p>
              )}
            </div>
          </div>
        );
      case 2:
        if (!analisis) return <Spinner label="Analizando…" />;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: gap(3) }}>
            {analisis.reconocido ? (
              <Alert variant="exito" titulo="Fuente reconocida">
                Se detectó el tipo <strong>{analisis.etiqueta}</strong> a partir de las columnas.
              </Alert>
            ) : (
              <Alert variant="advertencia" titulo="Tipo no reconocido automáticamente">
                No se pudo detectar el tipo por las columnas. Verifica que el archivo corresponde a una fuente histórica válida.
              </Alert>
            )}
            {tipoReconocidoNoCoincide && (
              <Alert variant="advertencia" titulo="El tipo detectado difiere del seleccionado">
                Seleccionaste un tipo distinto al detectado en el archivo. Revisa antes de continuar.
              </Alert>
            )}
            <div style={{ display: "flex", gap: gap(4), flexWrap: "wrap" }}>
              <span>Archivo: <strong>{analisis.archivo}</strong></span>
              <span>Filas: <strong>{analisis.totalFilas}</strong></span>
              <span>Columnas: <strong>{analisis.columnas}</strong></span>
            </div>
          </div>
        );
      case 3:
        if (!analisis) return <Alert variant="advertencia" titulo="Sin análisis">Regresa y analiza el archivo.</Alert>;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: gap(3) }}>
            <p style={{ marginTop: 0 }}>
              Vista previa de los encabezados detectados. La validación siguiente es una simulación (dry-run): <strong>no</strong> escribe datos.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: gap(2) }}>
              {analisis.muestraEncabezados.map((h, i) => (
                <Badge key={`${h}-${i}`} variant="neutro">{h}</Badge>
              ))}
            </div>
          </div>
        );
      case 4:
        if (!dryRun) return <Spinner label="Validando…" />;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: gap(4) }}>
            <Alert variant="info" titulo="Simulación (dry-run)">
              No se ha escrito ningún dato todavía. Revisa los conteos y las exclusiones antes de confirmar.
            </Alert>
            <ResumenConteos rep={dryRun} />
            <ReporteExclusiones rep={dryRun} />
          </div>
        );
      case 5:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: gap(4) }}>
            <Alert variant="advertencia" titulo="Confirmación requerida">
              La importación escribe datos históricos en la hoja de vida de los activos. Es idempotente (reejecutar no duplica), pero requiere tu confirmación explícita.
            </Alert>
            {dryRun && (
              <ul style={{ margin: 0, paddingLeft: gap(4), lineHeight: 1.8 }}>
                <li>Archivo: <strong>{dryRun.archivo}</strong></li>
                <li>Válidos: <strong>{dryRun.validos}</strong> · Con advertencias: <strong>{dryRun.advertencias}</strong></li>
                <li>Rechazados: <strong>{dryRun.rechazados}</strong> · Omitidos: <strong>{dryRun.filasExcluidas.length}</strong></li>
              </ul>
            )}
            <Checkbox
              checked={confirmado}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmado(e.target.checked)}
              label="Confirmo que deseo importar estos datos históricos."
            />
          </div>
        );
      case 7:
        if (!resultado) return <Spinner label="Importando…" />;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: gap(4) }}>
            <Alert variant="exito" titulo="Importación completada">
              Los datos se registraron en sus modelos destino y en la hoja de vida. Lote: <code>{resultado.loteId}</code>
            </Alert>
            <ResumenConteos rep={resultado} />
            <div>
              <h4 style={{ margin: `0 0 ${gap(2)}` }}>Registros creados</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: gap(2) }}>
                <Badge variant="info">Preoperacionales: {resultado.importados.preoperacionales}</Badge>
                <Badge variant="info">Lecturas: {resultado.importados.lecturas}</Badge>
                <Badge variant="info">Tanqueos: {resultado.importados.tanqueos}</Badge>
                <Badge variant="info">Jornadas: {resultado.importados.jornadas}</Badge>
                <Badge variant="info">Mantenimientos: {resultado.importados.mantenimientos}</Badge>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: gap(2), marginTop: gap(3) }}>
                <Badge variant="neutro">Activos nuevos: {resultado.activosNuevos.length}</Badge>
                <Badge variant="neutro">Activos existentes: {resultado.activosExistentes.length}</Badge>
              </div>
            </div>
            <ReporteExclusiones rep={resultado} />
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: gap(5) }}>
      <Stepper pasos={PASOS.map((p) => ({ id: p.id, etiqueta: p.etiqueta }))} actual={paso} />
      {error && <Alert variant="error" titulo="No se pudo completar la operación">{error}</Alert>}
      <div>{contenidoPaso()}</div>
      <FormActions align="distribuido">
        <Button variant="secundario" onClick={anterior} disabled={paso === 0 || ocupado}>
          Anterior
        </Button>
        {esUltimo ? (
          <Button variant="primario" onClick={reiniciar}>Importar otro archivo</Button>
        ) : (
          <Button variant="primario" onClick={siguiente} disabled={ocupado || subiendo || (paso === 5 && !confirmado)}>
            {ocupado ? "Procesando…" : paso === 5 ? "Importar ahora" : "Siguiente"}
          </Button>
        )}
      </FormActions>
    </div>
  );
}

/* ------------------------------- Guard + página -------------------------- */

function GuardaAdmin({ children }: { children: React.ReactNode }) {
  const { capacidades } = useSesion();
  if (!capacidades.administrarUsuarios) {
    return (
      <Section titulo="Datos históricos">
        <Alert variant="advertencia" titulo="Acceso restringido">
          La importación de datos históricos es exclusiva de la administración de la empresa. Tu rol no tiene permiso para acceder a esta superficie.
        </Alert>
      </Section>
    );
  }
  return <>{children}</>;
}

export default function AdministracionHistoricos() {
  return (
    <AppShellIdentidad>
      <GuardaAdmin>
        <Section titulo="Datos históricos · Importar">
          <p style={{ marginTop: 0, color: "var(--do-text-muted, var(--do-fg-muted))" }}>
            Importa datos operativos históricos (checklists, combustible, horas hombre y mantenimiento) desde los archivos
            entregados, con validación previa y trazabilidad por lote.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: gap(2), marginBottom: gap(4), color: "var(--do-text-muted, var(--do-fg-muted))" }}>
            <Database size={18} />
            <span style={{ fontSize: "var(--do-fs-sm)" }}>Superficie de administración · escritorio</span>
          </div>
          <AsistenteImportacion />
        </Section>
      </GuardaAdmin>
    </AppShellIdentidad>
  );
}
