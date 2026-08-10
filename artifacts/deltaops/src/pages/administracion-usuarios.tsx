/**
 * DGP-017 · Administración de usuarios del tenant (`/administracion/usuarios`).
 *
 * Superficie para TENANT_ADMIN: listar/buscar/filtrar usuarios; crear/invitar;
 * editar nombre/rol; activar/desactivar; forzar recuperación; ver auditoría;
 * gestionar invitaciones (reenviar/revocar). El backend es la autoridad: si el
 * rol no corresponde, las llamadas devuelven 403 y se muestran honestamente.
 * Estados vacíos/carga/error explícitos. Sólo Design System.
 */
import React, { useState } from "react";
import {
  Section,
  Toolbar,
  SearchInput,
  Select,
  Field,
  Input,
  Button,
  Table,
  Badge,
  Modal,
  Alert,
  Spinner,
  EmptyState,
  ErrorState,
  Tabs,
} from "@workspace/design-system";
import { Users } from "lucide-react";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesion } from "@/lib/identidad/sesion";
import { useUsuarios, useInvitaciones, useMutacionesUsuarios } from "@/lib/identidad/hooks";
import { useAuditoriaUsuario } from "@/lib/identidad/hooks";
import { ROLES, ROLES_META, nombreRol } from "@/lib/identidad/rbac";
import { mensajeDeError } from "@/lib/identidad/api";
import type { Rol, Usuario, Invitacion } from "@/lib/identidad/tipos";

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es");
}

/* ------------------------------- Usuarios ------------------------------- */

