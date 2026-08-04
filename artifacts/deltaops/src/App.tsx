import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Login from '@/pages/login';
import Console from '@/pages/console';
import Plataforma from '@/pages/plataforma';
import Referencia from '@/pages/referencia';
import ReferenciaDetalle from '@/pages/referencia-detalle';
import DesignSystem from '@/pages/design-system';
import Motores from '@/pages/motores';
import MotoresPlayground from '@/pages/motores-playground';
import ConsolaActivos from '@/pages/consola-activos';
import ActivosListado from '@/pages/activos-listado';
import ActivosNuevo from '@/pages/activos-nuevo';
import ActivosArboles from '@/pages/activos-arboles';
import ActivosSincronizacion from '@/pages/activos-sincronizacion';
import ActivosEscanear from '@/pages/activos-escanear';
import ActivosFicha from '@/pages/activos-ficha';

const queryClient = new QueryClient();

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold font-mono text-primary/20">404</h1>
        <h2 className="text-2xl font-bold tracking-tight">Ruta no encontrada</h2>
        <p className="text-sm text-muted-foreground font-mono">
          La interfaz solicitada no existe en esta versión de DeltaOps.
        </p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Console} />
      <Route path="/plataforma" component={Plataforma} />
      <Route path="/referencia" component={Referencia} />
      <Route path="/referencia/:id" component={ReferenciaDetalle} />
      <Route path="/login" component={Login} />
      <Route path="/design-system" component={DesignSystem} />
      <Route path="/motores/playground" component={MotoresPlayground} />
      <Route path="/motores" component={Motores} />
      <Route path="/consola-activos" component={ConsolaActivos} />
      <Route path="/activos" component={ActivosListado} />
      <Route path="/activos/nuevo" component={ActivosNuevo} />
      <Route path="/activos/arboles" component={ActivosArboles} />
      <Route path="/activos/sincronizacion" component={ActivosSincronizacion} />
      <Route path="/activos/escanear" component={ActivosEscanear} />
      <Route path="/activos/:id" component={ActivosFicha} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
