/**
 * DGP-020.3 · Administración de Mano de Obra (§37) — sólo TENANT_ADMIN.
 *
 * Tres áreas, tenant-scoped, en la zona administrativa existente de DeltaOps:
 *  - Categorías: listar / alta-edición (upsert) / habilitar-deshabilitar.
 *  - Recursos:   definir identidad→categoría; estado ACTIVO/INACTIVO. El
 *                selector usa la query de identidades elegibles existente y
 *                ENVÍA sólo el identityId canónico (§4).
 *  - Tarifas:    crear / actualizar (=nueva vigencia) / cerrar; historial de
 *                versiones con vigencias. Aviso EXPLÍCITO de que cambiar la
 *                tarifa NO altera valoraciones históricas (§10/§16).
 *
 * RBAC de presentación (§22/§37): quien no administra NO ve esta superficie
 * (se OCULTA, no se deshabilita). El backend es la autoridad. Operaciones
 * administrativas online-only (§26: no hay segunda cola offline). Idempotentes
 * por opId (§25). Tema por tokens (§39); responsive con tarjetas en móvil (§38).
 */
import React, { useMemo, useState } from "react";
import {
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Alert,
  Spinner,
  Field,
  Input,
  Select,
  Tabs,
  useToast,
} from "@workspace/design-system";
import { useSesion } from "../identidad/sesion";
import { useIdentidadesElegibles } from "../ordenes/hooks";
import { capacidadesManoDeObra } from "./capacidades";
import { useCatalogoCategorias, useRecursos, useTarifas } from "./hooks";
import {
  upsertCategoria,
  habilitarCategoria,
  definirRecurso,
  cambiarEstadoRecurso,
  crearTarifa,
  actualizarTarifa,
  cerrarTarifa,
} from "./mutaciones";
import { formatearTarifa, nombrePresentacion } from "./formato";
import type { OpcionCategoria, Recurso, Tarifa } from "./tipos";

function fmtFecha(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es");
}

/* =============================== Categorías ============================== */

