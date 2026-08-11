/**
 * DGP-007 · Galería técnica de los motores de DeltaOps.
 *
 * Presentación DOCUMENTAL (solo lectura) de:
 *  - Workflow Engine: definición neutra renderizada como estados/transiciones.
 *  - Modos de aprobación.
 *  - Dynamic Forms Engine: catálogo de tipos de campo con ejemplos estáticos.
 *
 * Usa EXCLUSIVAMENTE componentes del Design System. Los tipos de campo sin
 * componente nativo (firma, ubicación, QR, barras, NFC) se representan con el
 * componente DS más cercano + Badge "captura especializada". No se crean widgets.
 */
import { Link } from "wouter";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Field,
  Input,
  Textarea,
  Select,
  Checkbox,
  Switch as DoSwitch,
  Table as DoTable,
  Timeline,
  Tabs,
  PageHeader,
  Section,
  ThemeProvider,
} from "@workspace/design-system";
import {
  operacionesEstandarEfectivas,
  type TransicionWorkflow,
} from "@workspace/workflow-engine/definicion";
import {
  MODOS_APROBACION,
  type ModoAprobacion,
} from "@workspace/workflow-engine/aprobaciones";
import type { TipoCampoHoja } from "@workspace/dynamic-forms/definicion";
import {
  definicionWorkflowEjemplo,
  definicionFormularioEjemplo,
} from "@/lib/motores-ejemplos";

/* ---------------------------- Workflow Engine ----------------------------- */

const TONO_ESTADO: Record<string, "neutro" | "primario" | "exito" | "error" | "info"> = {
  borrador: "neutro",
  enRevision: "info",
  aprobada: "exito",
  rechazada: "error",
  cerrada: "primario",
};

function estadoBadge(nombre: string, etiqueta?: string) {
  const wf = definicionWorkflowEjemplo;
  const estado = wf.estados.find((e) => e.nombre === nombre);
  const variant =
    estado?.inicial ? "primario" : estado?.final ? "info" : "neutro";
  return (
    <Badge variant={variant as never}>
      {etiqueta ?? estado?.etiqueta ?? nombre}
    </Badge>
  );
}

