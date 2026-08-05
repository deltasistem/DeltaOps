/**
 * DGP-009.3 · Centro de Planificación.
 *
 * Calendario semanal + agenda con reprogramación por arrastrar y soltar (drag &
 * drop nativo, accesible con alternativa por teclado), conflictos visibles,
 * ventanas y carga por técnico. La reprogramación llama a `planificar` (con
 * degradación offline).
 */
import React, { useMemo, useState } from "react";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Spinner,
  ErrorState,
  EmptyState,
  Alert,
  Modal,
  useToast,
} from "@workspace/design-system";
import { ShellOrdenes } from "../lib/ordenes/Shell";
import { useAgenda } from "../lib/ordenes/hooks";
import { useOffline } from "../lib/offline/contexto";
import { planificar } from "../lib/ordenes/mutaciones";
import { FormularioDinamico, useFormularioDinamico } from "../lib/forms/FormularioDinamico";
import { plantillaPlanificacion } from "../lib/forms/plantillas-ordenes";
import { BadgeEstado } from "../lib/ordenes/componentes";
import type { EntradaAgenda } from "../lib/ordenes/tipos";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function inicioSemana(base: Date): Date {
  const d = new Date(base);
  const dia = (d.getUTCDay() + 6) % 7; // lunes = 0
  d.setUTCDate(d.getUTCDate() - dia);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export default function OrdenesPlanificacionPage() {
  return (
    <ShellOrdenes activo="/ordenes/planificacion">
      <Planificacion />
    </ShellOrdenes>
  );
}

export function Planificacion({ hoyIso }: { hoyIso?: string }) {
  // `hoyIso` inyectable para pruebas deterministas; por defecto, ahora.
  const base = useMemo(() => (hoyIso ? new Date(hoyIso) : new Date()), [hoyIso]);
  const [offsetSemanas, setOffsetSemanas] = useState(0);

  const lunes = useMemo(() => {
    const d = inicioSemana(base);
    d.setUTCDate(d.getUTCDate() + offsetSemanas * 7);
    return d;
  }, [base, offsetSemanas]);

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  }), [lunes]);

  const desde = ymd(lunes);
  const finSemana = new Date(lunes);
  finSemana.setUTCDate(finSemana.getUTCDate() + 7);
  const hasta = ymd(finSemana);

  const { datos, cargando, error, recargar } = useAgenda(desde, hasta);

  return (
    <>
      <PageHeader
        titulo="Centro de Planificación"
        descripcion="Calendario semanal y agenda. Arrastra una orden a otro día para reprogramarla."
        acciones={
          <div style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            <Button variant="secundario" size="sm" onClick={() => setOffsetSemanas((o) => o - 1)}>← Semana anterior</Button>
            <Button variant="fantasma" size="sm" onClick={() => setOffsetSemanas(0)}>Hoy</Button>
            <Button variant="secundario" size="sm" onClick={() => setOffsetSemanas((o) => o + 1)}>Semana siguiente →</Button>
          </div>
        }
      />
      {error ? (
        <ErrorState titulo="No se pudo cargar la agenda" descripcion={error.message} onReintentar={recargar} />
      ) : cargando ? (
        <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-8)" }}><Spinner /></div>
      ) : (
        <Calendario dias={dias} entradas={datos ?? []} onCambio={recargar} />
      )}
    </>
  );
}

