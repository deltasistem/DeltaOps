/**
 * DGP-013 · Wizard de creación de una orden de compra.
 * Pasos: cabecera (proveedor/moneda/condiciones) y líneas (tabla). Puede
 * pre-cargarse desde una cotización seleccionada de una solicitud
 * (`?solicitudId=&cotizacionId=`); en ese caso hidrata proveedor/líneas.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo, useProveedores } from "../lib/abastecimiento/hooks";
import { abastecimientoFetch } from "../lib/abastecimiento/api";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaOrdenCompra } from "../lib/forms/plantillas-abastecimiento";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearOrdenCompra } from "../lib/abastecimiento/mutaciones";
import { construirInputOrdenCompra } from "../lib/abastecimiento/alta";
import { CATALOGO_MONEDA, CATALOGO_UNIDAD } from "../lib/abastecimiento/constantes";
import { urlOrdenCompra, leerParam } from "../lib/abastecimiento/deep-links";
import type { CotizacionRow } from "../lib/abastecimiento/tipos";

const REGLAS = {};

const PASOS: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "cabecera", etiqueta: "Cabecera", campos: ["proveedorId", "moneda", "solicitudId", "cotizacionId", "condicionesPago", "condicionesEntrega"] },
  { clave: "lineas", etiqueta: "Líneas", campos: ["lineas"] },
];

export default function AbastecimientoOrdenNuevaPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/ordenes-compra/nueva">
      <WizardOrden />
    </ShellAbastecimiento>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function WizardOrden() {
  const [, navegar] = useLocation();
  const search = useSearch();
  const { cola } = useOffline();

  const solicitudIdAncla = leerParam(search, "solicitudId");
  const cotizacionIdAncla = leerParam(search, "cotizacionId");

  const proveedores = useProveedores({ limit: 300 });
  const monedas = useCatalogo(CATALOGO_MONEDA);
  const unidades = useCatalogo(CATALOGO_UNIDAD);

  const opcProveedores: OpcionSeleccion[] = (proveedores.datos ?? []).map((p) => ({ valor: p.id, etiqueta: p.razonSocial }));

  const definicion = useMemo(
    () => plantillaOrdenCompra({ proveedores: opcProveedores, monedas: mapa(monedas.datos ?? []), unidades: mapa(unidades.datos ?? []) }),
    [proveedores.datos, monedas.datos, unidades.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>(() => ({
    ...(solicitudIdAncla ? { solicitudId: solicitudIdAncla } : {}),
    ...(cotizacionIdAncla ? { cotizacionId: cotizacionIdAncla } : {}),
  }));
  const [hidratado, setHidratado] = useState(false);
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [pasoActual, setPasoActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ tono: "exito" | "info" | "error"; texto: string; id?: string } | null>(null);

  // Pre-carga proveedor/moneda/líneas desde la cotización seleccionada (sin fabricar datos).
  useEffect(() => {
    if (!solicitudIdAncla || !cotizacionIdAncla || hidratado) return;
    let vivo = true;
    (async () => {
      try {
        const r = await abastecimientoFetch<unknown>(`/solicitudes/${encodeURIComponent(solicitudIdAncla)}/cotizaciones`, { toleraNoEncontrado: true });
        const lista: CotizacionRow[] = Array.isArray(r) ? (r as CotizacionRow[]) : ((r as { cotizaciones?: CotizacionRow[] } | null)?.cotizaciones ?? []);
        const cot = lista.find((c) => c.id === cotizacionIdAncla);
        if (vivo && cot) {
          setValores((v) => ({
            ...v,
            proveedorId: cot.proveedorId,
            moneda: cot.moneda,
            lineas: (cot.lineas ?? []).map((l) => ({
              descripcion: l.descripcion,
              articuloId: l.articuloId ?? "",
              cantidad: l.cantidad?.valor ?? 0,
              unidad: l.cantidad?.unidad ?? "unidad",
              precioUnitario: l.precioUnitario?.monto ?? 0,
            })),
          }));
        }
      } catch {
        /* degradación: si no se puede leer, el usuario completa manualmente */
      } finally {
        if (vivo) setHidratado(true);
      }
    })();
    return () => { vivo = false; };
  }, [solicitudIdAncla, cotizacionIdAncla, hidratado]);

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
    const input = construirInputOrdenCompra(valores);
    if (input.lineas.length === 0) {
      setResultado({ tono: "error", texto: "La orden requiere al menos una línea." });
      return;
    }
    setEnviando(true);
    const r = await crearOrdenCompra(cola, input);
    setEnviando(false);
    if (r.encolada) setResultado({ tono: "info", texto: "Sin conexión: la orden se ha encolado y se sincronizará automáticamente." });
    else if (r.error) setResultado({ tono: "error", texto: r.error.message });
    else setResultado({ tono: "exito", texto: "Orden de compra creada (en Borrador). Apruébala y envíala desde la ficha.", id: (r.resultado as { id?: string } | undefined)?.id });
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
          <p>Al confirmar se creará la orden de compra en estado <strong>Borrador</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>La aprobación y el envío al proveedor son decisiones explícitas posteriores, gobernadas por Workflow.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nueva orden de compra" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlOrdenCompra(resultado.id!))}>Ver orden</Button>}
          <Button variant="secundario" onClick={() => navegar("/abastecimiento/ordenes-compra")}>Ir a órdenes</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader titulo="Nueva orden de compra" descripcion="Alta declarativa de una orden de compra." />
      {solicitudIdAncla && cotizacionIdAncla && <Alert variant="info" titulo={`Orden creada desde la cotización ${cotizacionIdAncla} de la solicitud ${solicitudIdAncla}`} />}
      {resultado?.tono === "error" && <Alert variant="error" titulo={resultado.texto} />}
      <Card><CardContent>
        <Wizard
          pasos={pasos}
          actual={pasoActual}
          onCambio={alCambiarPaso}
          onFinalizar={() => void finalizar()}
          etiquetaSiguiente="Siguiente"
          etiquetaAnterior="Anterior"
          etiquetaFinalizar={enviando ? "Creando…" : "Crear orden"}
        />
      </CardContent></Card>
    </>
  );
}
