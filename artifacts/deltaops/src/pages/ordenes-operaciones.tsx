/**
 * DGP-009.3 · Centro de Operaciones.
 * Bandejas del ciclo de vida (Mis órdenes, Pendientes, Nuevas, En ejecución, En
 * espera, En validación, Próximas a vencer, Críticas, Canceladas, Cerradas) con
 * búsqueda, filtros (Dynamic Forms), estados visuales y acciones inmediatas.
 */
import React, { useMemo, useState } from "react";
import { useSearch, useLocation } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Badge,
  Button,
  Spinner,
  EmptyState,
  ErrorState,
  SearchInput,
  Tabs,
  useToast,
} from "@workspace/design-system";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import { useListado } from "../lib/ordenes/hooks";
import { useActivoResumen } from "../lib/ecosistema/hooks";
import { leerParam } from "../lib/ecosistema/deep-links";
import { useOffline } from "../lib/offline/contexto";
import { transicionar } from "../lib/ordenes/mutaciones";
import { BANDEJAS, TRANSICIONES, type BandejaDef } from "../lib/ordenes/constantes";
import { TarjetaOrden, esCritica, proximaAVencer } from "../lib/ordenes/componentes";
import type { OrdenRow } from "../lib/ordenes/tipos";
import { useSesion } from "../lib/identidad/sesion";
import { capacidadesOrdenes } from "../lib/ordenes/capacidades";

export default function OrdenesOperacionesPage() {
  return (
    <ShellOrdenes activo="/ordenes">
      <Contenido />
    </ShellOrdenes>
  );
}

export function Contenido() {
  // Contexto de la URL: el deep link QR/Activo → «Ver órdenes» filtra la lista
  // por el activo (contrato `activoPrincipalId`; se acepta `activo` como alias).
  const search = useSearch();
  const [, navegar] = useLocation();
  const activoPrincipalId = useMemo(
    () => leerParam(search, "activoPrincipalId") ?? leerParam(search, "activo"),
    [search],
  );
  // Bandeja inicial vía deep link (`?bandeja=<id>`); se valida contra el
  // catálogo canónico. Sin param o inválido → «mis» (comportamiento previo).
  const bandejaInicial = useMemo(() => {
    const b = leerParam(search, "bandeja");
    return b && BANDEJAS.some((x) => x.id === b) ? b : "mis";
  }, [search]);

  // Una sola carga del read model; las bandejas derivan en cliente. Evita 10
  // peticiones simultáneas (los paneles del DS Tabs se montan todos). Cuando hay
  // contexto de activo, la consulta se filtra en servidor por `activoPrincipalId`.
  const { datos, cargando, error, recargar } = useListado(
    activoPrincipalId ? { activoPrincipalId, limit: 300 } : { limit: 300 },
  );

  return (
    <>
      <PageHeader
        titulo="Centro de Operaciones"
        descripcion="Órdenes de trabajo organizadas por bandeja del ciclo de vida."
      />
      {activoPrincipalId && (
        <FiltroContextualActivo activoId={activoPrincipalId} onQuitar={() => navegar("/ordenes")} />
      )}
      <Tabs
        key={bandejaInicial}
        etiquetaLista="Bandejas de órdenes"
        porDefecto={bandejaInicial}
        items={BANDEJAS.map((b) => ({
          id: b.id,
          etiqueta: b.etiqueta,
          contenido: <Bandeja bandeja={b} todas={datos ?? []} cargando={cargando} error={error} recargar={recargar} />,
        }))}
      />
    </>
  );
}

/** Chip visible del filtro contextual por activo, con acción de quitarlo. */
function FiltroContextualActivo({ activoId, onQuitar }: { activoId: string; onQuitar: () => void }) {
  const { datos: activo } = useActivoResumen(activoId);
  const etiqueta = activo?.nombre ?? activo?.codigoEmpresarial ?? activoId;
  return (
    <div
      role="status"
      aria-label="Filtro contextual por activo"
      style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap", margin: "var(--do-sp-2) 0 var(--do-sp-4)" }}
    >
      <Badge variant="info">🏭 Filtrando por activo: {etiqueta}</Badge>
      <Button variant="fantasma" size="sm" onClick={onQuitar}>Quitar filtro</Button>
    </div>
  );
}