export function Calendario({ dias, entradas, onCambio }: { dias: Date[]; entradas: EntradaAgenda[]; onCambio: () => void }) {
  const { cola } = useOffline();
  const toast = useToast();
  const [reprogramar, setReprogramar] = useState<EntradaAgenda | null>(null);

  // Agrupa por día (usa inicioPlanificado o ventanaInicio).
  const porDia = useMemo(() => {
    const mapa = new Map<string, EntradaAgenda[]>();
    for (const e of entradas) {
      const iso = e.inicioPlanificado ?? e.ventanaInicio;
      const clave = iso ? iso.slice(0, 10) : "sin-fecha";
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(e);
    }
    return mapa;
  }, [entradas]);

  const sinFecha = porDia.get("sin-fecha") ?? [];

  async function mover(entrada: EntradaAgenda, diaIso: string) {
    // Conserva la hora original si existía; si no, 09:00 UTC.
    const horaOriginal = entrada.inicioPlanificado?.slice(11, 19) ?? "09:00:00";
    const inicioPlanificado = `${diaIso}T${horaOriginal}Z`;
    const r = await planificar(cola, entrada.id, { inicioPlanificado });
    if (r.error) toast.mostrar({ variant: "error", titulo: "Error", mensaje: r.error.message });
    else { toast.mostrar({ variant: r.encolada ? "info" : "exito", titulo: r.encolada ? "Reprogramación en cola" : "Reprogramada" }); onCambio(); }
  }

  return (
    <>
      <Section titulo="Semana">
        <div style={{ display: "grid", gap: "var(--do-sp-2)", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {dias.map((d) => {
            const iso = ymd(d);
            const items = porDia.get(iso) ?? [];
            return (
              <ColumnaDia
                key={iso}
                fecha={d}
                iso={iso}
                items={items}
                onSoltar={(e) => void mover(e, iso)}
                onReprogramar={setReprogramar}
              />
            );
          })}
        </div>
      </Section>

      {sinFecha.length > 0 && (
        <Section titulo="Sin fecha planificada">
          <div style={{ display: "grid", gap: "var(--do-sp-3)", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {sinFecha.map((e) => <TarjetaEntrada key={e.id} entrada={e} onReprogramar={setReprogramar} />)}
          </div>
        </Section>
      )}

      {reprogramar && (
        <ModalPlanificacion
          entrada={reprogramar}
          onCerrar={() => setReprogramar(null)}
          onGuardado={() => { setReprogramar(null); onCambio(); }}
        />
      )}
    </>
  );
}

function ColumnaDia({
  fecha, iso, items, onSoltar, onReprogramar,
}: {
  fecha: Date;
  iso: string;
  items: EntradaAgenda[];
  onSoltar: (e: EntradaAgenda) => void;
  onReprogramar: (e: EntradaAgenda) => void;
}) {
  const [sobre, setSobre] = useState(false);
  const nombreDia = fecha.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  return (
    <Card>
      <CardHeader>
        <span style={{ fontSize: "var(--do-text-sm)", textTransform: "capitalize" }}>{nombreDia}</span>{" "}
        <Badge variant="neutro">{items.length}</Badge>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
          onDragLeave={() => setSobre(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSobre(false);
            const id = e.dataTransfer.getData("text/plain");
            const entrada = items.find((x) => x.id === id) ?? undefined;
            // La entrada puede venir de otra columna: reconstruimos mínimamente.
            onSoltar(entrada ?? ({ id } as EntradaAgenda));
          }}
          style={{
            minHeight: 80,
            display: "flex",
            flexDirection: "column",
            gap: "var(--do-sp-2)",
            padding: "var(--do-sp-1)",
            borderRadius: "var(--do-radius-sm)",
            outline: sobre ? "2px dashed var(--do-primario)" : "none",
          }}
          aria-label={`Sueltos del ${iso}`}
        >
          {items.length === 0 ? (
            <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>—</span>
          ) : (
            items.map((e) => <TarjetaEntrada key={e.id} entrada={e} onReprogramar={onReprogramar} arrastrable />)
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TarjetaEntrada({
  entrada, onReprogramar, arrastrable,
}: {
  entrada: EntradaAgenda;
  onReprogramar: (e: EntradaAgenda) => void;
  arrastrable?: boolean;
}) {
  return (
    <div
      draggable={arrastrable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", entrada.id)}
      style={{
        border: "1px solid var(--do-borde)",
        borderRadius: "var(--do-radius-sm)",
        padding: "var(--do-sp-2)",
        background: "var(--do-surface)",
        cursor: arrastrable ? "grab" : "default",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-1)", alignItems: "center", flexWrap: "wrap" }}>
        <code style={{ fontSize: "var(--do-text-xs)" }}>{entrada.codigo}</code>
        <BadgeEstado estado={entrada.estado} />
      </div>
      <div style={{ fontSize: "var(--do-text-sm)" }}>{entrada.titulo}</div>
      {entrada.enConflicto && <Badge variant="error">Conflicto</Badge>}
      {entrada.responsable && (
        <div style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{entrada.responsable}</div>
      )}
      <Button variant="fantasma" size="sm" onClick={() => onReprogramar(entrada)}>Reprogramar</Button>
    </div>
  );
}

function ModalPlanificacion({ entrada, onCerrar, onGuardado }: { entrada: EntradaAgenda; onCerrar: () => void; onGuardado: () => void }) {
  const { cola } = useOffline();
  const def = useMemo(() => plantillaPlanificacion(), []);
  const form = useFormularioDinamico(def, {}, {
    inicioPlanificado: entrada.inicioPlanificado ?? "",
    finPlanificado: entrada.finPlanificado ?? "",
    ventanaInicio: entrada.ventanaInicio ?? "",
    ventanaFin: entrada.ventanaFin ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    if (!form.esValido()) { setErr("Indica al menos el inicio planificado."); return; }
    setGuardando(true);
    setErr(null);
    const datos: Record<string, unknown> = {};
    for (const k of ["inicioPlanificado", "finPlanificado", "ventanaInicio", "ventanaFin"]) {
      const v = form.valores[k];
      if (v) datos[k] = String(v);
    }
    const r = await planificar(cola, entrada.id, datos);
    setGuardando(false);
    if (r.error) setErr(r.error.message);
    else onGuardado();
  }

  return (
    <Modal
      abierto
      onClose={onCerrar}
      titulo={`Reprogramar ${entrada.codigo}`}
      pie={
        <>
          <Button variant="fantasma" onClick={onCerrar}>Cancelar</Button>
          <Button variant="primario" loading={guardando} onClick={() => void guardar()}>Guardar</Button>
        </>
      }
    >
      {err && <Alert variant="error" titulo={err} />}
      {entrada.enConflicto && <Alert variant="advertencia" titulo="Esta orden presenta un conflicto de programación." />}
      <FormularioDinamico definicion={def} valores={form.valores} onCambio={form.setValores} hallazgos={form.hallazgos} />
    </Modal>
  );
}
