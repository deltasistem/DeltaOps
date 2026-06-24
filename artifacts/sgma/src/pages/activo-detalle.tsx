import { useLocation, useParams } from "wouter";
import { 
  useGetAsset, 
  useGetAssetHistory,
  getGetAssetQueryKey,
  getGetAssetHistoryQueryKey
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Activity, MapPin, Factory, Calendar, Clock, PenTool } from "lucide-react";
import { getAssetStatusColor, getAssetStatusLabel, formatCurrency, formatDate, getPriorityColor, getWorkOrderStatusColor } from "@/lib/format";

export default function AssetDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const assetId = parseInt(id || "0", 10);

  const { data: asset, isLoading: isLoadingAsset } = useGetAsset(assetId, { 
    query: { enabled: !!assetId, queryKey: getGetAssetQueryKey(assetId) } 
  });
  
  const { data: history, isLoading: isLoadingHistory } = useGetAssetHistory(assetId, {
    query: { enabled: !!assetId, queryKey: getGetAssetHistoryQueryKey(assetId) }
  });

  if (isLoadingAsset) {
    return (
      <div className="space-y-6">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 flex-1" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-[400px] md:col-span-2" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold">Activo no encontrado</h2>
        <Button className="mt-4" onClick={() => setLocation("/activos")}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setLocation("/activos")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {asset.nombre}
            <Badge variant="outline" className={getAssetStatusColor(asset.estado)}>
              {getAssetStatusLabel(asset.estado)}
            </Badge>
          </h1>
          <p className="text-muted-foreground mt-1">Código: {asset.codigo} • {asset.tipo.replace('_', ' ')}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Info General */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Información General</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Marca / Modelo</p>
              <p className="text-sm">{asset.marca || "-"} {asset.modelo || ""}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Año / Serie</p>
              <p className="text-sm">{asset.anio || "-"} / {asset.serie || "-"}</p>
            </div>
            <div className="col-span-2 border-t pt-4 mt-2"></div>
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Ubicación
              </p>
              <p className="text-sm mt-1">{asset.ubicacionNombre || "No asignada"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Factory className="h-4 w-4" /> Centro de Trabajo
              </p>
              <p className="text-sm mt-1">{asset.centroTrabajoNombre || "No asignado"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Responsable</p>
              <p className="text-sm">{asset.responsable || "-"}</p>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <Card>
          <CardHeader>
            <CardTitle>Indicadores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-muted-foreground">Horómetro</span>
                <span>{asset.horometro || 0} h</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-muted-foreground">Kilometraje</span>
                <span>{asset.kilometraje || 0} km</span>
              </div>
            </div>
            {asset.vidaUtil && (
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-muted-foreground">Vida Útil (Horas)</span>
                  <span>{asset.horasAcumuladas || 0} / {asset.vidaUtil}</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary" 
                    style={{ width: `${Math.min(100, ((asset.horasAcumuladas || 0) / asset.vidaUtil) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historial de OTs (Timeline) */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Historial de Órdenes de Trabajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingHistory ? (
              <div className="space-y-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : !history || history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay historial registrado.</p>
            ) : (
              <div className="relative pl-6 border-l space-y-8 mt-2">
                {history.map((wo) => (
                  <div key={wo.id} className="relative">
                    <div className={`absolute -left-[35px] h-4 w-4 rounded-full border-2 border-background ${wo.estado === 'cerrado' || wo.estado === 'finalizado' ? 'bg-emerald-500' : 'bg-primary'}`} />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{wo.numero}</span>
                        <Badge variant="outline">{wo.tipo.replace('_', ' ')}</Badge>
                        <Badge variant="outline" className={getPriorityColor(wo.prioridad)}>{wo.prioridad}</Badge>
                        <Badge variant="outline" className={getWorkOrderStatusColor(wo.estado)}>{wo.estado.replace('_', ' ')}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(wo.fechaCreacion)}
                      </span>
                    </div>
                    <p className="text-sm mb-3">{wo.descripcion || "Sin descripción"}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-muted/50 p-3 rounded-md">
                      <div>
                        <span className="block text-muted-foreground mb-1">Técnico</span>
                        <span className="font-medium">{wo.tecnicoNombre || "-"}</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground mb-1">Horas</span>
                        <span className="font-medium">{wo.horasReales || "-"} h</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground mb-1">Costo Total</span>
                        <span className="font-medium">{formatCurrency(wo.costoTotal)}</span>
                      </div>
                      <div>
                        <span className="block text-muted-foreground mb-1">Cierre</span>
                        <span className="font-medium">{formatDate(wo.fechaCierre)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}