function Bandeja({
  bandeja, todas, cargando, error, recargar,
}: {
  bandeja: BandejaDef;
  todas: OrdenRow[];
  cargando: boolean;
  error: Error | null;
  recargar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const ahoraMs = useMemo(() => Date.parse(new Date().toISOString()), []);
  // RBAC de PRESENTACIÓN (§22): las acciones inmediatas de transición
  // (Abrir/Planificar/Asignar/Iniciar/Pausar/Reanudar/Enviar a validación/Cancelar)
  // disparan `POST /:id/transicionar`, que el backend autoriza con
  // `modulo.ordenes.operar` → capacidad canónica `ejecutar`. CONSULTA (lector)
  // sólo lee/navega: se OCULTAN (no se deshabilitan) estos CTAs de escritura.
  const { sesion } = useSesion();
  const puedeEjecutar = capacidadesOrdenes(sesion ?? { rol: "CONSULTA" }).ejecutar;

  const filtradas = useMemo(() => {
    let lista = todas;
    if (bandeja.estado) lista = lista.filter((o) => o.estado === bandeja.estado);
    if (bandeja.id === "criticas") lista = lista.filter((o) => esCritica(o) && o.estado !== "CERRADA" && o.estado !== "CANCELADA");
    if (bandeja.id === "vencer") lista = lista.filter((o) => proximaAVencer(o, ahoraMs));
    if (bandeja.id === "mis") lista = lista.filter((o) => o.responsable != null);
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (o) =>
          o.titulo.toLowerCase().includes(q) ||
          o.codigo.toLowerCase().includes(q) ||
          (o.responsable ?? "").toLowerCase().includes(q),
      );
    }
    return lista;
  }, [todas, bandeja.id, bandeja.estado, busqueda, ahoraMs]);

  return (
    <Section
      titulo={`${bandeja.etiqueta} — ${bandeja.descripcion}`}
      acciones={
        <div style={{ minWidth: 220 }}>
          <SearchInput
            aria-label="Buscar órdenes"
            placeholder="Buscar por código, título o responsable"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onClear={() => setBusqueda("")}
          />
        </div>
      }
    >
      {cargando ? (
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
      ) : error ? (
        <ErrorState titulo="No se pudo cargar" descripcion={error.message} onReintentar={recargar} />
      ) : filtradas.length === 0 ? (
        <Card><CardContent><EmptyState titulo="Sin órdenes" descripcion="No hay órdenes en esta bandeja." /></CardContent></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
          <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{filtradas.length} orden(es)</span>
          <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))" }}>
            {filtradas.map((o) => (
              <FilaOrden key={o.id} orden={o} onCambio={recargar} puedeEjecutar={puedeEjecutar} />
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/** Tarjeta con acciones inmediatas de transición (según estado). */
export function FilaOrden({ orden, onCambio, puedeEjecutar }: { orden: OrdenRow; onCambio: () => void; puedeEjecutar: boolean }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  // Sin capacidad `ejecutar` (CONSULTA/lector) NO se ofrece ninguna transición:
  // son escrituras (`POST /:id/transicionar`, `modulo.ordenes.operar`). Se ocultan.
  const acciones = puedeEjecutar
    ? (TRANSICIONES[orden.estado] ?? []).filter((a) => !a.requiereValidacion)
    : [];

  async function ejecutar(comando: string, etiqueta: string) {
    setOcupado(true);
    try {
      const r = await transicionar(cola, orden.id, comando);
      if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
      else if (r.encolada) toast.mostrar({ variant: "info", titulo: "Sin conexión", mensaje: `«${etiqueta}» quedó en cola.` });
      else {
        toast.mostrar({ variant: "exito", titulo: "Listo", mensaje: `${etiqueta} aplicado.` });
        onCambio();
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <TarjetaOrden orden={orden} />
      {acciones.length > 0 && (
        <div style={{ display: "flex", gap: "var(--do-sp-1)", flexWrap: "wrap", marginTop: "calc(-1 * var(--do-sp-2))", padding: "0 var(--do-sp-3) var(--do-sp-3)" }}>
          {acciones.map((a) => (
            <Button
              key={a.comando}
              variant={a.comando === "cancelar" ? "peligro" : "primario"}
              size="sm"
              disabled={ocupado}
              onClick={() => void ejecutar(a.comando, a.etiqueta)}
            >
              {a.etiqueta}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
