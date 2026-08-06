/**
 * DGP-013 · Wizard de creación de un proveedor (Dynamic Forms + DS Wizard).
 * Pasos: datos comerciales, contactos (tabla), certificaciones y SLA.
 */
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { PageHeader, Card, CardContent, Wizard, Button, Alert } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellAbastecimiento } from "../lib/abastecimiento/Shell";
import { useOffline } from "../lib/offline/contexto";
import { useCatalogo } from "../lib/abastecimiento/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaProveedor } from "../lib/forms/plantillas-abastecimiento";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { crearProveedor } from "../lib/abastecimiento/mutaciones";
import { construirInputProveedor } from "../lib/abastecimiento/alta";
import { CATALOGO_TIPO_PROVEEDOR, CATALOGO_MONEDA } from "../lib/abastecimiento/constantes";
import { urlProveedor } from "../lib/abastecimiento/deep-links";

const REGLAS = {};

const PASOS: { clave: string; etiqueta: string; campos: string[] }[] = [
  { clave: "comercial", etiqueta: "Datos comerciales", campos: ["razonSocial", "nombreComercial", "identificacionTributaria", "tipo", "monedaPreferida"] },
  { clave: "contactos", etiqueta: "Contactos", campos: ["contactos"] },
  { clave: "certificaciones", etiqueta: "Certificaciones y SLA", campos: ["certificaciones", "slaTiempoRespuestaHoras", "slaPlazoEntregaDias", "slaNivelServicio"] },
];

export default function AbastecimientoProveedorNuevaPage() {
  return (
    <ShellAbastecimiento activo="/abastecimiento/proveedores/nuevo">
      <WizardProveedor />
    </ShellAbastecimiento>
  );
}

function mapa(r: { valor: string; etiqueta: string }[]): OpcionSeleccion[] {
  return r.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
}

function WizardProveedor() {
  const [, navegar] = useLocation();
  const { cola } = useOffline();

  const tipos = useCatalogo(CATALOGO_TIPO_PROVEEDOR);
  const monedas = useCatalogo(CATALOGO_MONEDA);

  const definicion = useMemo(
    () => plantillaProveedor({ tipos: mapa(tipos.datos ?? []), monedas: mapa(monedas.datos ?? []) }),
    [tipos.datos, monedas.datos],
  );

  const [valores, setValores] = useState<ValoresFormulario>({});
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
      setResultado({ tono: "error", texto: "Completa los datos comerciales obligatorios." });
      return;
    }
    setEnviando(true);
    const r = await crearProveedor(cola, construirInputProveedor(valores));
    setEnviando(false);
    if (r.encolada) setResultado({ tono: "info", texto: "Sin conexión: el proveedor se ha encolado y se sincronizará automáticamente." });
    else if (r.error) setResultado({ tono: "error", texto: r.error.message });
    else setResultado({ tono: "exito", texto: "Proveedor creado correctamente.", id: (r.resultado as { id?: string } | undefined)?.id });
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
          <p>Al confirmar se creará el proveedor <strong>{String(valores.razonSocial ?? "")}</strong>.</p>
          <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>Si no hay conexión, el alta se guardará en la cola de sincronización.</p>
        </CardContent></Card>
      ),
    },
  ];

  if (resultado?.tono === "exito" || resultado?.tono === "info") {
    return (
      <>
        <PageHeader titulo="Nuevo proveedor" />
        <Alert variant={resultado.tono === "exito" ? "exito" : "info"} titulo={resultado.texto} />
        <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
          {resultado.id && <Button variant="primario" onClick={() => navegar(urlProveedor(resultado.id!))}>Ver proveedor</Button>}
          <Button variant="secundario" onClick={() => navegar("/abastecimiento/proveedores")}>Ir a proveedores</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader titulo="Nuevo proveedor" descripcion="Alta declarativa de un proveedor." />
      {resultado?.tono === "error" && <Alert variant="error" titulo={resultado.texto} />}
      <Card><CardContent>
        <Wizard
          pasos={pasos}
          actual={pasoActual}
          onCambio={alCambiarPaso}
          onFinalizar={() => void finalizar()}
          etiquetaSiguiente="Siguiente"
          etiquetaAnterior="Anterior"
          etiquetaFinalizar={enviando ? "Creando…" : "Crear proveedor"}
        />
      </CardContent></Card>
    </>
  );
}
