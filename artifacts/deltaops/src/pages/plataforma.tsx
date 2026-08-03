import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Boxes, Network, HeartPulse, Layers, ListTree, Database, Settings2,
  ScrollText, ArrowLeft, CheckCircle2, XCircle, Workflow,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Consola Técnica de la Plataforma de Servicios Compartidos (DGP-003).
 * Visualiza servicios, capacidades, dependencias, salud, colas, trabajos,
 * almacenamiento, configuración y auditoría técnica. Sin pantallas de negocio.
 */

// El API server se publica en /api en la raíz del proxy (igual que el resto
// de la consola DeltaOps, que usa rutas relativas a la raíz).
const API = `/api/deltaops/platform`;

function useApi<T>(path: string): { data: T | null; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/${path}`)
      .then(async (r) => {
        if (r.status === 401) {
          // Sesión requerida: la consola técnica exige autenticación.
          window.location.assign(`${import.meta.env.BASE_URL}login`);
          return;
        }
        const body = await r.json();
        if (!alive) return;
        if (!r.ok && path !== "services/health") throw new Error(body.error ?? r.statusText);
        setData(body as T);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [path]);
  return { data, error };
}

interface ServiceDesc {
  name: string; version: string; description: string;
  recordTypes: string[]; commands: string[]; queries: string[]; events: string[];
}
interface HealthResp { healthy: boolean; services: { service: string; healthy: boolean; detail: string }[] }

export default function Plataforma() {
  const { data: services } = useApi<ServiceDesc[]>("services");
  const { data: capabilities } = useApi<{ name: string; service: string; permissions: string[]; description: string }[]>("capabilities");
  const { data: dependencies } = useApi<{ service: string; dependsOn: string[] }[]>("dependencies");
  const { data: health } = useApi<HealthResp>("services/health");
  const { data: queues } = useApi<{ outbox: Record<string, number>; deadLetter: number }>("queues");
  const { data: jobs } = useApi<{ service: string; record_type: string; status: string; n: number }[]>("jobs");
  const { data: storage } = useApi<{ service: string; registros: number; tenants: number }[]>("storage");
  const { data: configDefaults } = useApi<{ key: string; value: string }[]>("config-defaults");
  const { data: logs } = useApi<{ id: string; tenant_id: string; service: string; action: string; actor_id: string; occurred_at: string }[]>("logs");
  const { data: graph } = useApi<{ nodes: unknown[]; edges: unknown[] }>("knowledge-graph");

  const healthyCount = health?.services.filter((s) => s.healthy).length ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-muted-foreground hover:text-foreground" data-testid="link-volver">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="bg-primary/10 p-2 rounded-md text-primary"><Boxes className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold tracking-tight leading-none">Plataforma de Servicios Compartidos</h1>
          <p className="text-xs font-mono text-muted-foreground uppercase mt-1">Consola técnica · DGP-003</p>
        </div>
      </header>

      <main className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="card-servicios">
            <CardHeader className="pb-2"><CardDescription className="font-mono text-xs uppercase">Servicios</CardDescription>
              <CardTitle className="text-2xl font-mono">{services?.length ?? "—"}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">registrados automáticamente</p></CardContent>
          </Card>
          <Card data-testid="card-salud">
            <CardHeader className="pb-2"><CardDescription className="font-mono text-xs uppercase">Salud</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                {health?.healthy ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <XCircle className="h-6 w-6 text-destructive" />}
                <span className="font-mono">{healthyCount}/{health?.services.length ?? "—"}</span>
              </CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">health checks OK</p></CardContent>
          </Card>
          <Card data-testid="card-colas">
            <CardHeader className="pb-2"><CardDescription className="font-mono text-xs uppercase">Outbox pendiente</CardDescription>
              <CardTitle className="text-2xl font-mono">{queues ? (queues.outbox["pending"] ?? 0) : "—"}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">dead letter: {queues?.deadLetter ?? "—"}</p></CardContent>
          </Card>
          <Card data-testid="card-grafo">
            <CardHeader className="pb-2"><CardDescription className="font-mono text-xs uppercase">Knowledge Graph</CardDescription>
              <CardTitle className="text-2xl font-mono">{graph ? `${graph.nodes.length}·${graph.edges.length}` : "—"}</CardTitle></CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">nodos · aristas</p></CardContent>
          </Card>
        </div>

        <Tabs defaultValue="servicios">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="servicios" data-testid="tab-servicios"><Layers className="h-4 w-4 mr-1" />Servicios</TabsTrigger>
            <TabsTrigger value="salud" data-testid="tab-salud"><HeartPulse className="h-4 w-4 mr-1" />Salud</TabsTrigger>
            <TabsTrigger value="dependencias" data-testid="tab-dependencias"><Network className="h-4 w-4 mr-1" />Dependencias</TabsTrigger>
            <TabsTrigger value="capacidades" data-testid="tab-capacidades"><ListTree className="h-4 w-4 mr-1" />Capacidades</TabsTrigger>
            <TabsTrigger value="trabajos" data-testid="tab-trabajos"><Workflow className="h-4 w-4 mr-1" />Trabajos</TabsTrigger>
            <TabsTrigger value="almacenamiento" data-testid="tab-almacenamiento"><Database className="h-4 w-4 mr-1" />Almacenamiento</TabsTrigger>
            <TabsTrigger value="config" data-testid="tab-config"><Settings2 className="h-4 w-4 mr-1" />Configuración</TabsTrigger>
            <TabsTrigger value="auditoria" data-testid="tab-auditoria"><ScrollText className="h-4 w-4 mr-1" />Auditoría</TabsTrigger>
          </TabsList>

          <TabsContent value="servicios">
            <Card><CardHeader><CardTitle className="text-lg">Shared Service Registry</CardTitle>
              <CardDescription>Servicios registrados automáticamente desde sus descriptores</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Versión</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Comandos</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Consultas</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Eventos</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Descripción</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {services?.map((s) => (
                      <TableRow key={s.name} data-testid={`row-servicio-${s.name}`}>
                        <TableCell className="font-mono text-sm">{s.name}</TableCell>
                        <TableCell><Badge variant="secondary" className="font-mono">{s.version}</Badge></TableCell>
                        <TableCell className="font-mono text-sm text-center">{s.commands.length}</TableCell>
                        <TableCell className="font-mono text-sm text-center">{s.queries.length}</TableCell>
                        <TableCell className="font-mono text-sm text-center">{s.events.length}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="salud">
            <Card><CardHeader><CardTitle className="text-lg">Observability Registry</CardTitle>
              <CardDescription>Health checks por servicio</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Estado</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Detalle</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {health?.services.map((s) => (
                      <TableRow key={s.service}>
                        <TableCell className="font-mono text-sm">{s.service}</TableCell>
                        <TableCell>{s.healthy
                          ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 gap-1 font-mono"><CheckCircle2 className="h-3 w-3" />OK</Badge>
                          : <Badge variant="destructive" className="gap-1 font-mono"><XCircle className="h-3 w-3" />FALLO</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.detail}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="dependencias">
            <Card><CardHeader><CardTitle className="text-lg">Dependency Registry</CardTitle>
              <CardDescription>Dependencias declaradas entre servicios de plataforma</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Depende de</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {dependencies?.map((d) => (
                      <TableRow key={d.service}>
                        <TableCell className="font-mono text-sm">{d.service}</TableCell>
                        <TableCell className="space-x-1">
                          {d.dependsOn.length === 0
                            ? <span className="text-xs text-muted-foreground">—</span>
                            : d.dependsOn.map((x) => <Badge key={x} variant="secondary" className="font-mono text-xs">{x}</Badge>)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="capacidades">
            <Card><CardHeader><CardTitle className="text-lg">Capability Registry</CardTitle>
              <CardDescription>Capacidades ofrecidas y permisos que agrupan</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="font-mono text-xs uppercase">Capacidad</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Permisos</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {capabilities?.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium text-sm">{c.name}</TableCell>
                        <TableCell className="font-mono text-xs">{c.service}</TableCell>
                        <TableCell className="space-x-1">
                          {c.permissions.map((p) => <Badge key={p} variant="outline" className="font-mono text-xs">{p}</Badge>)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="trabajos">
            <Card><CardHeader><CardTitle className="text-lg">Trabajos y sesiones</CardTitle>
              <CardDescription>Jobs de exportación/reportes y sesiones de importación por estado</CardDescription></CardHeader>
              <CardContent>
                {jobs && jobs.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                      <TableHead className="font-mono text-xs uppercase">Tipo</TableHead>
                      <TableHead className="font-mono text-xs uppercase">Estado</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-right">Cantidad</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {jobs.map((j, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{j.service}</TableCell>
                          <TableCell className="font-mono text-xs">{j.record_type}</TableCell>
                          <TableCell><Badge variant="secondary" className="font-mono text-xs">{j.status}</Badge></TableCell>
                          <TableCell className="font-mono text-sm text-right">{j.n}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="text-sm text-muted-foreground py-6 text-center">Sin trabajos registrados.</p>}
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="almacenamiento">
            <Card><CardHeader><CardTitle className="text-lg">Record Store</CardTitle>
              <CardDescription>Registros persistidos por servicio (deltaops.platform_records)</CardDescription></CardHeader>
              <CardContent>
                {storage && storage.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-right">Registros</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-right">Tenants</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {storage.map((s) => (
                        <TableRow key={s.service}>
                          <TableCell className="font-mono text-sm">{s.service}</TableCell>
                          <TableCell className="font-mono text-sm text-right">{s.registros}</TableCell>
                          <TableCell className="font-mono text-sm text-right">{s.tenants}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="text-sm text-muted-foreground py-6 text-center">Sin registros persistidos.</p>}
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="config">
            <Card><CardHeader><CardTitle className="text-lg">Configuración por servicio</CardTitle>
              <CardDescription>Valores por defecto; los tenants pueden sobrescribirlos vía platform.config</CardDescription></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="font-mono text-xs uppercase">Clave</TableHead>
                    <TableHead className="font-mono text-xs uppercase">Valor por defecto</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {configDefaults?.map((c) => (
                      <TableRow key={c.key}>
                        <TableCell className="font-mono text-xs">{c.key}</TableCell>
                        <TableCell className="font-mono text-sm">{c.value}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent></Card>
          </TabsContent>

          <TabsContent value="auditoria">
            <Card><CardHeader><CardTitle className="text-lg">Auditoría técnica</CardTitle>
              <CardDescription>Últimas entradas de deltaops.platform_audit</CardDescription></CardHeader>
              <CardContent>
                {logs && logs.length > 0 ? (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="font-mono text-xs uppercase">Fecha</TableHead>
                      <TableHead className="font-mono text-xs uppercase">Tenant</TableHead>
                      <TableHead className="font-mono text-xs uppercase">Servicio</TableHead>
                      <TableHead className="font-mono text-xs uppercase">Acción</TableHead>
                      <TableHead className="font-mono text-xs uppercase">Actor</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-xs">{new Date(l.occurred_at).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs">{l.tenant_id}</TableCell>
                          <TableCell className="font-mono text-xs">{l.service}</TableCell>
                          <TableCell className="font-mono text-xs">{l.action}</TableCell>
                          <TableCell className="font-mono text-xs">{l.actor_id}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : <p className="text-sm text-muted-foreground py-6 text-center">Sin entradas de auditoría.</p>}
              </CardContent></Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
