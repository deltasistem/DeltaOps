import { 
  useGetDashboardSummary, 
  useGetAssetStatusBreakdown, 
  useGetWorkOrdersByType,
  useGetCostsByMonth,
  useGetRecentActivity,
  getGetDashboardSummaryQueryKey,
  getGetAssetStatusBreakdownQueryKey,
  getGetWorkOrdersByTypeQueryKey,
  getGetCostsByMonthQueryKey,
  getGetRecentActivityQueryKey
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Clock, Wrench } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Bar, 
  BarChart, 
  CartesianGrid, 
  Cell, 
  Legend, 
  Line, 
  LineChart, 
  Pie, 
  PieChart, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip, 
  XAxis, 
  YAxis 
} from "recharts";

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary({ query: { queryKey: getGetDashboardSummaryQueryKey() } });
  const { data: statusBreakdown, isLoading: isLoadingStatus } = useGetAssetStatusBreakdown({ query: { queryKey: getGetAssetStatusBreakdownQueryKey() } });
  const { data: workOrdersByType, isLoading: isLoadingWO } = useGetWorkOrdersByType({ query: { queryKey: getGetWorkOrdersByTypeQueryKey() } });
  const { data: costsByMonth, isLoading: isLoadingCosts } = useGetCostsByMonth({ query: { queryKey: getGetCostsByMonthQueryKey() } });
  const { data: recentActivity, isLoading: isLoadingActivity } = useGetRecentActivity({ query: { queryKey: getGetRecentActivityQueryKey() } });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard General</h1>
        <p className="text-muted-foreground mt-1">Resumen de indicadores de mantenimiento y estado de activos.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equipos Operativos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{summary?.equiposOperativos || 0} / {summary?.totalEquipos || 0}</div>
                <p className="text-xs text-muted-foreground">
                  Disp. Mecánica: {summary?.disponibilidadMecanica ? `${summary.disponibilidadMecanica}%` : 'N/A'}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">OTs Abiertas</CardTitle>
            <Wrench className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <>
                <div className="text-2xl font-bold">{summary?.otAbiertas || 0}</div>
                <p className="text-xs text-muted-foreground text-amber-500 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  {summary?.otVencidas || 0} vencidas
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Repuestos Bajo Stock</CardTitle>
            <BoxIcon className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-amber-600">{summary?.repuestosBajoStock || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MTTR (Horas)</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{summary?.mttr ? summary.mttr.toFixed(1) : '0'}h</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Estado de Equipos</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingStatus ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusBreakdown || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="label"
                    isAnimationActive={false}
                  >
                    {(statusBreakdown || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Costos por Mes</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoadingCosts ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costsByMonth || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(val) => `$${val/1000}k`} />
                  <RechartsTooltip formatter={(val: number) => [`$${val.toLocaleString()}`, 'Costo']} />
                  <Bar dataKey="costo" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Actividad Reciente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingActivity ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4">
              {(recentActivity || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No hay actividad reciente.</p>
              ) : (
                (recentActivity || []).map((item) => (
                  <div key={item.id} className="flex items-start gap-4 pb-4 border-b last:border-0 last:pb-0">
                    <div className="rounded-full bg-primary/10 p-2 mt-0.5">
                      <Activity className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">{item.descripcion}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(item.fecha).toLocaleString('es-CO')} - {item.tipo}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BoxIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}