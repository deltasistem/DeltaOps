/**
 * DGP-013 · Wizard de creación de un artículo (Dynamic Forms + DS Wizard).
 * Pasos: datos generales, valoración/costos e integración con inventario.
 * Validación por paso, revisión y alta con degradación offline (id de cliente).
 */
import React, { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/abastecimiento/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaArticulo } from "../lib/forms/plantillas-abastecimiento";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearArticulo } from "../lib/abastecimiento/mutaciones";
import { construirInputArticulo } from "../lib/abastecimiento/alta";
import {
  CATALOGO_TIPO_ARTICULO, CATALOGO_FAMILIA, CATALOGO_UNIDAD, CATALOGO_METODO_VALORACION, CATALOGO_MONEDA,
} from "../lib/abastecimiento/constantes";
import { urlArticulo, leerParam } from "../lib/abastecimiento/deep-links";

const REGLAS = {};

const PASOS: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "generales", etiqueta: "Datos generales", campos: ["nombre", "descripcion", "tipo", "familia", "unidad"] },
  { clave: "costos", etiqueta: "Valoración y costos", campos: ["metodoValoracion", "moneda", "costoEstandar", "toleranciaSobreRecepcion"] },
  { clave: "integracion", etiqueta: "Integración", campos: ["inventarioItemId"] },
];

export default function AbastecimientoArticuloNuevaPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/articulos/nuevo">
      <WizardArticulo />
    </ShellAbastecimiento>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function WizardArticulo() {
  const [, navegar] = useLocation();
  const search = useSearch();
  const itemAncla = leerParam(search, "inventarioItemId");
  const { cola } = useOffline();

  const tipos = useCatalogo(CATALOGO_TIPO_ARTICULO);
  const familias = useCatalogo(CATALOGO_FAMILIA);
  const unidades = useCatalogo(CATALOGO_UNIDAD);
  const metodos = useCatalogo(CATALOGO_METODO_VALORACION);
  const monedas = useCatalogo(CATALOGO_MONEDA);

  const definicion = useMemo(
    () => plantillaArticulo({
      tipos: mapa(tipos.datos ?? []),
      familias: mapa(familias.datos ?? []),
      unidades: mapa(unidades.datos ?? []),
      metodosValoracion: mapa(metodos.datos ?? []),
      monedas: mapa(monedas.datos ?? []),
    }),
    [tipos.datos, familias.datos, unidades.datos, metodos.datos, monedas.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => (itemAncla ? { inventarioItemId: itemAncla } : {}));
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);

  function pasoValido(indice: number): boolean {
    const paso = PASOS[indice];
    if (!paso) return true;
    const h = validar(definicion, REGLAS, valores).filter((x) => paso.campos.includes(x.campo));
    return !hayBloqueos(h);
  }
  function alCambiarPaso(indice: number) {
    const visibles = PASOS.slice(0, Math.max(indice, pasoActual)).flatMap((p) => p.campos);
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
    const r = await crearArticulo(cola, construirInputArticulo(valores));
    setEnviando(false);
    if (r.encolada) {
      setResultado({ tono: "info", texto: "Sin conexión: el artículo se ha encolado y se sincronizará automáticamente." });
    } else if (r.error) {
      setResultado({ tono: "error", texto: r.error.message });
    } else {
      const id = (r.resultado as { id?: string } | undefined)?.id;
      setResultado({ tono: "exito", texto: "Artículo creado correctamente.", id });
    }
  }

  const pasosForm = PASOS.map((p, indice) => ({
    id: p.clave,
    etiqueta: p.etiqueta,
    contenido: <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} soloClaves={p.campos} />,
    validar: () => pasoValido(indice),
  }));

  const pasos = [
    ...pasosForm,
    {
      id: "confirmacion", etiqueta: "Confirmación",
      contenido: (
        <Card><CardContent>
          <p>Al confirmar se creará el artículo <strong>{String(valores.nombre ?? "")}</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>Si no hay conexión, el alta se guardará en la cola de sincronización.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nuevo artículo" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlArticulo(resultado.id!))}>Ver artículo</Button>}
          <Button variant="secundario" onClick={() => navegar("/abastecimiento/articulos")}>Ir a artículos</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader titulo="Nuevo artículo" descripcion="Alta declarativa de un artículo del catálogo." />
      {itemAncla && <Alert variant="info" titulo={`Artículo vinculado al item de inventario ${itemAncla}`} />}
      {resultado?.tono === "error" && <Alert variant="error" titulo={resultado.texto} />}
      <Card><CardContent>
        <Wizard
          pasos={pasos}
          actual={pasoActual}
          onCambio={alCambiarPaso}
          onFinalizar={() => void finalizar()}
          etiquetaSiguiente="Siguiente"
          etiquetaAnterior="Anterior"
          etiquetaFinalizar={enviando ? "Creando…" : "Crear artículo"}
        />
      </CardContent></Card>
    </>
  );
}
