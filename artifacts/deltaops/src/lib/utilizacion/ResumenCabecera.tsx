/**
 * DELTAOPS LITE-10 §11/§12/§19 · RESUMEN OPERACIONAL DE CABECERA.
 *
 * Composición PURA de datos ya existentes (no crea modelo ni ruta): resume, en
 * una tira compacta y responsive, lo que un usuario necesita ver de un vistazo:
 *   - Horómetro actual (última lectura vigente del medidor).
 *   - Próxima rutina con «Faltan N h» / «Vencido por X h» (motor de frecuencias).
 *   - Estado del último preoperacional (APTO / OBSERVACIONES / NO APTO, con texto).
 *
 * Reutilizado por la ficha del activo (§11/§12) y por la Hoja de vida (§19). Toda
 * ausencia de dato se dice de forma honesta («Sin rutinas configuradas», «Sin
 * preoperacional registrado», «Sin lectura»); jamás se inventa un cero ni un
 * faltante sin fuente. El backend sigue siendo la autoridad de cálculo.
 */
import React, { useEffect, useState } from "react";
import { Badge } from "@workspace/design-system";
import { Gauge, CalendarClock, ShieldQuestion } from "lucide-react";
import { useUltimaLectura } from "./hooks";
import { UNIDAD_POR_MEDIDOR, TIPOS_MEDIDOR } from "./constantes";
import { useEstadoRutinas } from "../planes/hooks";
import type { EstadoRutinaActivo } from "../planes/tipos";
import { listarEjecuciones } from "../preoperacional/mutaciones";
import { esFuncionNoDisponible } from "../preoperacional/api";
import { PRESENTACION_VEREDICTO, type Veredicto } from "../preoperacional/constantes";
import type { EjecucionSellada } from "../preoperacional/tipos";

/** Formatea un número con separador de miles es-CO y unidad opcional. */
function fmt(n: number, dec: number, unidad?: string): string {
  const s = n.toLocaleString("es-CO", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return unidad ? `${s} ${unidad}` : s;
}

/** Unidad legible del faltante de una rutina ("h", "km", "días", …). */
function unidadRutina(r: EstadoRutinaActivo): string | null {
  if (!r.unidad) return null;
  return r.unidad === "horometro" ? "h" : r.unidad === "odometro" ? "km" : r.unidad;
}

/** Texto honesto del faltante/excedente de una rutina (§12/§13). */
function textoFaltante(r: EstadoRutinaActivo): string {
  const u = unidadRutina(r);
  if (r.faltante == null || !u) return "Sin datos suficientes";
  if (r.vencida) {
    const exc = r.excedente != null ? Math.abs(r.excedente) : Math.abs(r.faltante);
    return `Vencido por ${fmt(exc, 0)} ${u}`;
  }
  return `Faltan ${fmt(r.faltante, 0)} ${u}`;
}

/**
 * Selecciona la rutina más relevante para mostrar en cabecera: primero la más
 * vencida (mayor excedente), si no la más próxima (menor faltante). Ignora las
 * «sin datos» para no mostrar ruido, salvo que sea lo único disponible.
 */
function rutinaDestacada(rutinas: readonly EstadoRutinaActivo[]): EstadoRutinaActivo | null {
  if (rutinas.length === 0) return null;
  const conDatos = rutinas.filter((r) => r.faltante != null && r.unidad);
  if (conDatos.length === 0) return rutinas[0] ?? null;
  const vencidas = conDatos.filter((r) => r.vencida);
  if (vencidas.length > 0) {
    return [...vencidas].sort(
      (a, b) => Math.abs(b.excedente ?? b.faltante ?? 0) - Math.abs(a.excedente ?? a.faltante ?? 0),
    )[0] ?? null;
  }
  return [...conDatos].sort((a, b) => (a.faltante ?? Infinity) - (b.faltante ?? Infinity))[0] ?? null;
}

function variantePreop(veredicto: Veredicto): "exito" | "advertencia" | "error" {
  const t = PRESENTACION_VEREDICTO[veredicto].tono;
  return t === "exito" ? "exito" : t === "advertencia" ? "advertencia" : "error";
}

/** Hook local: último preoperacional sellado del activo (o null). */
function useUltimoPreoperacional(activoId: string): {
  ejecucion: EjecucionSellada | null;
  cargando: boolean;
  noDisponible: boolean;
} {
  const [ejecucion, setEjecucion] = useState<EjecucionSellada | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  useEffect(() => {
    if (!activoId) return;
    const ctrl = new AbortController();
    setCargando(true);
    setNoDisponible(false);
    listarEjecuciones(activoId, ctrl.signal)
      .then((r) => {
        const ordenadas = [...r].sort((a, b) => (b.data.selladoAt ?? "").localeCompare(a.data.selladoAt ?? ""));
        setEjecucion(ordenadas[0] ?? null);
      })
      .catch((e) => {
        if (esFuncionNoDisponible(e)) setNoDisponible(true);
        setEjecucion(null);
      })
      .finally(() => setCargando(false));
    return () => ctrl.abort();
  }, [activoId]);
  return { ejecucion, cargando, noDisponible };
}

function Celda({
  icono,
  etiqueta,
  children,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)", minWidth: "min(180px, 100%)", flex: "1 1 160px" }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--do-sp-1)",
          fontSize: "var(--do-text-xs)",
          color: "var(--do-texto-suave)",
          textTransform: "uppercase",
          letterSpacing: "var(--do-tracking-etiquetas)",
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex" }}>{icono}</span>
        {etiqueta}
      </span>
      <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{children}</span>
    </div>
  );
}

