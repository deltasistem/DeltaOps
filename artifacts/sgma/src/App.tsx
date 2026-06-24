import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/app-shell";

import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";
import AssetDetail from "./pages/activo-detalle";
import Assets from "./pages/activos";
import WorkCenters from "./pages/centros";
import WorkOrders from "./pages/ordenes";
import Technicians from "./pages/personal";
import MaintenancePlans from "./pages/preventivo";
import Suppliers from "./pages/proveedores";
import SpareParts from "./pages/repuestos";
import Locations from "./pages/ubicaciones";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/activos" component={Assets} />
        <Route path="/activos/:id" component={AssetDetail} />
        <Route path="/ordenes" component={WorkOrders} />
        <Route path="/preventivo" component={MaintenancePlans} />
        <Route path="/repuestos" component={SpareParts} />
        <Route path="/ubicaciones" component={Locations} />
        <Route path="/centros" component={WorkCenters} />
        <Route path="/personal" component={Technicians} />
        <Route path="/proveedores" component={Suppliers} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="sgma-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;