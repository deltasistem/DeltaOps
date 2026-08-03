import React, { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDeltaopsMe,
  getDeltaopsMeQueryKey,
  useDeltaopsHealth,
  getDeltaopsHealthQueryKey,
  useDeltaopsReady,
  getDeltaopsReadyQueryKey,
  useDeltaopsInfo,
  getDeltaopsInfoQueryKey,
  useDeltaopsMetrics,
  getDeltaopsMetricsQueryKey,
  useDeltaopsLogout,
} from "@workspace/api-client-react";

import { Activity, Server, Clock, ActivitySquare, AlertTriangle, ShieldCheck, Power, Shield, Activity as ActivityIcon, CheckCircle2, XCircle } from "lucide-react";
import { Logo } from "@workspace/design-system";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

// Polling interval for live console stats
const POLLING_INTERVAL = 10000;

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

export default function Console() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Auth check
  const { data: user, error: userError, isLoading: userLoading } = useDeltaopsMe({
    query: {
      retry: false,
      queryKey: getDeltaopsMeQueryKey(),
    },
  });

  const logoutMutation = useDeltaopsLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    },
  });

  useEffect(() => {
    if (userError) {
      setLocation("/login");
    }
  }, [userError, setLocation]);

  // Platform Data Queries
  const { data: health } = useDeltaopsHealth({
    query: {
      refetchInterval: POLLING_INTERVAL,
      queryKey: getDeltaopsHealthQueryKey(),
    },
  });

  const { data: readyData, error: readyError } = useDeltaopsReady({
    query: {
      refetchInterval: POLLING_INTERVAL,
      retry: false,
      queryKey: getDeltaopsReadyQueryKey(),
    },
  });

  const { data: info } = useDeltaopsInfo({
    query: {
      refetchInterval: POLLING_INTERVAL * 6, // Info changes less often
      queryKey: getDeltaopsInfoQueryKey(),
    },
  });

  const { data: metrics } = useDeltaopsMetrics({
    query: {
      refetchInterval: POLLING_INTERVAL,
      queryKey: getDeltaopsMetricsQueryKey(),
    },
  });

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
        <Activity className="h-8 w-8 text-primary animate-pulse mb-4" />
        <p className="font-mono text-sm text-muted-foreground uppercase tracking-widest">Inicializando consola...</p>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect
  }

  // Handle readiness even if it failed (503)
  const readiness = readyData || (readyError as any);
  const isHealthy = health?.status === "ok";
  const isReady = readiness?.status === "ok";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Logo variant="isotipo" width={28} alt="DELTA" />
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">DeltaOps Console</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground uppercase">
                  <span className={`h-2 w-2 rounded-full ${isHealthy ? 'bg-exito' : 'bg-destructive'} ${isHealthy ? 'animate-pulse' : ''}`} />
                  {isHealthy ? "Plataforma en línea" : "Degradado"}
                </span>
                {info && (
                  <>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="text-xs font-mono text-muted-foreground">{info.environment}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/referencia" data-testid="link-referencia">
              <Button variant="outline" size="sm" className="gap-2 font-mono text-xs uppercase">
                Referencia
              </Button>
            </Link>
            <Link href="/plataforma" data-testid="link-plataforma">
              <Button variant="outline" size="sm" className="gap-2 font-mono text-xs uppercase">
                Plataforma
              </Button>
            </Link>
            <div className="text-right hidden md:block">
              <p className="text-sm font-semibold">{user.nombre}</p>
              <p className="text-xs text-muted-foreground font-mono">{user.rol}</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 font-mono text-xs uppercase"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <Power className="h-3.5 w-3.5" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8">
        
        {/* Top Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          <Card className="border-l-4 border-l-primary bg-card/50">
            <CardHeader className="pb-2">
              <CardDescription className="uppercase tracking-wider font-mono text-xs">Estado Global</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2 mt-1">
                {isHealthy && isReady ? (
                  <><ShieldCheck className="h-6 w-6 text-exito" /> Operativo</>
                ) : (
                  <><AlertTriangle className="h-6 w-6 text-accent" /> Degradado</>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Último chequeo: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '---'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="uppercase tracking-wider font-mono text-xs">Tiempo en línea (Uptime)</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2 mt-1">
                <Clock className="h-6 w-6 text-muted-foreground" />
                <span className="font-mono">{metrics?.uptimeSeconds ? formatUptime(metrics.uptimeSeconds) : '---'}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Desde último reinicio
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="uppercase tracking-wider font-mono text-xs">Rendimiento (Avg Resp)</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2 mt-1">
                <ActivitySquare className="h-6 w-6 text-primary" />
                <span className="font-mono">{metrics?.avgResponseTimeMs ?? '---'} ms</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {metrics?.requestCount ?? 0} solicitudes totales
              </p>
            </CardContent>
          </Card>

          <Card className={metrics?.errorCount && metrics.errorCount > 0 ? "border-destructive bg-destructive/5" : ""}>
            <CardHeader className="pb-2">
              <CardDescription className="uppercase tracking-wider font-mono text-xs">Tasa de Errores</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2 mt-1">
                <Server className={`h-6 w-6 ${metrics?.errorCount && metrics.errorCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
                <span className="font-mono">{metrics?.errorCount ?? 0}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Errores HTTP registrados
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Readiness Checks - Span 2 cols */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5" /> 
                Chequeos de Preparación (Readiness)
              </CardTitle>
              <CardDescription>
                Resultados detallados de los subsistemas y dependencias de plataforma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {readiness?.checks && readiness.checks.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3 uppercase text-xs font-mono">Subsistema</TableHead>
                      <TableHead className="uppercase text-xs font-mono">Estado</TableHead>
                      <TableHead className="text-right uppercase text-xs font-mono">Latencia</TableHead>
                      <TableHead className="uppercase text-xs font-mono">Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {readiness.checks.map((check: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{check.name}</TableCell>
                        <TableCell>
                          {check.status === "ok" ? (
                            <Badge variant="outline" className="bg-exito/10 text-exito hover:bg-exito/20 border-exito/20 gap-1.5 font-mono">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1.5 font-mono">
                              <XCircle className="h-3 w-3" /> {check.status.toUpperCase()}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {check.latencyMs ? `${check.latencyMs}ms` : '---'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {check.detail || '---'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-8 text-center border rounded-md bg-muted/20">
                  <p className="text-sm text-muted-foreground">Datos de readiness no disponibles en este momento.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* System Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Información de Sistema</CardTitle>
              <CardDescription>Parámetros del entorno de ejecución</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Nombre</span>
                <span className="font-mono text-sm">{info?.name || '---'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Versión</span>
                <Badge variant="secondary" className="font-mono">{info?.version || '---'}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Entorno</span>
                <span className="font-mono text-sm uppercase">{info?.environment || '---'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-muted-foreground">Node.js</span>
                <span className="font-mono text-sm">{info?.nodeVersion || '---'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">Uptime Servidor</span>
                <span className="font-mono text-sm">{info?.uptimeSeconds ? formatUptime(info.uptimeSeconds) : '---'}</span>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  );
}
