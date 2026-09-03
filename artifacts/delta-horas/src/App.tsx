/**
 * DELTA — Control de Horas Máquina.
 *
 * Flujo único de datos: FORMULARIO → MachineRecord → REGISTROS → DASHBOARD.
 * Todas las pantallas leen la misma base a través de `ProveedorDatos`.
 */

import { Lock } from 'lucide-react';
import { Route, Router, Switch } from 'wouter';

import { puede, type Permiso } from '@workspace/horas-maquina';

import { ProveedorDatos, useDatos } from './datos/contexto';
import { ProveedorTema } from './datos/tema';
import { Shell } from './navegacion/Shell';
import { Alertas } from './pantallas/Alertas';
import { Auditoria } from './pantallas/Auditoria';
import { Configuracion } from './pantallas/Configuracion';
import { Dashboard } from './pantallas/Dashboard';
import { DetalleRegistro } from './pantallas/DetalleRegistro';
import { Inicio } from './pantallas/Inicio';
import { Mas } from './pantallas/Mas';
import { NuevoRegistro } from './pantallas/NuevoRegistro';
import { PantallaMaestro } from './pantallas/maestros/PantallaMaestro';
import { Registros } from './pantallas/Registros';
import { EstadoVacio } from './ui/atomos';
import { ProveedorAvisos } from './ui/avisos';

/** Una ruta sin el permiso necesario no se oculta: explica por qué no abre. */
function Protegida({
  permiso,
  children,
}: {
  readonly permiso: Permiso;
  readonly children: React.ReactNode;
}) {
  const { usuario } = useDatos();
  if (puede(usuario, permiso)) return <>{children}</>;
  return (
    <EstadoVacio
      icono={<Lock size={22} />}
      titulo="Sección no disponible"
      descripcion={`El rol ${usuario.rol} no tiene acceso a esta sección.`}
    />
  );
}

function Rutas() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Inicio} />

        <Route path="/registrar">
          <Protegida permiso="registros.crear">
            <NuevoRegistro />
          </Protegida>
        </Route>

        <Route path="/registros" component={Registros} />
        <Route path="/registros/:id/editar">
          {({ id }) => <NuevoRegistro registroId={id} />}
        </Route>
        <Route path="/registros/:id">
          {({ id }) => <DetalleRegistro id={id} />}
        </Route>

        <Route path="/dashboard">
          <Protegida permiso="dashboard.ver">
            <Dashboard />
          </Protegida>
        </Route>

        <Route path="/mas" component={Mas} />
        <Route path="/mas/alertas" component={Alertas} />
        <Route path="/mas/auditoria">
          <Protegida permiso="auditoria.ver">
            <Auditoria />
          </Protegida>
        </Route>
        <Route path="/mas/configuracion" component={Configuracion} />
        <Route path="/mas/usuarios">
          <Protegida permiso="usuarios.administrar">
            <PantallaMaestro maestro="usuarios" />
          </Protegida>
        </Route>
        <Route path="/mas/:maestro">
          {({ maestro }) => (
            <Protegida permiso="maestros.ver">
              <PantallaMaestro maestro={maestro} />
            </Protegida>
          )}
        </Route>

        <Route>
          <EstadoVacio
            titulo="Pantalla no encontrada"
            descripcion="La dirección solicitada no existe en esta aplicación."
          />
        </Route>
      </Switch>
    </Shell>
  );
}

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return (
    <ProveedorTema>
      <ProveedorDatos>
        <ProveedorAvisos>
          <Router base={base}>
            <Rutas />
          </Router>
        </ProveedorAvisos>
      </ProveedorDatos>
    </ProveedorTema>
  );
}