/**
 * Tira compacta con el resumen operacional del activo. `variant="tira"` (por
 * defecto) la muestra en una fila responsive; el llamador aporta el contenedor
 * (Card, cabecera, etc.). No hace peticiones si el activo está vacío.
 */
export function ResumenCabecera({ activoId }: { activoId: string }) {
  const lectura = useUltimaLectura(activoId, TIPOS_MEDIDOR[0]);
  const rutinas = useEstadoRutinas(activoId);
  const preop = useUltimoPreoperacional(activoId);

  const horo = lectura.datos;
  const destacada = rutinaDestacada(rutinas.datos?.rutinas ?? []);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--do-sp-3) var(--do-sp-5)",
        alignItems: "flex-start",
      }}
    >
      {/* Horómetro actual */}
      <Celda icono={<Gauge size={14} />} etiqueta="Horómetro">
        {lectura.cargando
          ? "…"
          : horo && horo.valor != null
            ? fmt(horo.valor, 1, horo.unidad ?? UNIDAD_POR_MEDIDOR.horometro)
            : <span style={{ color: "var(--do-texto-suave)", fontWeight: 400 }}>Sin lectura</span>}
      </Celda>

      {/* Próxima rutina · Faltan N h / Vencido por X h */}
      <Celda icono={<CalendarClock size={14} />} etiqueta="Próxima rutina">
        {rutinas.cargando ? (
          "…"
        ) : rutinas.error ? (
          <span style={{ color: "var(--do-texto-suave)", fontWeight: 400 }}>No disponible</span>
        ) : destacada ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
            <Badge
              variant={
                destacada.semaforo === "rojo"
                  ? "error"
                  : destacada.semaforo === "amarillo"
                    ? "advertencia"
                    : destacada.semaforo === "verde"
                      ? "exito"
                      : "neutro"
              }
            >
              {textoFaltante(destacada)}
            </Badge>
            <span style={{ fontWeight: 400, color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
              {destacada.nombre}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--do-texto-suave)", fontWeight: 400 }}>Sin rutinas configuradas</span>
        )}
      </Celda>

      {/* Último preoperacional */}
      <Celda icono={<ShieldQuestion size={14} />} etiqueta="Último preoperacional">
        {preop.cargando ? (
          "…"
        ) : preop.ejecucion ? (
          <Badge variant={variantePreop(preop.ejecucion.data.veredicto)}>
            {PRESENTACION_VEREDICTO[preop.ejecucion.data.veredicto].etiqueta}
          </Badge>
        ) : (
          <span style={{ color: "var(--do-texto-suave)", fontWeight: 400 }}>Sin preoperacional registrado</span>
        )}
      </Celda>
    </div>
  );
}
