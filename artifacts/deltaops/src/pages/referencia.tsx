import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft, Box, CloudOff, Cloud, LayoutDashboard, ListChecks, Plus,
  RefreshCw, Settings2, TerminalSquare, Wand2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * DGP-004 · Módulo de Referencia ("Elemento de Referencia").
 * Pantallas funcionales del módulo neutro: listado, creación, dashboard,
 * configuración por tenant y consola técnica del módulo. Reutiliza el shell
 * visual de DeltaOps; incluye cola offline con sincronización e idempotencia.
 */
const API = "/api/deltaops/referencia";

interface ElementoRow {
  id: string; nombre: string; descripcion: string; estado: string;
  version: number; actualizadoAt: string;
}
interface PendingOp {
  opId: string;
  comando: "crear" | "editar" | "activar" | "archivar";
  input: Record<string, unknown>;
  etiqueta: string;
}

const QUEUE_KEY = "deltaops.referencia.cola-offline";
const CONFLICTS_KEY = "deltaops.referencia.conflictos-sync";

export function loadQueue(): PendingOp[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as PendingOp[]; }
  catch { return []; }
}
export function saveQueue(ops: PendingOp[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(ops));
}
/** Encola una operación offline desde cualquier pantalla del módulo. */
export function enqueueOp(op: PendingOp): void {
  saveQueue([...loadQueue(), op]);
}
export function loadConflicts(): string[] {
  try { return JSON.parse(localStorage.getItem(CONFLICTS_KEY) ?? "[]") as string[]; }
  catch { return []; }
}
export function saveConflicts(items: string[]): void {
  localStorage.setItem(CONFLICTS_KEY, JSON.stringify(items));
}
export type { PendingOp };

function estadoBadge(estado: string) {
  const variant = estado === "ACTIVO" ? "default" : estado === "ARCHIVADO" ? "secondary" : "outline";
  return <Badge variant={variant} className="font-mono text-xs">{estado}</Badge>;
}

