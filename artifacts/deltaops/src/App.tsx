import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, ToastProvider } from '@workspace/design-system';
import { Toaster } from '@/components/ui/toaster';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import Login from '@/pages/login';
import Inicio from '@/pages/inicio';
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
import CorrectivoSolicitudes from '@/pages/correctivo-solicitudes';
import CorrectivoSolicitudNueva from '@/pages/correctivo-solicitud-nueva';
import CorrectivoSolicitudFicha from '@/pages/correctivo-solicitud-ficha';
import CorrectivoDiagnostico from '@/pages/correctivo-diagnostico';
import CorrectivoIntervencion from '@/pages/correctivo-intervencion';
import CorrectivoEscanear from '@/pages/correctivo-escanear';
import CorrectivoSincronizacion from '@/pages/correctivo-sincronizacion';
import AnalyticsHome from '@/pages/analytics-home';
import AnalyticsIndicadores from '@/pages/analytics-indicadores';
import AnalyticsIndicador from '@/pages/analytics-indicador';
import AnalyticsSincronizacion from '@/pages/analytics-sincronizacion';
import AnalyticsDashboardEditor from '@/pages/analytics-dashboard-editor';
import AnalyticsDashboard from '@/pages/analytics-dashboard';
import Recuperar from '@/pages/recuperar';
import Restablecer from '@/pages/restablecer';
import Invitacion from '@/pages/invitacion';
import Perfil from '@/pages/perfil';
import AdministracionUsuarios from '@/pages/administracion-usuarios';
import AdministracionConfiguracion from '@/pages/administracion-configuracion';
import AdministracionSaaS from '@/pages/administracion-saas';
import { SesionProvider } from '@/lib/identidad/sesion';
import { SoloSuperAdmin } from '@/lib/identidad/GuardaRuta';

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
      <Route path="/" component={Inicio} />
      <Route path="/centro" component={CentroMantenimiento} />
      <Route path="/plataforma">
        <SoloSuperAdmin><Plataforma /></SoloSuperAdmin>
      </Route>
      <Route path="/referencia" component={Referencia} />
      <Route path="/referencia/:id" component={ReferenciaDetalle} />
      <Route path="/login" component={Login} />
      <Route path="/recuperar" component={Recuperar} />
      <Route path="/restablecer" component={Restablecer} />
      <Route path="/invitacion" component={Invitacion} />
      <Route path="/perfil" component={Perfil} />
      <Route path="/perfil/contrasena" component={Perfil} />
      <Route path="/administracion/usuarios" component={AdministracionUsuarios} />
      <Route path="/administracion/configuracion" component={AdministracionConfiguracion} />
      <Route path="/administracion/saas">
        <SoloSuperAdmin><AdministracionSaaS /></SoloSuperAdmin>
      </Route>
      <Route path="/design-system" component={DesignSystem} />
      <Route path="/motores/playground">
        <SoloSuperAdmin><MotoresPlayground /></SoloSuperAdmin>
      </Route>
      <Route path="/motores">
        <SoloSuperAdmin><Motores /></SoloSuperAdmin>
      </Route>
      <Route path="/consola-activos">
        <SoloSuperAdmin><ConsolaActivos /></SoloSuperAdmin>
      </Route>
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
      <Route path="/correctivo/solicitudes" component={CorrectivoSolicitudes} />
      <Route path="/correctivo/solicitudes/nueva" component={CorrectivoSolicitudNueva} />
      <Route path="/correctivo/escanear" component={CorrectivoEscanear} />
      <Route path="/correctivo/sincronizacion" component={CorrectivoSincronizacion} />
      <Route path="/correctivo/solicitudes/:id/diagnostico" component={CorrectivoDiagnostico} />
      <Route path="/correctivo/solicitudes/:id" component={CorrectivoSolicitudFicha} />
      <Route path="/correctivo/intervenciones/:id" component={CorrectivoIntervencion} />
      <Route path="/analytics" component={AnalyticsHome} />
      <Route path="/analytics/indicadores" component={AnalyticsIndicadores} />
      <Route path="/analytics/indicadores/:clave" component={AnalyticsIndicador} />
      <Route path="/analytics/sincronizacion" component={AnalyticsSincronizacion} />
      <Route path="/analytics/dashboards/nuevo" component={AnalyticsDashboardEditor} />
      <Route path="/analytics/dashboards/:id/editar" component={AnalyticsDashboardEditor} />
      <Route path="/analytics/dashboards/:id" component={AnalyticsDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/*
        DIRECTIVA CONSISTENCIA VISUAL · ThemeProvider del DS a nivel RAÍZ: única
        autoridad de la preferencia de apariencia (Claro/Oscuro/Automático) para
        TODA la plataforma. Aplica `data-do-theme` + clase `dark` sobre
        `document.documentElement`, por lo que rige en todos los módulos y en la
        consola SUPER_ADMIN (shadcn responde a `.dark`). Persiste en
        `localStorage["do-tema"]`. Los ThemeProvider de cada Shell quedan
        subordinados a esta preferencia (comparten el mismo almacenamiento y el
        mismo `<html>`), sin crear un segundo sistema de tema.

        ToastProvider del DS a nivel raíz: los `useToast` de las páginas consumen
        un único provider de ancestro. La región de toasts usa `position: fixed`
        y tokens `--do-*` globales (`:root`). Convive con el `<Toaster />` shadcn.
      */}
      <ThemeProvider>
        <ToastProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <SesionProvider>
              <Router />
            </SesionProvider>
          </WouterRouter>
          <Toaster />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