function PanelCategorias() {
  const catalogo = useCatalogoCategorias();
  const toast = useToast();
  const [clave, setClave] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = catalogo.datos?.opciones ?? [];

  async function crear() {
    setError(null);
    const c = clave.trim();
    if (!c) { setError("Indica una clave para la categoría."); return; }
    setOcupado(true);
    const r = await upsertCategoria({ clave: c, etiqueta: etiqueta.trim() || undefined });
    setOcupado(false);
    if (r.ok) {
      toast.mostrar({ variant: "exito", titulo: "Categoría guardada", mensaje: c });
      setClave(""); setEtiqueta("");
      catalogo.recargar();
    } else {
      setError(r.error ?? "No se pudo guardar la categoría.");
    }
  }

  async function alternar(o: OpcionCategoria) {
    const r = await habilitarCategoria({ clave: o.value, habilitado: !(o.habilitado ?? true) });
    if (r.ok) { toast.mostrar({ variant: "exito", titulo: "Categoría actualizada", mensaje: o.label }); catalogo.recargar(); }
    else toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error ?? "No se pudo actualizar." });
  }

  return (
    <Card>
      <CardHeader><strong>Categorías de mano de obra</strong></CardHeader>
      <CardContent>
        {error && <div style={{ marginBottom: "var(--do-sp-3)" }}><Alert variant="error" titulo="Error">{error}</Alert></div>}
        <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", alignItems: "end", marginBottom: "var(--do-sp-4)" }}>
          <Field label="Clave"><Input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="tecnico-electrico" /></Field>
          <Field label="Etiqueta"><Input value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} placeholder="Técnico eléctrico" /></Field>
          <Button variant="primario" loading={ocupado} onClick={() => void crear()}>Guardar categoría</Button>
        </div>

        {catalogo.cargando && opciones.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>
        ) : opciones.length === 0 ? (
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>No hay categorías configuradas todavía.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-2)" }}>
            {opciones.map((o) => (
              <li key={o.value} style={{ listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)", flexWrap: "wrap", border: "1px solid var(--do-borde)", borderRadius: "var(--do-radius-md)", padding: "var(--do-sp-2) var(--do-sp-3)" }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{o.label}</strong>{" "}
                  <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>({o.value})</span>
                  {o.canonica && <Badge variant="neutro">Canónica</Badge>}
                </span>
                <span style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
                  <Badge variant={(o.habilitado ?? true) ? "exito" : "neutro"}>{(o.habilitado ?? true) ? "Habilitada" : "Deshabilitada"}</Badge>
                  <Button variant="secundario" size="sm" onClick={() => void alternar(o)}>
                    {(o.habilitado ?? true) ? "Deshabilitar" : "Habilitar"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================ Recursos =============================== */

function PanelRecursos() {
  const catalogo = useCatalogoCategorias();
  const recursos = useRecursos();
  const elegibles = useIdentidadesElegibles();
  const toast = useToast();
  const [identityId, setIdentityId] = useState("");
  const [categoriaClave, setCategoria] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categorias = catalogo.datos?.opciones ?? [];

  async function definir() {
    setError(null);
    if (!identityId) { setError("Selecciona una identidad."); return; }
    if (!categoriaClave) { setError("Selecciona una categoría."); return; }
    setOcupado(true);
    const r = await definirRecurso({ identityId, categoriaClave });
    setOcupado(false);
    if (r.ok) {
      toast.mostrar({ variant: "exito", titulo: "Recurso definido", mensaje: identityId });
      setIdentityId(""); setCategoria("");
      recursos.recargar();
    } else {
      setError(r.error ?? "No se pudo definir el recurso.");
    }
  }

  async function alternarEstado(rec: Recurso) {
    const nuevo = rec.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    const r = await cambiarEstadoRecurso({ identityId: rec.identityId, estado: nuevo });
    if (r.ok) { toast.mostrar({ variant: "exito", titulo: "Recurso actualizado", mensaje: nuevo }); recursos.recargar(); }
    else toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error ?? "No se pudo actualizar." });
  }

  const lista = recursos.datos ?? [];

  return (
    <Card>
      <CardHeader><strong>Recursos humanos de mantenimiento</strong></CardHeader>
      <CardContent>
        {error && <div style={{ marginBottom: "var(--do-sp-3)" }}><Alert variant="error" titulo="Error">{error}</Alert></div>}
        <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", alignItems: "end", marginBottom: "var(--do-sp-4)" }}>
          <Field label="Identidad">
            <Select value={identityId} onChange={(e) => setIdentityId(e.target.value)} placeholder="Selecciona una persona">
              {(elegibles.datos ?? []).map((i) => (
                <option key={i.identityId} value={i.identityId}>{i.nombre} · {i.rol}</option>
              ))}
            </Select>
          </Field>
          <Field label="Categoría">
            <Select value={categoriaClave} onChange={(e) => setCategoria(e.target.value)} placeholder="Selecciona una categoría">
              {categorias.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Button variant="primario" loading={ocupado} onClick={() => void definir()}>Definir recurso</Button>
        </div>

        {recursos.cargando && lista.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>
        ) : lista.length === 0 ? (
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>No hay recursos definidos todavía.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-2)" }}>
            {lista.map((rec) => (
              <li key={rec.identityId} style={{ listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)", flexWrap: "wrap", border: "1px solid var(--do-borde)", borderRadius: "var(--do-radius-md)", padding: "var(--do-sp-2) var(--do-sp-3)" }}>
                <span style={{ minWidth: 0 }}>
                  <strong>{nombrePresentacion(rec.nombre, rec.identityId)}</strong>{" "}
                  <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>· {rec.categoriaClave}</span>
                </span>
                <span style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
                  <Badge variant={rec.estado === "ACTIVO" ? "exito" : "neutro"}>{rec.estado === "ACTIVO" ? "Activo" : "Inactivo"}</Badge>
                  <Button variant="secundario" size="sm" onClick={() => void alternarEstado(rec)}>
                    {rec.estado === "ACTIVO" ? "Desactivar" : "Activar"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================ Tarifas =============================== */

function PanelTarifas() {
  const catalogo = useCatalogoCategorias();
  const { sesion } = useSesion();
  const toast = useToast();
  const [sujetoId, setSujetoId] = useState("");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categorias = catalogo.datos?.opciones ?? [];
  const monedaTenant = sesion?.tenant?.moneda;
  // Historial de la categoría seleccionada (todas las versiones, VIGENTE+CERRADA).
  const tarifas = useTarifas(sujetoId ? { sujetoTipo: "CATEGORIA", sujetoId } : {});
  const versiones = useMemo(() => tarifas.datos ?? [], [tarifas.datos]);
  const vigente = versiones.find((t) => t.estado === "VIGENTE") ?? null;

  async function guardar() {
    setError(null);
    if (!sujetoId) { setError("Selecciona una categoría."); return; }
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) { setError("Indica un valor de tarifa válido."); return; }
    setOcupado(true);
    // Si ya hay una vigente, versionar (cierra la vigente y abre nueva en 1 UoW);
    // si no, crear. En ambos casos la vigencia arranca AHORA.
    const ahora = new Date().toISOString();
    const r = vigente
      ? await actualizarTarifa({ sujetoTipo: "CATEGORIA", sujetoId, valor: num, vigenciaDesde: ahora, moneda: monedaTenant, motivo: motivo.trim() || undefined })
      : await crearTarifa({ sujetoTipo: "CATEGORIA", sujetoId, valor: num, moneda: monedaTenant, motivo: motivo.trim() || undefined });
    setOcupado(false);
    if (r.ok) {
      toast.mostrar({ variant: "exito", titulo: vigente ? "Nueva vigencia creada" : "Tarifa creada", mensaje: sujetoId });
      setValor(""); setMotivo("");
      tarifas.recargar();
    } else {
      setError(r.error ?? "No se pudo guardar la tarifa.");
    }
  }

  async function cerrar() {
    if (!sujetoId || !vigente) return;
    const r = await cerrarTarifa({ sujetoTipo: "CATEGORIA", sujetoId, vigenciaHasta: new Date().toISOString() });
    if (r.ok) { toast.mostrar({ variant: "exito", titulo: "Vigencia cerrada", mensaje: sujetoId }); tarifas.recargar(); }
    else toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error ?? "No se pudo cerrar." });
  }

  return (
    <Card>
      <CardHeader><strong>Tarifas por categoría</strong></CardHeader>
      <CardContent>
        <div style={{ marginBottom: "var(--do-sp-4)" }}>
          <Alert variant="info" titulo="Los históricos no cambian">
            Cambiar una tarifa crea una NUEVA vigencia y cierra la anterior. Las valoraciones ya calculadas de OTs
            cerradas conservan su tarifa y costo originales.
          </Alert>
        </div>
        {error && <div style={{ marginBottom: "var(--do-sp-3)" }}><Alert variant="error" titulo="Error">{error}</Alert></div>}

        <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", alignItems: "end", marginBottom: "var(--do-sp-4)" }}>
          <Field label="Categoría">
            <Select value={sujetoId} onChange={(e) => setSujetoId(e.target.value)} placeholder="Selecciona una categoría">
              {categorias.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label={`Valor por hora${monedaTenant ? ` (${monedaTenant})` : ""}`}>
            <Input type="number" inputMode="decimal" min={0} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="40000" />
          </Field>
          <Field label="Motivo (opcional)">
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ajuste anual" />
          </Field>
          <Button variant="primario" loading={ocupado} onClick={() => void guardar()}>
            {vigente ? "Nueva vigencia" : "Crear tarifa"}
          </Button>
        </div>

        {sujetoId && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)", marginBottom: "var(--do-sp-2)", flexWrap: "wrap" }}>
              <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>Historial de vigencias</span>
              {vigente && <Button variant="secundario" size="sm" onClick={() => void cerrar()}>Cerrar vigencia actual</Button>}
            </div>
            {tarifas.cargando && versiones.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>
            ) : versiones.length === 0 ? (
              <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>Esta categoría no tiene tarifas configuradas.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, display: "grid", gap: "var(--do-sp-2)" }}>
                {versiones.map((t: Tarifa) => (
                  <li key={t.id} style={{ listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-2)", flexWrap: "wrap", border: "1px solid var(--do-borde)", borderRadius: "var(--do-radius-md)", padding: "var(--do-sp-2) var(--do-sp-3)" }}>
                    <span style={{ minWidth: 0 }}>
                      <strong>{formatearTarifa(t.valor, t.moneda, t.unidad)}</strong>{" "}
                      <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                        {fmtFecha(t.vigenciaDesde)} → {t.vigenciaHasta ? fmtFecha(t.vigenciaHasta) : "vigente"}
                      </span>
                    </span>
                    <Badge variant={t.estado === "VIGENTE" ? "exito" : "neutro"}>{t.estado === "VIGENTE" ? "Vigente" : "Cerrada"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Superficie administrativa completa. Oculta a quien no administra (§37). Se
 * monta dentro de la zona administrativa existente de DeltaOps.
 */
export function AdminManoDeObra() {
  const { sesion } = useSesion();
  const capacidades = capacidadesManoDeObra(sesion);

  if (!capacidades.administrar) {
    return (
      <Section titulo="Mano de obra">
        <Alert variant="advertencia" titulo="Acceso restringido">
          La administración de mano de obra (categorías, recursos y tarifas) es para administradores de la empresa.
        </Alert>
      </Section>
    );
  }

  return (
    <Section titulo="Mano de obra">
      <Tabs
        items={[
          { id: "categorias", etiqueta: "Categorías", contenido: <PanelCategorias /> },
          { id: "recursos", etiqueta: "Recursos", contenido: <PanelRecursos /> },
          { id: "tarifas", etiqueta: "Tarifas", contenido: <PanelTarifas /> },
        ]}
      />
    </Section>
  );
}
