/**
 * DGP-017 · Administración global SaaS (`/administracion/saas`, SUPER_ADMIN).
 *
 * Administración (NO dashboard de negocio): lista de tenants, alta, cambio de
 * estado (ACTIVO/SUSPENDIDO/CERRADO), módulos habilitados por tenant y
 * notificaciones por tenant. El backend valida el rol; si no es SUPER_ADMIN,
 * las llamadas devuelven 403 y se muestran honestamente.
 */
import React, { useState } from "react";
import {
  Section,
  Field,
  Input,
  Select,
  Button,
  Alert,
  Table,
  Badge,
  Spinner,
  EmptyState,
  ErrorState,
  Modal,
  Checkbox,
} from "@workspace/design-system";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesion } from "@/lib/identidad/sesion";
import { useTenants, useMutacionesSaaS, useTenantNotificaciones } from "@/lib/identidad/hooks";
import { MODULOS_META, MODULOS_ORDEN } from "@/lib/identidad/rbac";
import { mensajeDeError } from "@/lib/identidad/api";
import type { Tenant, Modulo, EstadoTenant } from "@/lib/identidad/tipos";

const ESTADOS: EstadoTenant[] = ["ACTIVO", "SUSPENDIDO", "CERRADO"];

function badgeEstado(estado: string): "exito" | "advertencia" | "error" {
  const e = estado.toUpperCase();
  if (e === "ACTIVO") return "exito";
  if (e === "SUSPENDIDO") return "advertencia";
  return "error";
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es");
}

