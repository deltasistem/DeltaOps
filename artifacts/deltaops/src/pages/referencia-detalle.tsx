import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Archive, Box, CheckCircle2, MessageSquare, Paperclip, History, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { enqueueOp } from "./referencia";

/**
 * DGP-004 · Detalle del Elemento de Referencia.
 * Aggregate + read model, transiciones (activar/archivar), edición con
 * concurrencia optimista, timeline, comentarios y adjuntos (shared services).
 */
const API = "/api/deltaops/referencia";

interface Elemento {
  id: string; nombre: string; descripcion: string; estado: string;
  version: number; createdBy: string; createdAt: string; updatedAt: string;
}
interface TimelineEntry { id: string; data: { eventType?: string; payload?: Record<string, unknown>; occurredAt?: string } }
interface Comentario { id: string; data: { texto: string; menciones: string[] }; createdBy: string; createdAt: string }

export default function ReferenciaDetalle() {
  const [, params] = useRoute("/referencia/:id");
  const id = params?.id ?? "";
  const { toast } = useToast();
  const [elemento, setElemento] = useState<Elemento | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [adjuntos, setAdjuntos] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [texto, setTexto] = useState("");

  const refetch = useCallback(async () => {
    const r = await fetch(`${API}/${id}`);
    if (r.status === 401) { window.location.assign(`${import.meta.env.BASE_URL}login`); return; }
    if (r.ok) {
      const body = await r.json();
      setElemento(body.elemento);
      setNombre(body.elemento.nombre);
      setDescripcion(body.elemento.descripcion);
    }
    for (const [path, set] of [
      ["timeline", setTimeline], ["comentarios", setComentarios], ["adjuntos", setAdjuntos],
    ] as const) {
      const rr = await fetch(`${API}/${id}/${path}`);
      if (rr.ok) set(await rr.json());
    }
  }, [id]);

  useEffect(() => { void refetch(); }, [refetch]);

  const accion = async (path: string, body: Record<string, unknown>, etiqueta: string) => {
    const comando = path === "" ? "editar" : (path.slice(1) as "activar" | "archivar");
    try {
      const r = await fetch(`${API}/${id}${path}`, {
        method: path === "" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const resBody = await r.json();
      if (!r.ok) { toast({ title: `Error: ${etiqueta}`, description: resBody.error, variant: "destructive" }); return; }
      toast({ title: etiqueta });
      setEditando(false);
      void refetch();
    } catch {
      // Sin red: la mutación se encola offline (con expectedVersion para
      // conflicto determinista) y se aplica en la próxima sincronización.
      enqueueOp({ opId: crypto.randomUUID(), comando, input: { id, ...body }, etiqueta });
      toast({ title: "Sin conexión", description: `${etiqueta} — operación encolada offline` });
    }
  };

  if (!elemento) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground font-mono text-sm">Cargando…</div>;
  }

  const v = elemento.version;
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm px-6 py-3 flex items-center gap-4">
        <Link href="/referencia" className="text-muted-foreground hover:text-foreground" data-testid="link-volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="bg-primary/10 p-2 rounded-md text-primary"><Box className="h-5 w-5" /></div>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight leading-none" data-testid="text-nombre">{elemento.nombre}</h1>
          <p className="text-xs font-mono text-muted-foreground mt-1">
            {elemento.id} · v{v} · creado por {elemento.createdBy}
          </p>
        </div>
        <Badge variant={elemento.estado === "ACTIVO" ? "default" : elemento.estado === "ARCHIVADO" ? "secondary" : "outline"}
          className="font-mono" data-testid="badge-estado">{elemento.estado}</Badge>
        {elemento.estado === "BORRADOR" && (
          <Button size="sm" onClick={() => void accion("/activar", { expectedVersion: v }, "Elemento activado")} data-testid="button-activar">
            <CheckCircle2 className="h-4 w-4 mr-1" />Activar
          </Button>
        )}
        {elemento.estado !== "ARCHIVADO" && (
          <Button size="sm" variant="secondary" onClick={() => void accion("/archivar", { expectedVersion: v }, "Elemento archivado")} data-testid="button-archivar">
            <Archive className="h-4 w-4 mr-1" />Archivar
          </Button>
        )}
      </header>

      <main className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle className="text-lg">Detalle</CardTitle>
              <CardDescription>Aggregate (fuente de verdad)</CardDescription></div>
            {elemento.estado !== "ARCHIVADO" && (
              <Button variant="outline" size="sm" onClick={() => setEditando((e) => !e)} data-testid="button-editar">
                <Pencil className="h-4 w-4 mr-1" />{editando ? "Cancelar" : "Editar"}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {editando ? (
              <>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} data-testid="input-editar-nombre" />
                <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} data-testid="input-editar-descripcion" />
                <Button size="sm" data-testid="button-guardar"
                  onClick={() => void accion("", { expectedVersion: v, nombre, descripcion }, "Elemento actualizado")}>
                  Guardar (v{v} → v{v + 1})
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-descripcion">
                {elemento.descripcion || "Sin descripción."}
              </p>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline" data-testid="tab-timeline"><History className="h-4 w-4 mr-1" />Timeline</TabsTrigger>
            <TabsTrigger value="comentarios" data-testid="tab-comentarios"><MessageSquare className="h-4 w-4 mr-1" />Comentarios ({comentarios.length})</TabsTrigger>
            <TabsTrigger value="adjuntos" data-testid="tab-adjuntos"><Paperclip className="h-4 w-4 mr-1" />Adjuntos ({adjuntos.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline">
            <Card><CardContent className="pt-6 space-y-3">
              {timeline.length === 0 && <p className="text-sm text-muted-foreground">Sin actividad proyectada aún.</p>}
              {timeline.map((t) => (
                <div key={t.id} className="flex items-start gap-3 text-sm" data-testid={`timeline-${t.id}`}>
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div>
                    <p className="font-mono text-xs">{String(t.data.eventType ?? "evento")}</p>
                    <p className="text-xs text-muted-foreground">{String(t.data.occurredAt ?? "")}</p>
                  </div>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="comentarios">
            <Card><CardContent className="pt-6 space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Escriba un comentario (@usuario para mencionar)" value={texto}
                  onChange={(e) => setTexto(e.target.value)} data-testid="input-comentario" />
                <Button size="sm" disabled={!texto.trim()} data-testid="button-comentar"
                  onClick={async () => {
                    await accion("/comentarios", { texto }, "Comentario publicado");
                    setTexto("");
                  }}>Comentar</Button>
              </div>
              {comentarios.map((c) => (
                <div key={c.id} className="border-l-2 border-border pl-3" data-testid={`comentario-${c.id}`}>
                  <p className="text-sm">{c.data.texto}</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {c.createdBy} · {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="adjuntos">
            <Card><CardContent className="pt-6 space-y-2">
              {adjuntos.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Sin adjuntos. Los adjuntos se registran vía platform.attachment con entityRef ref:{elemento.id}.
                </p>
              )}
              {adjuntos.map((a) => (
                <p key={a.id} className="text-sm font-mono" data-testid={`adjunto-${a.id}`}>
                  {String(a.data["nombreArchivo"] ?? a.id)} · v{String(a.data["fileVersion"] ?? 1)}
                </p>
              ))}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