function PanelUsuarios() {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const { data, isLoading, error, refetch } = useUsuarios({ q: q || undefined, estado: estado || undefined });
  const m = useMutacionesUsuarios();

  const [crear, setCrear] = useState(false);
  const [editar, setEditar] = useState<Usuario | null>(null);
  const [auditar, setAuditar] = useState<Usuario | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function accion(fn: () => Promise<unknown>, exito: string) {
    setAviso(null);
    try {
      await fn();
      setAviso(exito);
    } catch (e) {
      setAviso(mensajeDeError(e));
    }
  }

  return (
    <Section
      titulo="Usuarios"
      acciones={
        <Button variant="primario" size="sm" onClick={() => setCrear(true)}>
          Crear / invitar usuario
        </Button>
      }
    >
      <div aria-live="polite">
        {aviso && (
          <Alert variant="info" titulo="Resultado" onClose={() => setAviso(null)}>
            {aviso}
          </Alert>
        )}
      </div>

      <Toolbar label="Filtros de usuarios" style={{ marginTop: "var(--do-sp-4)", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
        <SearchInput
          placeholder="Buscar por nombre o correo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar usuarios"
        />
        <Select value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="ACTIVO">Activos</option>
          <option value="INACTIVO">Inactivos</option>
        </Select>
      </Toolbar>

      <div style={{ marginTop: "var(--do-sp-4)" }}>
        {isLoading ? (
          <div role="status" style={{ display: "grid", placeItems: "center", minHeight: 120 }}>
            <Spinner />
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Cargando usuarios…</span>
          </div>
        ) : error ? (
          <ErrorState titulo="No se pudieron cargar los usuarios" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState titulo="Sin usuarios" descripcion="Aún no hay usuarios que coincidan con el filtro." icono={Users} />
        ) : (
          <Table caption="Usuarios de la empresa" hover>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => {
                const activo = (u.estado ?? u.estadoMembresia ?? "ACTIVO").toUpperCase() === "ACTIVO";
                return (
                  <tr key={u.identityId}>
                    <td>{u.nombre}</td>
                    <td>{u.email}</td>
                    <td>{nombreRol(u.rol)}</td>
                    <td>
                      <Badge variant={activo ? "exito" : "neutro"}>{activo ? "Activo" : "Inactivo"}</Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                        <Button size="sm" variant="secundario" onClick={() => setEditar(u)}>
                          Editar
                        </Button>
                        {activo ? (
                          <Button size="sm" variant="fantasma" onClick={() => void accion(() => m.desactivar.mutateAsync(u.identityId), "Usuario desactivado.")}>
                            Desactivar
                          </Button>
                        ) : (
                          <Button size="sm" variant="fantasma" onClick={() => void accion(() => m.activar.mutateAsync(u.identityId), "Usuario activado.")}>
                            Activar
                          </Button>
                        )}
                        <Button size="sm" variant="fantasma" onClick={() => void accion(() => m.forzarRecuperacion.mutateAsync(u.identityId), "Se envió recuperación de acceso.")}>
                          Forzar recuperación
                        </Button>
                        <Button size="sm" variant="fantasma" onClick={() => setAuditar(u)}>
                          Auditoría
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>

      {crear && <ModalCrear onClose={() => setCrear(false)} onHecho={(msg) => { setCrear(false); setAviso(msg); }} />}
      {editar && (
        <ModalEditar
          usuario={editar}
          onClose={() => setEditar(null)}
          onHecho={(msg) => { setEditar(null); setAviso(msg); }}
        />
      )}
      {auditar && <ModalAuditoria usuario={auditar} onClose={() => setAuditar(null)} />}
    </Section>
  );
}

function ModalCrear({ onClose, onHecho }: { onClose: () => void; onHecho: (msg: string) => void }) {
  const m = useMutacionesUsuarios();
  const [modo, setModo] = useState<"crear" | "invitar">("invitar");
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("TECNICO");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar() {
    setCargando(true);
    setError(null);
    try {
      if (modo === "invitar") {
        await m.invitar.mutateAsync({ email, rol });
        onHecho("Invitación enviada.");
      } else {
        await m.crear.mutateAsync({ email, nombre, rol });
        onHecho("Usuario creado.");
      }
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  const puede = email.trim() && (modo === "invitar" || nombre.trim());

  return (
    <Modal
      abierto
      onClose={onClose}
      titulo={modo === "invitar" ? "Invitar usuario" : "Crear usuario"}
      pie={
        <>
          <Button variant="fantasma" onClick={onClose} disabled={cargando}>Cancelar</Button>
          <Button variant="primario" onClick={() => void guardar()} disabled={!puede || cargando}>
            {cargando ? "Guardando…" : modo === "invitar" ? "Enviar invitación" : "Crear"}
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="error" titulo="No se pudo guardar" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)", marginTop: "var(--do-sp-3)" }}>
        <Field label="Modo">
          <Select value={modo} onChange={(e) => setModo(e.target.value as "crear" | "invitar")}>
            <option value="invitar">Invitar por correo</option>
            <option value="crear">Crear directamente</option>
          </Select>
        </Field>
        <Field label="Correo electrónico" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {modo === "crear" && (
          <Field label="Nombre completo" required>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </Field>
        )}
        <Field label="Rol inicial" required>
          <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLES_META[r].nombre}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function ModalEditar({ usuario, onClose, onHecho }: { usuario: Usuario; onClose: () => void; onHecho: (msg: string) => void }) {
  const m = useMutacionesUsuarios();
  const [nombre, setNombre] = useState(usuario.nombre);
  const [rol, setRol] = useState<Rol>(usuario.rol);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function guardar() {
    setCargando(true);
    setError(null);
    try {
      await m.editar.mutateAsync({ id: usuario.identityId, nombre, rol });
      onHecho("Usuario actualizado.");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Modal
      abierto
      onClose={onClose}
      titulo={`Editar ${usuario.nombre}`}
      pie={
        <>
          <Button variant="fantasma" onClick={onClose} disabled={cargando}>Cancelar</Button>
          <Button variant="primario" onClick={() => void guardar()} disabled={cargando || !nombre.trim()}>
            {cargando ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="error" titulo="No se pudo guardar" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)", marginTop: "var(--do-sp-3)" }}>
        <Field label="Nombre completo" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </Field>
        <Field label="Rol" required description="Asigna o retira el rol del usuario en esta empresa.">
          <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLES_META[r].nombre}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function ModalAuditoria({ usuario, onClose }: { usuario: Usuario; onClose: () => void }) {
  const { data, isLoading, error } = useAuditoriaUsuario(usuario.identityId);
  return (
    <Modal abierto onClose={onClose} titulo={`Auditoría de ${usuario.nombre}`} size="lg">
      {isLoading ? (
        <div role="status"><Spinner /> <span>Cargando auditoría…</span></div>
      ) : error ? (
        <ErrorState titulo="No se pudo cargar la auditoría" descripcion={mensajeDeError(error)} />
      ) : !data || data.length === 0 ? (
        <EmptyState titulo="Sin eventos" descripcion="No hay eventos de auditoría para este usuario." />
      ) : (
        <Table caption={`Eventos de ${usuario.nombre}`} compacta>
          <thead>
            <tr>
              <th scope="col">Acción</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e, i) => (
              <tr key={i}>
                <td>{e.action}</td>
                <td>{fmt(e.occurredAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}

/* ----------------------------- Invitaciones ----------------------------- */

function PanelInvitaciones() {
  const { data, isLoading, error, refetch } = useInvitaciones();
  const m = useMutacionesUsuarios();
  const [aviso, setAviso] = useState<string | null>(null);

  async function accion(fn: () => Promise<unknown>, exito: string) {
    setAviso(null);
    try {
      await fn();
      setAviso(exito);
    } catch (e) {
      setAviso(mensajeDeError(e));
    }
  }

  return (
    <Section titulo="Invitaciones">
      <div aria-live="polite">
        {aviso && (
          <Alert variant="info" titulo="Resultado" onClose={() => setAviso(null)}>{aviso}</Alert>
        )}
      </div>
      <div style={{ marginTop: "var(--do-sp-4)" }}>
        {isLoading ? (
          <div role="status"><Spinner /> <span>Cargando invitaciones…</span></div>
        ) : error ? (
          <ErrorState titulo="No se pudieron cargar las invitaciones" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState titulo="Sin invitaciones" descripcion="No hay invitaciones pendientes." />
        ) : (
          <Table caption="Invitaciones de la empresa">
            <thead>
              <tr>
                <th scope="col">Correo</th>
                <th scope="col">Rol</th>
                <th scope="col">Estado</th>
                <th scope="col">Expira</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv: Invitacion) => (
                <tr key={inv.invitationId}>
                  <td>{inv.email}</td>
                  <td>{nombreRol(inv.rol)}</td>
                  <td><Badge variant="advertencia">{inv.estado}</Badge></td>
                  <td>{fmt(inv.expiresAt)}</td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--do-sp-2)" }}>
                      <Button size="sm" variant="secundario" onClick={() => void accion(() => m.reenviar.mutateAsync(inv.invitationId), "Invitación reenviada.")}>
                        Reenviar
                      </Button>
                      <Button size="sm" variant="peligro" onClick={() => void accion(() => m.revocar.mutateAsync(inv.invitationId), "Invitación revocada.")}>
                        Revocar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Section>
  );
}

/* -------------------------------- Página -------------------------------- */

export default function AdministracionUsuarios() {
  return (
    <AppShellIdentidad>
      <GuardarAdmin>
        <Tabs
          items={[
            { id: "usuarios", etiqueta: "Usuarios", contenido: <PanelUsuarios /> },
            { id: "invitaciones", etiqueta: "Invitaciones", contenido: <PanelInvitaciones /> },
          ]}
        />
      </GuardarAdmin>
    </AppShellIdentidad>
  );
}

/** Aviso honesto cuando el rol no administra la empresa (backend rechaza igual). */
function GuardarAdmin({ children }: { children: React.ReactNode }) {
  const { capacidades } = useSesion();
  if (!capacidades.administrarUsuarios) {
    return (
      <Section titulo="Administración de usuarios">
        <Alert variant="advertencia" titulo="Acceso restringido">
          Esta superficie es para administradores de la empresa. Tu rol no tiene permiso para gestionarla.
        </Alert>
      </Section>
    );
  }
  return <>{children}</>;
}
