/**
 * DGP-009.3 · Wizard de creación de órdenes de trabajo.
 * Construido EXCLUSIVAMENTE sobre el Dynamic Forms Engine (`plantillaCreacion`)
 * y el DS `Wizard`. Autosave de borrador por tenant, validación por paso (pura),
 * revisión, confirmación y creación con degradación offline.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert, Badge } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/ordenes/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaCreacion, PASOS_CREACION } from "../lib/forms/plantillas-ordenes";
import { leerParam } from "../lib/ecosistema/deep-links";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearOrden } from "../lib/ordenes/mutaciones";
import { construirInput, leerBorrador, guardarBorrador, borrarBorrador } from "../lib/ordenes/alta";
import { TENANT } from "../lib/ordenes/constantes";

const REGLAS = {};

export default function OrdenesNuevaPage() {
  return (
    <ShellOrdenes activo="/ordenes/nueva">
      <WizardCreacion />
    </ShellOrdenes>
  );
}

/**
 * DGP-010 · Fusiona el borrador guardado con el contexto de la URL
 * (`?activo=&activoEtiqueta=&componente=&ubicacion=`). Los parámetros de la URL
 * tienen prioridad. Pura y exportada para pruebas deterministas.
 */
export function prefillDesdeUrl(base: ValoresFormulario, search: string): ValoresFormulario {
  const activo = leerParam(search, "activo");
  const activoEtiqueta = leerParam(search, "activoEtiqueta");
  const componente = leerParam(search, "componente");
  const ubicacion = leerParam(search, "ubicacion");
  if (!activo && !componente && !ubicacion && !activoEtiqueta) return base;
  return {
    ...base,
    ...(activo ? { activoId: activo } : componente ? { activoId: componente } : {}),
    ...(activoEtiqueta ? { activoEtiqueta } : {}),
    ...(ubicacion ? { ubicacionId: ubicacion } : {}),
  };
}

function useOpcionesCatalogo() {
  const tipos = useCatalogo("tipos");
  const categorias = useCatalogo("categorias");
  const prioridades = useCatalogo("prioridades");
  const severidades = useCatalogo("severidades");
  return useMemo(() => {
    const map = (r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] => r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
    return {
      tipos: map(tipos.datos ?? []),
      categorias: map(categorias.datos ?? []),
      prioridades: map(prioridades.datos ?? []),
      severidades: map(severidades.datos ?? []),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipos.datos, categorias.datos, prioridades.datos, severidades.datos]);
}

function WizardCreacion() {
  const [, navegar] = useLocation();
  const { cola } = useOffline();
  const opciones = useOpcionesCatalogo();
  const definicion = useMemo(() => plantillaCreacion(opciones), [opciones]);

  // DGP-010 · Navegación contextual: pre-rellena el activo/ubicación cuando se
  // llega desde la Vista 360° o el QR (`/ordenes/nueva?activo=…`).
  const [valores, setValores] = useState<ValoresFormulario>(() =>
    prefillDesdeUrl(leerBorrador(TENANT), typeof window !== "undefined" ? window.location.search : ""),
  );
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);
  const [borradorGuardado, setBorradorGuardado] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      guardarBorrador(TENANT, valores);
      setBorradorGuardado(true);
    }, 400);
    return () => clearTimeout(t);
  }, [valores]);

  function pasoValido(indice: number): boolean {
    const paso = PASOS_CREACION[indice];
    if (!paso) return true;
    const h = validar(definicion, REGLAS, valores).filter((x) => paso.campos.includes(x.campo));
    return !hayBloqueos(h);
  }

  function alCambiarPaso(indice: number) {
    const visibles = PASOS_CREACION.slice(0, Math.max(indice, pasoActual)).flatMap((p) => p.campos);
    const h = validar(definicion, REGLAS, valores).filter((x) => visibles.includes(x.campo));
    setHallazgos(h);
    setPasoActual(indice);
  }

  async function finalizar() {
    const todos = validar(definicion, REGLAS, valores);
    setHallazgos(todos);
    if (hayBloqueos(todos)) {
      setResultado({ tono: "error", texto: "Hay campos obligatorios sin completar. Revisa los pasos marcados." });
      return;
    }
    setEnviando(true);
    const input = construirInput(valores);
    const r = await crearOrden(cola, input);
    setEnviando(false);
    if (r.encolada) {
      borrarBorrador(TENANT);
      setResultado({ tono: "info", texto: "Sin conexión: la orden se ha encolado y se sincronizará automáticamente." });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      borrarBorrador(TENANT);
      const id = (r.resultado as { id?: string } | undefined)?.id ?? (input.id as string | undefined);
      setResultado({ tono: "exito", texto: "Orden creada correctamente.", id });
    }
  }

  const pasosForm = PASOS_CREACION.map((p) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: (
      <FormularioDinamico
        definicion={definicion}
        reglas={REGLAS}
        valores={valores}
        onCambio={setValores}
        hallazgos={hallazgos}
        soloClaves={p.campos}
      />
    ),
    validar: () => pasoValido(PASOS_CREACION.findIndex((x) => x.clave === p.clave)),
  }));

  const pasos = [
    ...pasosForm,
    { id: "revision", etiqueta: "Revisión", contenido: <Revision valores={valores} /> },
    {
      id: "confirmacion",
      etiqueta: "Confirmación",
      contenido: (
        <Card>
          <CardContent>
            <p>Al confirmar se creará la orden <strong>{String(valores.titulo ?? "")}</strong> de tipo <strong>{String(valores.tipo ?? "")}</strong>.</p>
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
        <PageHeader titulo="Nueva orden" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(`/ordenes/${resultado.id}`)}>Ver orden</Button>}
          <Button variant="secundario" onClick={() => navegar("/ordenes")}>Ir al centro de operaciones</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Nueva orden de trabajo"
        descripcion="Completa los pasos para registrar una orden."
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
            etiquetaFinalizar={enviando ? "Creando…" : "Crear orden"}
          />
        </CardContent>
      </Card>
    </>
  );
}

function Revision({ valores }: { valores: ValoresFormulario }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {PASOS_CREACION.map((p) => (
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