function GaleriaWorkflow() {
  const wf = definicionWorkflowEjemplo;
  const ops = operacionesEstandarEfectivas(wf);

  const eventosTransiciones = wf.transiciones.map((t: TransicionWorkflow) => ({
    titulo: (
      <span style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center", flexWrap: "wrap" }}>
        {estadoBadge(t.de)}
        <span aria-hidden style={{ color: "var(--do-texto-suave)" }}>→</span>
        {estadoBadge(t.a)}
        <code style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>
          {t.comando}
        </code>
      </span>
    ),
    descripcion: (
      <span style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
        {t.permiso && <span>Permiso: <code>{t.permiso}</code></span>}
        {t.precondiciones && t.precondiciones.length > 0 && (
          <span>Precondiciones: {t.precondiciones.length} regla(s) declarativa(s)</span>
        )}
        {t.aprobacion && (
          <span>
            Aprobación requerida (gate): <code>{t.aprobacion.nombre}</code> · modo{" "}
            <code>{t.aprobacion.modo}</code>
            {t.rechazoA && <> · rechazo → <code>{t.rechazoA}</code></>}
          </span>
        )}
      </span>
    ),
    tono: (TONO_ESTADO[t.a] ?? "neutro") as never,
  }));

  return (
    <Section titulo="Workflow Engine · definición declarativa">
      <p style={{ color: "var(--do-texto-suave)", marginBottom: "var(--do-sp-3)" }}>
        Definición neutra de ejemplo (<code>{wf.clave}</code>): estados, transiciones con
        guardas declarativas y operaciones estándar integradas. Todo son DATOS que el motor
        interpreta; aquí se renderizan solo como documentación.
      </p>

      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", marginBottom: "var(--do-sp-4)" }}>
        {wf.estados.map((e) => (
          <Card key={e.nombre}>
            <CardHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <span style={{ fontWeight: "var(--do-peso-semibold)" }}>{e.etiqueta ?? e.nombre}</span>
                {estadoBadge(e.nombre)}
              </div>
            </CardHeader>
            <CardContent>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)" }}>
                {e.inicial && <Badge variant="primario">Inicial</Badge>}
                {e.final && <Badge variant="info">Final</Badge>}
                {e.suspendible && <Badge variant="advertencia">Suspendible</Badge>}
                {!e.inicial && !e.final && !e.suspendible && <Badge>Intermedio</Badge>}
              </div>
              <code style={{ display: "block", marginTop: "var(--do-sp-2)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                {e.nombre}
              </code>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <span style={{ fontWeight: "var(--do-peso-semibold)" }}>Transiciones (Transition Engine)</span>
        </CardHeader>
        <CardContent>
          <Timeline eventos={eventosTransiciones} label="Transiciones del workflow" />
        </CardContent>
      </Card>

      <div style={{ marginTop: "var(--do-sp-4)" }}>
        <h4 style={{ fontWeight: "var(--do-peso-semibold)", marginBottom: "var(--do-sp-2)" }}>Operaciones estándar</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)" }}>
          {ops.cancelar && <Badge variant="error">cancelar → {ops.cancelar.estado}</Badge>}
          {ops.reabrir && <Badge variant="info">reabrir → {ops.reabrir.a}</Badge>}
          {ops.suspender && <Badge variant="advertencia">suspender → {ops.suspender.estado}</Badge>}
          {ops.reanudar && <Badge>reanudar</Badge>}
        </div>
      </div>
    </Section>
  );
}

/* --------------------------- Modos de aprobación -------------------------- */

const DESCRIPCION_MODO: Record<ModoAprobacion, string> = {
  individual: "Una sola decisión de un aprobador autorizado resuelve la transición.",
  paralela: "Varios aprobadores en paralelo; se resuelve al alcanzar el mínimo declarado.",
  secuencial: "Aprobadores por turnos, en el orden declarado.",
  mayoria: "Se aprueba cuando la mayoría de los aprobadores decide a favor.",
  unanimidad: "Requiere que todos los aprobadores estén de acuerdo.",
};

function GaleriaAprobaciones() {
  return (
    <Section titulo="Modos de aprobación">
      <DoTable caption="Modos soportados por el Workflow Engine">
        <thead>
          <tr>
            <th>Modo</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {MODOS_APROBACION.map((m) => (
            <tr key={m}>
              <td><Badge variant="primario">{m}</Badge></td>
              <td>{DESCRIPCION_MODO[m]}</td>
            </tr>
          ))}
        </tbody>
      </DoTable>
    </Section>
  );
}

/* -------------------------- Dynamic Forms Engine -------------------------- */

interface CatalogoTipo {
  tipo: TipoCampoHoja;
  etiqueta: string;
  ejemplo: React.ReactNode;
  especializado?: boolean;
}

function ejemploTexto(placeholder: string) {
  return <Input placeholder={placeholder} readOnly />;
}

const CATALOGO_TIPOS: CatalogoTipo[] = [
  { tipo: "texto", etiqueta: "Texto", ejemplo: ejemploTexto("Texto de ejemplo") },
  { tipo: "numero", etiqueta: "Número entero", ejemplo: <Input type="number" placeholder="0" readOnly /> },
  { tipo: "decimal", etiqueta: "Decimal", ejemplo: <Input type="number" step="0.01" placeholder="0,00" readOnly /> },
  { tipo: "fecha", etiqueta: "Fecha", ejemplo: <Input type="date" readOnly /> },
  { tipo: "hora", etiqueta: "Hora", ejemplo: <Input type="time" readOnly /> },
  { tipo: "fechaHora", etiqueta: "Fecha y hora", ejemplo: <Input type="datetime-local" readOnly /> },
  { tipo: "booleano", etiqueta: "Booleano", ejemplo: <DoSwitch label="Habilitado" defaultChecked readOnly /> },
  {
    tipo: "select",
    etiqueta: "Selección",
    ejemplo: (
      <Select defaultValue="a">
        <option value="a">Opción A</option>
        <option value="b">Opción B</option>
      </Select>
    ),
  },
  {
    tipo: "multiSelect",
    etiqueta: "Selección múltiple",
    ejemplo: (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
        <Checkbox label="Opción A" defaultChecked />
        <Checkbox label="Opción B" />
      </div>
    ),
  },
  {
    tipo: "autocomplete",
    etiqueta: "Autocompletado",
    ejemplo: <Input placeholder="Escriba para buscar…" readOnly />,
  },
  {
    tipo: "tabla",
    etiqueta: "Tabla (subcampos por fila)",
    ejemplo: (
      <DoTable caption="Filas de ejemplo">
        <thead><tr><th>Concepto</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td>Fila 1</td><td>10</td></tr>
          <tr><td>Fila 2</td><td>20</td></tr>
        </tbody>
      </DoTable>
    ),
  },
  { tipo: "adjunto", etiqueta: "Adjunto", ejemplo: <Input type="file" disabled /> },
  { tipo: "imagen", etiqueta: "Imagen", ejemplo: <Input type="file" accept="image/*" disabled /> },
  {
    tipo: "checklist",
    etiqueta: "Checklist embebido",
    ejemplo: (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
        <Checkbox label="Ítem de verificación 1" defaultChecked />
        <Checkbox label="Ítem de verificación 2" />
        <Checkbox label="Ítem de verificación 3" />
      </div>
    ),
  },
  {
    tipo: "firma",
    etiqueta: "Firma",
    especializado: true,
    ejemplo: <Textarea rows={2} placeholder="Área reservada para firma capturada" readOnly />,
  },
  {
    tipo: "ubicacion",
    etiqueta: "Ubicación",
    especializado: true,
    ejemplo: ejemploTexto("lat, lng (captura por dispositivo)"),
  },
  {
    tipo: "codigoQr",
    etiqueta: "Código QR",
    especializado: true,
    ejemplo: ejemploTexto("Valor escaneado"),
  },
  {
    tipo: "codigoBarras",
    etiqueta: "Código de barras",
    especializado: true,
    ejemplo: ejemploTexto("Valor escaneado"),
  },
  {
    tipo: "nfc",
    etiqueta: "Etiqueta NFC",
    especializado: true,
    ejemplo: ejemploTexto("Identificador leído"),
  },
];

function GaleriaCampos() {
  return (
    <Section titulo="Dynamic Forms Engine · catálogo de tipos de campo">
      <p style={{ color: "var(--do-texto-suave)", marginBottom: "var(--do-sp-3)" }}>
        Un formulario se describe 100% como datos. Cada tipo de campo se renderiza con el
        componente del Design System más apropiado. Los tipos de captura especializada
        (firma, ubicación, QR, barras, NFC) no tienen widget nativo: se representan con el
        componente DS más cercano y una marca <Badge variant="advertencia">captura especializada</Badge>.
      </p>
      <div style={{ display: "grid", gap: "var(--do-sp-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
        {CATALOGO_TIPOS.map((c) => (
          <Card key={c.tipo}>
            <CardHeader>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)" }}>
                <span style={{ fontWeight: "var(--do-peso-semibold)" }}>{c.etiqueta}</span>
                {c.especializado && <Badge variant="advertencia">captura especializada</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <Field label={<code style={{ fontFamily: "var(--do-font-mono)", fontSize: "var(--do-text-xs)" }}>{c.tipo}</code>}>
                {c.ejemplo}
              </Field>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------- Página ---------------------------------- */

function contarCampos() {
  // Cuenta campos hoja recorriendo la definición de ejemplo (documental).
  let total = 0;
  const visitar = (nodos: readonly unknown[]) => {
    for (const n of nodos as { clase: string; hijos?: unknown[]; pasos?: { hijos: unknown[] }[] }[]) {
      if (n.clase === "campo") total += 1;
      else if (n.pasos) n.pasos.forEach((p) => visitar(p.hijos));
      else if (n.hijos) visitar(n.hijos);
    }
  };
  visitar(definicionFormularioEjemplo.nodos);
  return total;
}

export default function MotoresPage() {
  return (
    <ThemeProvider>
      <div className="do-root" style={{ minHeight: "100vh", background: "var(--do-bg)", padding: "var(--do-sp-6)" }}>
        <div style={{ maxWidth: "var(--do-max-ancho)", margin: "0 auto", display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }}>
          <PageHeader
            titulo="Motores · Workflow & Dynamic Forms"
            descripcion={`Galería técnica documental de los motores neutros de DeltaOps. Formulario de ejemplo con ${contarCampos()} campos.`}
            acciones={
              <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
                <Link href="/motores/playground">
                  <Button variant="primario">Abrir playground</Button>
                </Link>
                <Link href="/">
                  <Button variant="secundario">Volver a la consola</Button>
                </Link>
              </div>
            }
          />

          <Tabs
            items={[
              { id: "workflow", etiqueta: "Workflow Engine", contenido: <><GaleriaWorkflow /><Divider /><GaleriaAprobaciones /></> },
              { id: "forms", etiqueta: "Dynamic Forms Engine", contenido: <GaleriaCampos /> },
            ]}
          />
        </div>
      </div>
    </ThemeProvider>
  );
}
