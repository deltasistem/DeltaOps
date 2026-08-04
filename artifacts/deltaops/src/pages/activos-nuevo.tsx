/**
 * DGP-008.3 · Wizard de alta de activo.
 * Usa el DS `Wizard` conectado a una plantilla del Dynamic Forms Engine
 * (`plantillaAlta`). 9 pasos: 7 de datos + revisión + confirmación.
 * Guarda borradores en localStorage por tenant y crea el activo (con
 * degradación offline).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  PageHeader,
  Card,
  CardContent,
  Wizard,
  Button,
  Alert,
  Badge,
} from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellActivos } from "../lib/activos/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/activos/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaAlta, REGLAS_ALTA, PASOS_WIZARD } from "../lib/forms/plantillas";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearActivo } from "../lib/activos/mutaciones";
import { construirInput, leerBorrador, guardarBorrador, borrarBorrador } from "../lib/activos/alta";
import { type NombreCatalogo } from "../lib/activos/tipos";

const TENANT = "deltaops";

export default function ActivosNuevoPage() {
  return (
    <ShellActivos activo="/activos/nuevo">
      <WizardAlta />
    </ShellActivos>
  );
}

function WizardAlta() {
  const [, navegar] = useLocation();
  const { cola } = useOffline();

  // Cargar opciones de catálogo (todas las usadas por la plantilla).
  const opcionesCatalogo = useCatalogosPlantilla();
  const definicion = useMemo(() => plantillaAlta(opcionesCatalogo), [opcionesCatalogo]);

  const [valores, setValores] = useState<ValoresFormulario>(() => leerBorrador(TENANT));
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);
  const [borradorGuardado, setBorradorGuardado] = useState(false);

  // Autoguardado de borrador.
  useEffect(() => {
    const t = setTimeout(() => {
      guardarBorrador(TENANT, valores);
      setBorradorGuardado(true);
    }, 400);
    return () => clearTimeout(t);
  }, [valores]);

  // Comprobación PURA de un paso (sin setState; el Wizard la llama en cada render).
  function pasoValido(indice: number): boolean {
    const paso = PASOS_WIZARD[indice];
    if (!paso) return true; // pasos de revisión/confirmación no tienen campos
    const h = validar(definicion, REGLAS_ALTA, valores).filter((x) => paso.campos.includes(x.campo));
    return !hayBloqueos(h);
  }

  // Al cambiar de paso, materializar los hallazgos de todos los pasos ya visitados.
  function alCambiarPaso(indice: number) {
    const visibles = PASOS_WIZARD.slice(0, Math.max(indice, pasoActual)).flatMap((p) => p.campos);
    const h = validar(definicion, REGLAS_ALTA, valores).filter((x) => visibles.includes(x.campo));
    setHallazgos(h);
    setPasoActual(indice);
  }

  async function finalizar() {
    // Validación total.
    const todos = validar(definicion, REGLAS_ALTA, valores);
    setHallazgos(todos);
    if (hayBloqueos(todos)) {
      setResultado({ tono: "error", texto: "Hay campos obligatorios sin completar. Revisa los pasos marcados." });
      return;
    }
    setEnviando(true);
    const input = construirInput(valores);
    const r = await crearActivo(cola, input);
    setEnviando(false);
    if (r.encolada) {
      borrarBorrador(TENANT);
      setResultado({ tono: "info", texto: "Sin conexión: el alta se ha encolado y se sincronizará automáticamente." });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      borrarBorrador(TENANT);
      const id = (input.id as string) ?? undefined;
      setResultado({ tono: "exito", texto: "Activo creado correctamente.", id });
    }
  }

  const pasosForm = PASOS_WIZARD.map((p) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: (
      <FormularioDinamico
        definicion={definicion}
        reglas={REGLAS_ALTA}
        valores={valores}
        onCambio={setValores}
        hallazgos={hallazgos}
        soloClaves={p.campos}
      />
    ),
    validar: () => pasoValido(PASOS_WIZARD.findIndex((x) => x.clave === p.clave)),
  }));

  const pasos = [
    ...pasosForm,
    {
      id: "revision",
      etiqueta: "Revisión",
      contenido: <Revision valores={valores} definicionCampos={PASOS_WIZARD} />,
    },
    {
      id: "confirmacion",
      etiqueta: "Confirmación",
      contenido: (
        <Card>
          <CardContent>
            <p>Al confirmar se creará el activo <strong>{String(valores.nombre ?? "")}</strong> con código <strong>{String(valores.codigoEmpresarial ?? "")}</strong>.</p>
            <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
              Si no hay conexión, el alta se guardará en la cola de sincronización.
            </p>
          </CardContent>
        </Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Alta de activo" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(`/activos/${resultado.id}`)}>Ver ficha</Button>}
          <Button variant="secundario" onClick={() => navegar("/activos")}>Ir al listado</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Alta de activo"
        descripcion="Completa los pasos para registrar un nuevo activo."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            {borradorGuardado && <Badge variant="neutro">Borrador guardado</Badge>}
            <Button variant="fantasma" size="sm" onClick={() => { borrarBorrador(TENANT); setValores({}); setBorradorGuardado(false); }}>Descartar borrador</Button>
          </div>
        }
      />
      {resultado?.tono === "error" && <Alert variant="error" titulo={resultado.texto} />}
      <Card>
        <CardContent>
          <Wizard
            pasos={pasos}
            actual={pasoActual}
            onCambio={alCambiarPaso}
            onFinalizar={() => void finalizar()}
            etiquetaSiguiente="Siguiente"
            etiquetaAnterior="Anterior"
            etiquetaFinalizar={enviando ? "Creando…" : "Crear activo"}
          />
        </CardContent>
      </Card>
    </>
  );
}

function Revision({ valores, definicionCampos }: { valores: ValoresFormulario; definicionCampos: typeof PASOS_WIZARD }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {definicionCampos.map((p) => (
        <Card key={p.clave}>
          <CardContent>
            <strong>{p.etiqueta}</strong>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", marginTop: "var(--do-sp-2)" }}>
              {p.campos.map((c) => (
                <React.Fragment key={c}>
                  <dt style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{c}</dt>
                  <dd style={{ margin: 0 }}>{formatoValor(valores[c])}</dd>
                </React.Fragment>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatoValor(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Carga las opciones de todos los catálogos usados por la plantilla. */
function useCatalogosPlantilla(): Partial<Record<NombreCatalogo, OpcionSeleccion[]>> {
  const usados: NombreCatalogo[] = [
    "tipos", "categorias", "familias", "subfamilias", "criticidades",
    "prioridades", "fabricantes", "modelos", "ubicaciones", "proveedores",
  ];
  // Hooks fijos (orden estable): uno por catálogo usado.
  const resultados = usados.map((c) => ({ c, r: useCatalogo(c) }));
  return useMemo(() => {
    const out: Partial<Record<NombreCatalogo, OpcionSeleccion[]>> = {};
    for (const { c, r } of resultados) {
      out[c] = (r.datos ?? []).map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, resultados.map((x) => x.r.datos));
}
