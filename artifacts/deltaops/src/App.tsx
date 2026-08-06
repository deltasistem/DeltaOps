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
import OrdenesOperaciones from '@/pages/ordenes-operaciones';
import OrdenesNueva from '@/pages/ordenes-nueva';
import OrdenesSupervisor from '@/pages/ordenes-supervisor';
import OrdenesPlanificacion from '@/pages/ordenes-planificacion';
import OrdenesEscanear from '@/pages/ordenes-escanear';
import OrdenesSincronizacion from '@/pages/ordenes-sincronizacion';
import OrdenesFicha from '@/pages/ordenes-ficha';
import CentroMantenimiento from '@/pages/centro-mantenimiento';
import InventarioListado from '@/pages/inventario-listado';
import InventarioNueva from '@/pages/inventario-nueva';
import InventarioMovimientos from '@/pages/inventario-movimientos';
import InventarioTransferencias from '@/pages/inventario-transferencias';
import InventarioConteos from '@/pages/inventario-conteos';
import InventarioBodegas from '@/pages/inventario-bodegas';
import InventarioEscanear from '@/pages/inventario-escanear';
import InventarioSincronizacion from '@/pages/inventario-sincronizacion';
import InventarioFicha from '@/pages/inventario-ficha';
import PlanesListado from '@/pages/planes-listado';
import PlanesNueva from '@/pages/planes-nueva';
import PlanesCalendario from '@/pages/planes-calendario';
import PlanesSincronizacion from '@/pages/planes-sincronizacion';
import PlanesFicha from '@/pages/planes-ficha';
import AbastecimientoArticulos from '@/pages/abastecimiento-articulos';
import AbastecimientoArticuloNueva from '@/pages/abastecimiento-articulo-nueva';
import AbastecimientoArticuloFicha from '@/pages/abastecimiento-articulo-ficha';
import AbastecimientoProveedores from '@/pages/abastecimiento-proveedores';
import AbastecimientoProveedorNueva from '@/pages/abastecimiento-proveedor-nueva';
import AbastecimientoProveedorFicha from '@/pages/abastecimiento-proveedor-ficha';
import AbastecimientoSolicitudes from '@/pages/abastecimiento-solicitudes';
import AbastecimientoSolicitudNueva from '@/pages/abastecimiento-solicitud-nueva';
import AbastecimientoSolicitudFicha from '@/pages/abastecimiento-solicitud-ficha';
import AbastecimientoOrdenes from '@/pages/abastecimiento-ordenes';
import AbastecimientoOrdenNueva from '@/pages/abastecimiento-orden-nueva';
import AbastecimientoOrdenFicha from '@/pages/abastecimiento-orden-ficha';
import AbastecimientoSincronizacion from '@/pages/abastecimiento-sincronizacion';
import AbastecimientoEscanear from '@/pages/abastecimiento-escanear';
import PreventivoProgramas from '@/pages/preventivo-programas';
import PreventivoProgramaNueva from '@/pages/preventivo-programa-nueva';
import PreventivoProgramaFicha from '@/pages/preventivo-programa-ficha';
import PreventivoActividad from '@/pages/preventivo-actividad';
import PreventivoCalendario from '@/pages/preventivo-calendario';
import PreventivoEscanear from '@/pages/preventivo-escanear';
import PreventivoSincronizacion from '@/pages/preventivo-sincronizacion';

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
      <Route path="/centro" component={CentroMantenimiento} />
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
      <Route path="/ordenes" component={OrdenesOperaciones} />
      <Route path="/ordenes/nueva" component={OrdenesNueva} />
      <Route path="/ordenes/supervisor" component={OrdenesSupervisor} />
      <Route path="/ordenes/planificacion" component={OrdenesPlanificacion} />
      <Route path="/ordenes/escanear" component={OrdenesEscanear} />
      <Route path="/ordenes/sincronizacion" component={OrdenesSincronizacion} />
      <Route path="/ordenes/:id" component={OrdenesFicha} />
      <Route path="/inventario" component={InventarioListado} />
      <Route path="/inventario/nuevo" component={InventarioNueva} />
      <Route path="/inventario/movimientos" component={InventarioMovimientos} />
      <Route path="/inventario/transferencias" component={InventarioTransferencias} />
      <Route path="/inventario/conteos" component={InventarioConteos} />
      <Route path="/inventario/bodegas" component={InventarioBodegas} />
      <Route path="/inventario/escanear" component={InventarioEscanear} />
      <Route path="/inventario/sincronizacion" component={InventarioSincronizacion} />
      <Route path="/inventario/:id" component={InventarioFicha} />
      <Route path="/planes" component={PlanesListado} />
      <Route path="/planes/nuevo" component={PlanesNueva} />
      <Route path="/planes/calendario" component={PlanesCalendario} />
      <Route path="/planes/sincronizacion" component={PlanesSincronizacion} />
      <Route path="/planes/:id" component={PlanesFicha} />
      <Route path="/abastecimiento/articulos" component={AbastecimientoArticulos} />
      <Route path="/abastecimiento/articulos/nuevo" component={AbastecimientoArticuloNueva} />
      <Route path="/abastecimiento/articulos/:id" component={AbastecimientoArticuloFicha} />
      <Route path="/abastecimiento/proveedores" component={AbastecimientoProveedores} />
      <Route path="/abastecimiento/proveedores/nuevo" component={AbastecimientoProveedorNueva} />
      <Route path="/abastecimiento/proveedores/:id" component={AbastecimientoProveedorFicha} />
      <Route path="/abastecimiento/solicitudes" component={AbastecimientoSolicitudes} />
      <Route path="/abastecimiento/solicitudes/nueva" component={AbastecimientoSolicitudNueva} />
      <Route path="/abastecimiento/solicitudes/:id" component={AbastecimientoSolicitudFicha} />
      <Route path="/abastecimiento/ordenes-compra" component={AbastecimientoOrdenes} />
      <Route path="/abastecimiento/ordenes-compra/nueva" component={AbastecimientoOrdenNueva} />
      <Route path="/abastecimiento/ordenes-compra/:id" component={AbastecimientoOrdenFicha} />
      <Route path="/abastecimiento/escanear" component={AbastecimientoEscanear} />
      <Route path="/abastecimiento/sincronizacion" component={AbastecimientoSincronizacion} />
      <Route path="/preventivo/programas" component={PreventivoProgramas} />
      <Route path="/preventivo/programas/nuevo" component={PreventivoProgramaNueva} />
      <Route path="/preventivo/calendario" component={PreventivoCalendario} />
      <Route path="/preventivo/escanear" component={PreventivoEscanear} />
      <Route path="/preventivo/sincronizacion" component={PreventivoSincronizacion} />
      <Route path="/preventivo/programas/:id/actividad" component={PreventivoActividad} />
      <Route path="/preventivo/programas/:id" component={PreventivoProgramaFicha} />
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