export default function Referencia() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [elementos, setElementos] = useState<ElementoRow[] | null>(null);
  const [dashboard, setDashboard] = useState<{ total: number; porEstado: Record<string, number> } | null>(null);
  const [consola, setConsola] = useState<Record<string, unknown> | null>(null);
  const [queue, setQueue] = useState<PendingOp[]>(loadQueue());
  const [offline, setOffline] = useState(false);
  const [conflictos, setConflictos] = useState<string[]>(loadConflicts());
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [abierto, setAbierto] = useState(false);

  const refetch = useCallback(async () => {
    for (const [path, set] of [
      ["", setElementos], ["/dashboard", setDashboard], ["/consola", setConsola],
    ] as const) {
      const r = await fetch(`${API}${path}`);
      if (r.status === 401) { window.location.assign(`${import.meta.env.BASE_URL}login`); return; }
      if (r.ok) set(await r.json());
    }
  }, []);

  useEffect(() => { void refetch(); }, [refetch]);

  const encolar = (op: PendingOp) => {
    const next = [...queue, op];
    setQueue(next); saveQueue(next);
    toast({ title: "Operación en cola offline", description: op.etiqueta });
  };

  const crear = async () => {
    const id = crypto.randomUUID(); // id de cliente → idempotencia en sync
    const input = { id, nombre, descripcion };
    setAbierto(false); setNombre(""); setDescripcion("");
    if (offline) { encolar({ opId: id, comando: "crear", input, etiqueta: `Crear "${nombre}"` }); return; }
    const r = await fetch(API, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
    const body = await r.json();
    if (!r.ok) { toast({ title: "Error al crear", description: body.error, variant: "destructive" }); return; }
    toast({ title: "Elemento creado", description: nombre });
    void refetch();
  };

  const sugerir = async () => {
    if (!nombre) return;
    const r = await fetch(`${API}/sugerir-descripcion`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre }),
    });
    if (r.ok) setDescripcion((await r.json()).sugerencia ?? "");
  };

  const sincronizar = async () => {
    if (queue.length === 0) return;
    const r = await fetch(`${API}/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(queue),
    });
    if (!r.ok) { toast({ title: "Sincronización fallida", variant: "destructive" }); return; }
    const { resultados } = await r.json() as { resultados: { opId: string; ok: boolean; code?: string; error?: string }[] };
    const fallidas = resultados.filter((x) => !x.ok);
    // Solo se descartan las operaciones APLICADAS; las fallidas quedan
    // registradas de forma durable para reconciliación manual del usuario.
    const okIds = new Set(resultados.filter((x) => x.ok).map((x) => x.opId));
    const restante = queue.filter((op) => !okIds.has(op.opId) && !fallidas.some((f) => f.opId === op.opId));
    const nuevosConflictos = [
      ...conflictos,
      ...fallidas.map((f) => {
        const op = queue.find((q) => q.opId === f.opId);
        return `${op?.etiqueta ?? f.opId.slice(0, 8)} → ${f.code}: ${f.error}`;
      }),
    ];
    setConflictos(nuevosConflictos); saveConflicts(nuevosConflictos);
    setQueue(restante); saveQueue(restante);
    toast({
      title: `Sincronización: ${resultados.length - fallidas.length} aplicadas, ${fallidas.length} en conflicto`,
    });
    void refetch();
  };

  const setConfig = async (clave: string, value: string) => {
    const r = await fetch(`${API}/config/${clave}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }),
    });
    if (r.ok) { toast({ title: "Configuración actualizada", description: `${clave} = ${value}` }); void refetch(); }
    else toast({ title: "No se pudo actualizar", variant: "destructive" });
  };

  const cfg = (consola?.configuracion ?? {}) as Record<string, string>;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground" data-testid="link-volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="bg-primary/10 p-2 rounded-md text-primary"><Box className="h-5 w-5" /></div>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight leading-none">Elementos de Referencia</h1>
          <p className="text-xs font-mono text-muted-foreground uppercase mt-1">Módulo patrón · DGP-004</p>
        </div>
        <Button
          variant={offline ? "destructive" : "outline"} size="sm" data-testid="button-offline"
          onClick={() => setOffline((v) => !v)}
        >
          {offline ? <CloudOff className="h-4 w-4 mr-1" /> : <Cloud className="h-4 w-4 mr-1" />}
          {offline ? "Modo offline" : "En línea"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void sincronizar()} disabled={queue.length === 0} data-testid="button-sync">
          <RefreshCw className="h-4 w-4 mr-1" />Sincronizar ({queue.length})
        </Button>
      </header>

      <main className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
        {conflictos.length > 0 && (
          <Card className="border-destructive/50" data-testid="card-conflictos">
            <CardHeader><CardTitle className="text-base text-destructive">Conflictos de sincronización</CardTitle>
              <CardDescription>Operaciones offline rechazadas (versión obsoleta o policy)</CardDescription></CardHeader>
            <CardContent className="font-mono text-xs space-y-1">
              {conflictos.map((c) => <p key={c}>{c}</p>)}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="elementos">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="elementos" data-testid="tab-elementos"><ListChecks className="h-4 w-4 mr-1" />Elementos</TabsTrigger>
            <TabsTrigger value="dashboard" data-testid="tab-dashboard"><LayoutDashboard className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
            <TabsTrigger value="config" data-testid="tab-config"><Settings2 className="h-4 w-4 mr-1" />Configuración</TabsTrigger>
            <TabsTrigger value="consola" data-testid="tab-consola"><TerminalSquare className="h-4 w-4 mr-1" />Consola del módulo</TabsTrigger>
          </TabsList>

          <TabsContent value="elementos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Listado</CardTitle>
                  <CardDescription>Read model del módulo (CQRS)</CardDescription>
                </div>
                <Dialog open={abierto} onOpenChange={setAbierto}>
                  <DialogTrigger asChild>
                    <Button size="sm" data-testid="button-crear"><Plus className="h-4 w-4 mr-1" />Nuevo elemento</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Crear Elemento de Referencia</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} data-testid="input-nombre" />
                      <div className="flex gap-2">
                        <Textarea placeholder="Descripción" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} data-testid="input-descripcion" />
                        <Button variant="outline" size="icon" title="Sugerir con IA" onClick={() => void sugerir()} data-testid="button-sugerir">
                          <Wand2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button onClick={() => void crear()} disabled={!nombre.trim()} data-testid="button-confirmar-crear">
                        {offline ? "Encolar (offline)" : "Crear"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Nombre</TableHead><TableHead>Estado</TableHead>
                    <TableHead>Versión</TableHead><TableHead>Actualizado</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(elementos ?? []).map((e) => (
                      <TableRow key={e.id} className="cursor-pointer" data-testid={`row-elemento-${e.id}`}
                        onClick={() => navigate(`/referencia/${e.id}`)}>
                        <TableCell className="font-medium">{e.nombre}</TableCell>
                        <TableCell>{estadoBadge(e.estado)}</TableCell>
                        <TableCell className="font-mono text-xs">v{e.version}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(e.actualizadoAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {elementos?.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                        Sin elementos. Cree el primero.
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dashboard">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card data-testid="card-total"><CardHeader className="pb-2">
                <CardDescription className="font-mono text-xs uppercase">Total</CardDescription>
                <CardTitle className="text-2xl font-mono">{dashboard?.total ?? "—"}</CardTitle></CardHeader>
                <CardContent><p className="text-xs text-muted-foreground">elementos</p></CardContent></Card>
              {(["BORRADOR", "ACTIVO", "ARCHIVADO"] as const).map((s) => (
                <Card key={s} data-testid={`card-${s.toLowerCase()}`}><CardHeader className="pb-2">
                  <CardDescription className="font-mono text-xs uppercase">{s}</CardDescription>
                  <CardTitle className="text-2xl font-mono">{dashboard?.porEstado[s] ?? "—"}</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">en este estado</p></CardContent></Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader><CardTitle className="text-lg">Configuración por tenant</CardTitle>
                <CardDescription>Claves del módulo resueltas por la plataforma (override → default)</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(cfg).map(([clave, valor]) => (
                  <div key={clave} className="flex items-center gap-3">
                    <span className="font-mono text-sm w-56">{clave}</span>
                    <Input defaultValue={valor} className="max-w-xs font-mono text-sm" data-testid={`input-config-${clave}`}
                      onBlur={(e) => { if (e.target.value !== valor) void setConfig(clave, e.target.value); }} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consola">
            <Card>
              <CardHeader><CardTitle className="text-lg">Consola técnica del módulo</CardTitle>
                <CardDescription>Contrato registrado automáticamente en la plataforma</CardDescription></CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-muted rounded-md p-4 overflow-auto" data-testid="pre-consola">
                  {consola ? JSON.stringify(consola, null, 2) : "Cargando…"}
                </pre>
                <Button variant="outline" size="sm" className="mt-4" data-testid="button-reproyectar"
                  onClick={async () => {
                    const r = await fetch(`${API}/reproyectar`, { method: "POST" });
                    const body = await r.json();
                    toast({ title: r.ok ? `Read model reproyectado (${body.proyectados})` : "Fallo al reproyectar" });
                    void refetch();
                  }}>
                  <RefreshCw className="h-4 w-4 mr-1" />Reproyectar read model (replay)
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
