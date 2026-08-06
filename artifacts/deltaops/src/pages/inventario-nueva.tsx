/**
 * DGP-011.3 · Wizard de creación de un item de inventario.
 * Construido EXCLUSIVAMENTE sobre el Dynamic Forms Engine (`plantillaItem`) y el
 * DS `Wizard`. Autosave de borrador por tenant, validación por paso (pura),
 * revisión, confirmación y creación con degradación offline (client-minted id).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert, Badge } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellInventario } from "../lib/inventario/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/inventario/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaItem, PASOS_ITEM } from "../lib/forms/plantillas-inventario";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearItem } from "../lib/inventario/mutaciones";
import { construirInputItem, leerBorrador, guardarBorrador, borrarBorrador } from "../lib/inventario/alta";
import { TENANT } from "../lib/inventario/constantes";
import { urlItem } from "../lib/inventario/deep-links";

const REGLAS = {};
const FORM = "item";

export default function InventarioNuevaPage() {
  return (
    <ShellInventario activo="/inventario/nuevo">
      <WizardItem />
    </ShellInventario>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function WizardItem() {
  const [, navegar] = useLocation();
  const { cola } = useOffline();
  const tipos = useCatalogo("tipos");
  const categorias = useCatalogo("categorias");
  const definicion = useMemo(
    () => plantillaItem({ tipos: mapa(tipos.datos ?? []), categorias: mapa(categorias.datos ?? []) }),
    [tipos.datos, categorias.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => leerBorrador(TENANT, FORM));
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);
  const [borradorGuardado, setBorradorGuardado] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { guardarBorrador(TENANT, FORM, valores); setBorradorGuardado(true); }, 400);
    return () => clearTimeout(t);
  }, [valores]);

  function pasoValido(indice: number): boolean {
    const paso = PASOS_ITEM[indice];
    if (!paso) return true;
    const h = validar(definicion, REGLAS, valores).filter((x) => paso.campos.includes(x.campo));
    return !hayBloqueos(h);
  }

  function alCambiarPaso(indice: number) {
    const visibles = PASOS_ITEM.slice(0, Math.max(indice, pasoActual)).flatMap((p) => p.campos);
    setHallazgos(validar(definicion, REGLAS, valores).filter((x) => visibles.includes(x.campo)));
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
    const input = construirInputItem(valores);
    const r = await crearItem(cola, input);
    setEnviando(false);
    if (r.encolada) {
      borrarBorrador(TENANT, FORM);
      const id = (input.id as string | undefined);
      setResultado({ tono: "info", texto: "Sin conexión: el item se ha encolado y se sincronizará automáticamente.", id });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      borrarBorrador(TENANT, FORM);
      const id = (r.resultado as { id?: string } | undefined)?.id ?? (input.id as string | undefined);
      setResultado({ tono: "exito", texto: "Item creado correctamente.", id });
    }
  }

  const pasosForm = PASOS_ITEM.map((p, indice) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: (
      <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} soloClaves={p.campos} />
    ),
    validar: () => pasoValido(indice),
  }));

  const pasos = [
    ...pasosForm,
    { id: "revision", etiqueta: "Revisión", contenido: <Revision valores={valores} /> },
    {
      id: "confirmacion",
      etiqueta: "Confirmación",
      contenido: (
        <Card><CardContent>
          <p>Al confirmar se creará el item <strong>{String(valores.nombre ?? "")}</strong> (SKU <strong>{String(valores.sku ?? "")}</strong>).</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>Si no hay conexión, el alta se guardará en la cola de sincronización.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nuevo item" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlItem(resultado.id!))}>Ver item</Button>}
          <Button variant="secundario" onClick={() => navegar("/inventario")}>Ir al inventario</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        titulo="Nuevo item de inventario"
        descripcion="Completa los pasos para registrar un item."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            {borradorGuardado && <Badge variant="neutro">Borrador guardado</Badge>}
            <Button variant="fantasma" size="sm" onClick={() => { borrarBorrador(TENANT, FORM); setValores({}); setBorradorGuardado(false); }}>Descartar borrador</Button>
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
            etiquetaFinalizar={enviando ? "Creando…" : "Crear item"}
          />
        </CardContent>
      </Card>
    </>
  );
}

function Revision({ valores }: { valores: ValoresFormulario }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      {PASOS_ITEM.map((p) => (
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
