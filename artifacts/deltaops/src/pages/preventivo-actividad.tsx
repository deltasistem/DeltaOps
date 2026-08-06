/**
 * DGP-014 · Alta/definición de una actividad de un programa preventivo.
 *
 * Construida sobre Dynamic Forms (`plantillaActividad`): checklist real
 * (plantillas del motor de formularios), dependencias (otras actividades del
 * programa, con validación de ciclos), personal, herramientas y REPUESTOS con
 * selección REAL de inventario y abastecimiento (degradación con aviso si el
 * endpoint no está disponible). Tiempos, costos y SLA. Envío con degradación
 * offline (client-minted id). Consume el `:id` del programa desde la ruta.
 */
import React, { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { PageHeader, Card, CardContent, Button, Alert, Spinner } from "@workspace/design-system";
import type { OpcionSeleccion } from "@workspace/dynamic-forms/definicion";
import { ShellPreventivo } from "../lib/preventivo/Shell";
import { useOffline } from "../lib/offline/contexto";
import { usePrograma, useActividades } from "../lib/preventivo/hooks";
import { useItems } from "../lib/inventario/hooks";
import { useArticulos } from "../lib/abastecimiento/hooks";
import { FormularioDinamico } from "../lib/forms/FormularioDinamico";
import { validar, hayBloqueos } from "../lib/forms/motor";
import { plantillaActividad } from "../lib/forms/plantillas-preventivo";
import type { ValoresFormulario, HallazgoCampo } from "../lib/forms/tipos";
import { definirActividad } from "../lib/preventivo/mutaciones";
import { construirInputActividad, filas, txt } from "../lib/preventivo/alta";
import { validarDependencias } from "../lib/preventivo/calendario";
import { nuevoOpId } from "../lib/offline/cola";
import { urlProgramaTab } from "../lib/preventivo/deep-links";

const REGLAS = {};

/** Checklists conocidos (plantillas del motor de formularios) como referencia. */
const CHECKLISTS: OpcionSeleccion[] = [
  { valor: "inspeccion-general", etiqueta: "Inspección general" },
  { valor: "lubricacion", etiqueta: "Lubricación" },
  { valor: "seguridad", etiqueta: "Verificación de seguridad" },
  { valor: "electrico", etiqueta: "Revisión eléctrica" },
  { valor: "mecanico", etiqueta: "Revisión mecánica" },
];

export default function PreventivoActividadPage() {
  const params = useParams();
  const id = params.id ?? "";
  return (
    <ShellPreventivo>
      <FormularioActividad programaId={id} />
    </ShellPreventivo>
  );
}

function FormularioActividad({ programaId }: { programaId: string }) {
  const [, navegar] = useLocation();
  const { cola } = useOffline();
  const { datos: programa, cargando } = usePrograma(programaId);
  const { datos: actividades } = useActividades(programaId);
  const items = useItems({ limit: 300 });
  const articulos = useArticulos({ limit: 300 });

  const opcActividades = useMemo<OpcionSeleccion[]>(
    () => (actividades ?? []).map((a) => ({ valor: a.id, etiqueta: `#${a.orden} ${a.nombre}` })),
    [actividades],
  );
  const opcRepuestos = useMemo<OpcionSeleccion[]>(() => {
    const inv = (items.datos ?? []).map((i) => ({ valor: i.id, etiqueta: `${i.nombre} · ${i.sku} (inventario)` }));
    const abr = (articulos.datos ?? []).map((a) => ({ valor: a.id, etiqueta: `${a.nombre} (abastecimiento)` }));
    return [...inv, ...abr];
  }, [items.datos, articulos.datos]);

  const definicion = useMemo(
    () => plantillaActividad({
      checklists: CHECKLISTS,
      actividades: opcActividades,
      repuestos: opcRepuestos,
      herramientas: opcRepuestos,
    }),
    [opcActividades, opcRepuestos],
  );

  const [valores, setValores] = useState<ValoresFormulario>({ orden: (actividades?.length ?? 0), tiempoUnidad: "h", moneda: "USD", checklistVersion: 1 });
  const [hallazgos, setHallazgos] = useState<HallazgoCampo[]>([]);
  const [msg, setMsg] = useState<{ tono: "exito" | "info" | "error"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const sinInventario = items.error != null && articulos.error != null;

  async function enviar() {
    const h = validar(definicion, REGLAS, valores);
    setHallazgos(h);
    if (hayBloqueos(h)) { setMsg({ tono: "error", texto: "Completa los campos obligatorios." }); return; }

    const nuevoId = nuevoOpId();
    const deps = filas(valores.dependencias).map((f) => txt(f.actividadId)).filter(Boolean);
    const problemas = validarDependencias(actividades ?? [], nuevoId, deps);
    if (problemas.length > 0) { setMsg({ tono: "error", texto: problemas.join(" ") }); return; }

    setEnviando(true);
    const input = construirInputActividad(programaId, valores);
    const r = await definirActividad(cola, input, { id: nuevoId });
    setEnviando(false);
    if (r.encolada) setMsg({ tono: "info", texto: "Sin conexión: la actividad se encoló y se sincronizará." });
    else if (r.error) setMsg({ tono: "error", texto: r.error.message });
    else { setMsg({ tono: "exito", texto: "Actividad definida correctamente." }); setTimeout(() => navegar(urlProgramaTab(programaId, "actividades")), 800); }
  }

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;

  return (
    <>
      <PageHeader
        titulo="Nueva actividad"
        descripcion={programa ? `Programa: ${programa.nombre}` : "Definición de actividad preventiva"}
      />
      {sinInventario && <Alert variant="advertencia" titulo="Catálogo de repuestos no disponible">No se pudieron cargar inventario ni abastecimiento; puedes indicar los ids manualmente.</Alert>}
      {msg && <Alert variant={msg.tono} titulo={msg.texto} />}
      <Card>
        <CardContent>
          <FormularioDinamico definicion={definicion} reglas={REGLAS} valores={valores} onCambio={setValores} hallazgos={hallazgos} />
          <div style={{ display: "flex", gap: "var(--do-sp-2)", justifyContent: "flex-end", marginTop: "var(--do-sp-4)" }}>
            <Button variant="fantasma" onClick={() => navegar(urlProgramaTab(programaId, "actividades"))}>Cancelar</Button>
            <Button variant="primario" disabled={enviando} onClick={() => void enviar()}>{enviando ? "Guardando…" : "Definir actividad"}</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