function Panel() {
  const { data, isLoading, error, refetch } = useTenants();
  const m = useMutacionesSaaS();
  const [crear, setCrear] = useState(false);
  const [modulos, setModulos] = useState<Tenant | null>(null);
  const [notif, setNotif] = useState<Tenant | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cambiarEstado(id: string, estado: EstadoTenant) {
    setAviso(null);
    try {
      await m.estado.mutateAsync({ id, estado });
      setAviso(`Empresa actualizada a ${estado}.`);
    } catch (e) {
      setAviso(mensajeDeError(e));
    }
  }

  return (
    <Section
      titulo="Empresas (tenants)"
      acciones={<Button variant="primario" size="sm" onClick={() => setCrear(true)}>Crear empresa</Button>}
    >
      <div aria-live="polite">
        {aviso && <Alert variant="info" titulo="Resultado" onClose={() => setAviso(null)}>{aviso}</Alert>}
      </div>
      <div style={{ marginTop: "var(--do-sp-4)" }}>
        {isLoading ? (
          <div role="status" style={{ display: "grid", placeItems: "center", minHeight: 120 }}>
            <Spinner />
            <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>Cargando empresas…</span>
          </div>
        ) : error ? (
          <ErrorState titulo="No se pudieron cargar las empresas" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState titulo="Sin empresas" descripcion="Aún no hay empresas registradas." />
        ) : (
          <Table caption="Empresas de la plataforma" hover>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id}>
                  <td>{t.codigo}</td>
                  <td>{t.nombre}</td>
                  <td><Badge variant={badgeEstado(t.estado)}>{t.estado}</Badge></td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", alignItems: "center" }}>
                      <Select
                        value={t.estado.toUpperCase()}
                        onChange={(e) => void cambiarEstado(t.id, e.target.value as EstadoTenant)}
                        aria-label={`Estado de ${t.nombre}`}
                        size="sm"
                      >
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </Select>
                      <Button size="sm" variant="secundario" onClick={() => setModulos(t)}>Módulos</Button>
                      <Button size="sm" variant="fantasma" onClick={() => setNotif(t)}>Notificaciones</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {crear && <ModalCrearTenant onClose={() => setCrear(false)} onHecho={(msg) => { setCrear(false); setAviso(msg); }} />}
      {modulos && <ModalModulos tenant={modulos} onClose={() => setModulos(null)} onHecho={(msg) => { setModulos(null); setAviso(msg); }} />}
      {notif && <ModalNotif tenant={notif} onClose={() => setNotif(null)} />}
    </Section>
  );
}

function ModalCrearTenant({ onClose, onHecho }: { onClose: () => void; onHecho: (msg: string) => void }) {
  const { crear } = useMutacionesSaaS();
  const [codigo, setCodigo] = useState("");
  const [nombreComercial, setNombre] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    try {
      await crear.mutateAsync({
        tenantId: crypto.randomUUID(),
        codigo: codigo.trim(),
        nombreComercial: nombreComercial.trim(),
        adminEmail: adminEmail.trim() || undefined,
      });
      onHecho("Empresa creada.");
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <Modal
      abierto
      onClose={onClose}
      titulo="Crear empresa"
      pie={
        <>
          <Button variant="fantasma" onClick={onClose} disabled={crear.isPending}>Cancelar</Button>
          <Button variant="primario" onClick={() => void guardar()} disabled={crear.isPending || !codigo.trim() || !nombreComercial.trim()}>
            {crear.isPending ? "Creando…" : "Crear"}
          </Button>
        </>
      }
    >
      {error && <Alert variant="error" titulo="No se pudo crear" onClose={() => setError(null)}>{error}</Alert>}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)", marginTop: "var(--do-sp-3)" }}>
        <Field label="Código" required description="Identificador corto y único de la empresa.">
          <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        </Field>
        <Field label="Nombre comercial" required>
          <Input value={nombreComercial} onChange={(e) => setNombre(e.target.value)} required />
        </Field>
        <Field label="Correo del administrador" description="Se le invitará como TENANT_ADMIN.">
          <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function ModalModulos({ tenant, onClose, onHecho }: { tenant: Tenant; onClose: () => void; onHecho: (msg: string) => void }) {
  const { modulos } = useMutacionesSaaS();
  const [sel, setSel] = useState<Set<Modulo>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function toggle(m: Modulo) {
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  }

  async function guardar() {
    setError(null);
    try {
      await modulos.mutateAsync({ id: tenant.id, modulos: [...sel] });
      onHecho("Módulos actualizados.");
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  return (
    <Modal
      abierto
      onClose={onClose}
      titulo={`Módulos de ${tenant.nombre}`}
      pie={
        <>
          <Button variant="fantasma" onClick={onClose} disabled={modulos.isPending}>Cancelar</Button>
          <Button variant="primario" onClick={() => void guardar()} disabled={modulos.isPending}>
            {modulos.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      {error && <Alert variant="error" titulo="No se pudo guardar" onClose={() => setError(null)}>{error}</Alert>}
      <fieldset style={{ border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)", marginTop: "var(--do-sp-2)" }}>
        <legend style={{ marginBottom: "var(--do-sp-2)", color: "var(--do-texto-suave)" }}>
          Selecciona los módulos contratados por la empresa.
        </legend>
        {MODULOS_ORDEN.map((m) => (
          <Checkbox key={m} checked={sel.has(m)} onChange={() => toggle(m)} label={MODULOS_META[m].nombre} />
        ))}
      </fieldset>
    </Modal>
  );
}

function ModalNotif({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const { data, isLoading, error } = useTenantNotificaciones(tenant.id);
  return (
    <Modal abierto onClose={onClose} titulo={`Notificaciones de ${tenant.nombre}`} size="lg">
      {isLoading ? (
        <div role="status"><Spinner /> <span>Cargando…</span></div>
      ) : error ? (
        <ErrorState titulo="No se pudieron cargar las notificaciones" descripcion={mensajeDeError(error)} />
      ) : !data || data.length === 0 ? (
        <EmptyState titulo="Sin correos" descripcion="Esta empresa no tiene notificaciones." />
      ) : (
        <Table caption={`Notificaciones de ${tenant.nombre}`} compacta>
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Destinatario</th>
              <th scope="col">Estado</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {data.map((n) => (
              <tr key={n.emailId}>
                <td>{n.tipo}</td>
                <td>{n.destinatario}</td>
                <td><Badge variant={n.estado === "enviado" ? "exito" : "advertencia"}>{n.estado}</Badge></td>
                <td>{fmt(n.sentAt ?? n.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}

export default function AdministracionSaaS() {
  return (
    <AppShellIdentidad>
      <GuardarSuper>
        <Panel />
      </GuardarSuper>
    </AppShellIdentidad>
  );
}

function GuardarSuper({ children }: { children: React.ReactNode }) {
  const { capacidades } = useSesion();
  if (!capacidades.administrarSaaS) {
    return (
      <Section titulo="Administración global SaaS">
        <Alert variant="advertencia" titulo="Acceso restringido">
          Esta superficie es exclusiva del administrador global (SUPER_ADMIN).
        </Alert>
      </Section>
    );
  }
  return <>{children}</>;
}
