/**
 * DGP-019.1 · Registro de lectura de medidor (Dynamic Forms, patrón DGP-008.3).
 *
 * Formulario construido sobre el Dynamic Forms Engine (`plantillaLectura`) +
 * el renderer genérico `FormularioDinamico`. El `activoId` se captura con el
 * selector de Activos (consulta pública). Offline First: la creación degrada a
 * la cola existente (`mutarConOffline` + `/sync`, siempre con `opId`), origen
 * `manual`. La unidad se deriva del tipo de medidor si se omite. Sólo aparece
 * con la capacidad `lecturas.registrar` (el backend es la autoridad, 403).
 */
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageHeader, Card, CardContent, Button, Alert } from "@workspace/design-system";
import { ShellUtilizacion } from "../lib/utilizacion/Shell";
import { useSesion } from "../lib/identidad/sesion";
import { capacidadesUtilizacion } from "../lib/utilizacion/capacidades";
import { useOffline } from "../lib/offline/contexto";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaLectura, CAMPOS_LECTURA } from "../lib/utilizacion/plantillas";
import { SelectorActivo } from "../lib/utilizacion/componentes";
import { registrarLectura } from "../lib/utilizacion/mutaciones";
import { UNIDAD_POR_MEDIDOR } from "../lib/utilizacion/constantes";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";

const REGLAS = {};

export default function UtilizacionLecturaNuevaPage() {
  return (
    <ShellUtilizacion activo="/utilizacion/lecturas/nueva">
      <Registro />
    </ShellUtilizacion>
  );
}

export function Registro() {
  const [, navegar] = useLocation();
  const { sesion } = useSesion();
  const cap = capacidadesUtilizacion(sesion ?? { rol: "CONSULTA" });
  const { cola } = useOffline();
  const definicion = useMemo(() => plantillaLectura(), []);

  const [activoId, setActivoId] = useState("");
  const [valores, setValores] = useState<ValoresFormulario>({});
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [errorActivo, setErrorActivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);

  if (!cap.registrarLectura) {
    return (
      <>
        <PageHeader titulo="Registrar lectura" />
        <Alert variant="error" titulo="Sin permiso">No tienes la capacidad para registrar lecturas.</Alert>
      </>
    );
  }

  async function finalizar() {
    const h = validar(definicion, REGLAS, valores).filter((x) => CAMPOS_LECTURA.includes(x.campo as (typeof CAMPOS_LECTURA)[number]));
    setHallazgos(h);
    const faltaActivo = activoId.trim() === "";
    setErrorActivo(faltaActivo ? "Selecciona un activo." : null);
    if (hayBloqueos(h) || faltaActivo) {
      setResultado({ tono: "error", texto: "Revisa los campos obligatorios." });
      return;
    }
    const tipoMedidor = String(valores.tipoMedidor ?? "");
    setEnviando(true);
    setResultado(null);
    const r = await registrarLectura(cola, {
      activoId,
      tipoMedidor,
      valor: Number(valores.valor),
      unidad: UNIDAD_POR_MEDIDOR[tipoMedidor], // derivada del tipo
      fechaHora: new Date(String(valores.fechaHora)).toISOString(),
      observacion: valores.observacion ? String(valores.observacion) : undefined,
      origen: "manual",
    });
    setEnviando(false);
    if (r.error) { setResultado({ tono: "error", texto: r.error.message }); return; }
    if (r.encolada) {
      setResultado({ tono: "info", texto: "Sin conexión: la lectura se registrará al sincronizar." });
    } else {
      setResultado({ tono: "exito", texto: "Lectura registrada." });
    }
    setValores({});
    setActivoId("");
  }

  return (
    <>
      <PageHeader titulo="Registrar lectura" descripcion="Lectura de horómetro/odómetro de un activo." />
      {resultado && (
        <Alert variant={resultado.tono} titulo={resultado.tono === "error" ? "No se pudo registrar" : resultado.tono === "info" ? "Guardado offline" : "Listo"}>
          {resultado.texto}
          {resultado.tono === "exito" && (
            <div style={{ marginTop: "var(--do-sp-3)" }}>
              <Button size="sm" variant="secundario" onClick={() => navegar("/utilizacion/lecturas")}>Ver historial</Button>
            </div>
          )}
        </Alert>
      )}
      <Card>
        <CardContent>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
            <SelectorActivo valor={activoId} onCambio={setActivoId} obligatorio error={errorActivo ?? undefined} />
            <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
            <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end" }}>
              <Button variant="fantasma" onClick={() => navegar("/utilizacion/lecturas")} disabled={enviando}>Cancelar</Button>
              <Button variant="primario" onClick={finalizar} disabled={enviando}>{enviando ? "Registrando…" : "Registrar lectura"}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
