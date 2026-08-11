/**
 * DGP-019.1 · Registro de tanqueo de combustible (Dynamic Forms, DGP-008.3).
 *
 * Formulario sobre el Dynamic Forms Engine (`plantillaTanqueo`) + renderer
 * genérico. Captura litros, tipo de combustible (catálogo del módulo),
 * precio unitario / costo total, proveedor (opcional) y observación. Captura la
 * lectura del medidor "al momento" (última lectura del activo) para enlazar
 * `lecturaMedidorRef`. El operador es implícito de la sesión (backend). Offline
 * First con la cola existente (`/sync`, siempre `opId`). Sólo aparece con la
 * capacidad `tanqueos.registrar` (backend autoritativo, 403).
 */
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageHeader, Card, CardContent, Button, Alert, Field, Select, Checkbox } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellUtilizacion } from "../lib/utilizacion/Shell";
import { useSesion } from "../lib/identidad/sesion";
import { capacidadesUtilizacion } from "../lib/utilizacion/capacidades";
import { useOffline } from "../lib/offline/contexto";
import { useCombustibles, useUltimaLectura } from "../lib/utilizacion/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaTanqueo, CAMPOS_TANQUEO } from "../lib/utilizacion/plantillas";
import { SelectorActivo } from "../lib/utilizacion/componentes";
import { registrarTanqueo } from "../lib/utilizacion/mutaciones";
import { TIPOS_MEDIDOR, ETIQUETA_TIPO_MEDIDOR, ETIQUETA_COMBUSTIBLE } from "../lib/utilizacion/constantes";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";

const REGLAS = {};

export default function UtilizacionTanqueoNuevoPage() {
  return (
    <ShellUtilizacion activo="/utilizacion/tanqueos/nuevo">
      <Registro />
    </ShellUtilizacion>
  );
}

export function Registro() {
  const [, navegar] = useLocation();
  const { sesion } = useSesion();
  const cap = capacidadesUtilizacion(sesion ?? { rol: "CONSULTA" });
  const { cola } = useOffline();

  const combustibles = useCombustibles();
  const opcionesCombustible: OpcionSeleccion[] = useMemo(
    () => (combustibles.datos ?? []).filter((o) => o.habilitado !== false).map((o) => ({ valor: o.clave, etiqueta: o.etiqueta ?? ETIQUETA_COMBUSTIBLE[o.clave] ?? o.clave })),
    [combustibles.datos],
  );
  const definicion = useMemo(() => plantillaTanqueo(opcionesCombustible), [opcionesCombustible]);

  const [activoId, setActivoId] = useState("");
  const [tipoMedidor, setTipoMedidor] = useState<string>("horometro");
  const [enlazarLectura, setEnlazarLectura] = useState(true);
  const [valores, setValores] = useState<ValoresFormulario>({});
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [errorActivo, setErrorActivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  // Lectura del medidor "al momento" del activo seleccionado.
  const ultima = useUltimaLectura(activoId, tipoMedidor);
  const lecturaRef = (ultima.datos as { id?: string } | null)?.id;

  if (!cap.registrarTanqueo) {
    return (
      <>
        <PageHeader titulo="Registrar tanqueo" />
        <Alert variant="error" titulo="Sin permiso">No tienes la capacidad para registrar tanqueos.</Alert>
      </>
    );
  }

  async function finalizar() {
    const h = validar(definicion, REGLAS, valores).filter((x) => CAMPOS_TANQUEO.includes(x.campo as (typeof CAMPOS_TANQUEO)[number]));
    setHallazgos(h);
    const faltaActivo = activoId.trim() === "";
    setErrorActivo(faltaActivo ? "Selecciona un activo." : null);
    if (hayBloqueos(h) || faltaActivo) {
      setResultado({ tono: "error", texto: "Revisa los campos obligatorios." });
      return;
    }
    setEnviando(true);
    setResultado(null);
    const num = (v: unknown): number | undefined => (v === undefined || v === null || v === "" ? undefined : Number(v));
    const r = await registrarTanqueo(cola, {
      activoId,
      fechaHora: new Date(String(valores.fechaHora)).toISOString(),
      litros: Number(valores.litros),
      tipoCombustible: String(valores.tipoCombustible ?? ""),
      precioUnitario: num(valores.precioUnitario),
      costoTotal: num(valores.costoTotal),
      moneda: valores.moneda ? String(valores.moneda) : undefined,
      proveedorId: valores.proveedorId ? String(valores.proveedorId) : undefined,
      observacion: valores.observacion ? String(valores.observacion) : undefined,
      lecturaMedidorRef: enlazarLectura && lecturaRef ? lecturaRef : undefined,
    });
    setEnviando(false);
    if (r.error) { setResultado({ tono: "error", texto: r.error.message }); return; }
    if (r.encolada) {
      setResultado({ tono: "info", texto: "Sin conexión: el tanqueo se registrará al sincronizar." });
    } else {
      setResultado({ tono: "exito", texto: "Tanqueo registrado." });
    }
    setValores({});
    setActivoId("");
  }

  return (
    <>
      <PageHeader titulo="Registrar tanqueo" descripcion="Carga de combustible de un activo." />
      {resultado && (
        <Alert variant={resultado.tono} titulo={resultado.tono === "error" ? "No se pudo registrar" : resultado.tono === "info" ? "Guardado offline" : "Listo"}>
          {resultado.texto}
          {resultado.tono === "exito" && (
            <div style={{ marginTop: "var(--do-sp-3)" }}>
              <Button size="sm" variant="secundario" onClick={() => navegar("/utilizacion/tanqueos")}>Ver historial</Button>
            </div>
          )}
        </Alert>
      )}
      <Card>
        <CardContent>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            <SelectorActivo valor={activoId} onCambio={setActivoId} obligatorio error={errorActivo ?? undefined} />

            <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))" }}>
              <Field label="Medidor a enlazar" description="Se enlaza la última lectura registrada del activo.">
                <Select value={tipoMedidor} onChange={(e) => setTipoMedidor(e.target.value)}>
                  {TIPOS_MEDIDOR.map((t) => (
                    <option key={t} value={t}>{ETIQUETA_TIPO_MEDIDOR[t]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Lectura del medidor al momento">
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
                  <Checkbox
                    checked={enlazarLectura}
                    onChange={(e) => setEnlazarLectura(e.target.checked)}
                    label="Enlazar la última lectura"
                    disabled={!lecturaRef}
                  />
                  <span style={{ fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
                    {!activoId
                      ? "Selecciona un activo para ver su última lectura."
                      : ultima.cargando
                      ? "Consultando última lectura…"
                      : lecturaRef
                      ? `Última lectura: ${(ultima.datos as { valor?: number })?.valor ?? "—"} (${ETIQUETA_TIPO_MEDIDOR[tipoMedidor]})`
                      : "Sin lectura previa para este medidor."}
                  </span>
                </div>
              </Field>
            </div>

            <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />

            <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
              <Button variant="fantasma" onClick={() => navegar("/utilizacion/tanqueos")} disabled={enviando}>Cancelar</Button>
              <Button variant="primario" onClick={finalizar} disabled={enviando}>{enviando ? "Registrando…" : "Registrar tanqueo"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
