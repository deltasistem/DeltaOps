/**
 * DGP-017 · Configuración del tenant (`/administracion/configuracion`).
 *
 * TENANT_ADMIN: idioma/zona horaria/moneda/formatos; branding (editor controlado
 * con vista previa, sólo tokens seguros); módulos habilitados (solo lectura para
 * TENANT_ADMIN); notificaciones (correos con estado); auditoría del tenant. El
 * backend valida cada cambio y branding (rechaza CSS/valores no seguros).
 */
import React, { useEffect, useState } from "react";
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
  Tabs,
  Card,
  CardContent,
  Logo,
} from "@workspace/design-system";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesion, useSesionActiva } from "@/lib/identidad/sesion";
import {
  useConfig,
  useBrandingTenant,
  useModulos,
  useNotificaciones,
  useAuditoriaTenant,
  useMutacionesTenant,
} from "@/lib/identidad/hooks";
import { MODULOS_META } from "@/lib/identidad/rbac";
import { colorSeguro } from "@/lib/identidad/branding";
import { mensajeDeError } from "@/lib/identidad/api";
import type { Modulo } from "@/lib/identidad/tipos";

const IDIOMAS = [
  { v: "es", t: "Español" },
  { v: "en", t: "Inglés" },
];
const MONEDAS = ["USD", "EUR", "MXN", "COP", "CLP", "PEN", "ARS"];

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es");
}

/* ------------------------------ General --------------------------------- */

function PanelGeneral() {
  const { data, isLoading, error, refetch } = useConfig();
  const { guardarConfig } = useMutacionesTenant();
  const [idioma, setIdioma] = useState("es");
  const [zonaHoraria, setZona] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [aviso, setAviso] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setIdioma(data.idioma ?? "es");
      setZona(data.zonaHoraria ?? "");
      setMoneda(data.moneda ?? "USD");
    }
  }, [data]);

  async function guardar() {
    setAviso(null);
    setErr(null);
    try {
      await guardarConfig.mutateAsync({ idioma, zonaHoraria, moneda });
      setAviso("Configuración guardada.");
    } catch (e) {
      setErr(mensajeDeError(e));
    }
  }

  if (isLoading) return <div role="status"><Spinner /> <span>Cargando configuración…</span></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la configuración" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />;

  return (
    <Section titulo="Regional">
      <div aria-live="polite">
        {aviso && <Alert variant="exito" titulo="Guardado" onClose={() => setAviso(null)}>{aviso}</Alert>}
        {err && <Alert variant="error" titulo="No se pudo guardar" onClose={() => setErr(null)}>{err}</Alert>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)", maxWidth: 420, marginTop: "var(--do-sp-4)" }}>
        <Field label="Idioma">
          <Select value={idioma} onChange={(e) => setIdioma(e.target.value)}>
            {IDIOMAS.map((i) => <option key={i.v} value={i.v}>{i.t}</option>)}
          </Select>
        </Field>
        <Field label="Zona horaria" description="Identificador IANA, p. ej. America/Bogota.">
          <Input value={zonaHoraria} onChange={(e) => setZona(e.target.value)} placeholder="America/Bogota" />
        </Field>
        <Field label="Moneda">
          <Select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <div>
          <Button variant="primario" onClick={() => void guardar()} disabled={guardarConfig.isPending}>
            {guardarConfig.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------- Branding ------------------------------- */

function PanelBranding() {
  const { data, isLoading, error, refetch } = useBrandingTenant();
  const { guardarBranding } = useMutacionesTenant();
  const sesion = useSesionActiva();
  const esDelta = ["DEMO", "DELTA"].includes(sesion.tenant.codigo);

  const [nombreApp, setNombreApp] = useState("");
  const [colorPrimario, setColorPrimario] = useState("");
  const [colorSecundario, setColorSecundario] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setNombreApp(data.nombreApp ?? "");
      setColorPrimario(data.colorPrimario ?? "");
      setColorSecundario(data.colorSecundario ?? "");
      setLogoUrl(data.logoUrl ?? "");
    }
  }, [data]);

  const primarioValido = !colorPrimario || Boolean(colorSeguro(colorPrimario));
  const secundarioValido = !colorSecundario || Boolean(colorSeguro(colorSecundario));

  async function guardar() {
    setAviso(null);
    setErr(null);
    try {
      const body: Record<string, string> = {};
      if (nombreApp) body.nombreApp = nombreApp;
      if (colorPrimario) body.colorPrimario = colorPrimario;
      if (colorSecundario) body.colorSecundario = colorSecundario;
      if (logoUrl) body.logoUrl = logoUrl;
      await guardarBranding.mutateAsync(body);
      setAviso("Branding guardado.");
    } catch (e) {
      setErr(mensajeDeError(e));
    }
  }

  if (isLoading) return <div role="status"><Spinner /> <span>Cargando branding…</span></div>;
  if (error) return <ErrorState titulo="No se pudo cargar el branding" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />;

  return (
    <Section titulo="Branding de la empresa">
      <div aria-live="polite">
        {esDelta && (
          <Alert variant="info" titulo="Identidad oficial DELTA">
            Esta empresa conserva la identidad oficial DELTA/DEMO. El branding personalizado no se aplica.
          </Alert>
        )}
        {aviso && <Alert variant="exito" titulo="Guardado" onClose={() => setAviso(null)}>{aviso}</Alert>}
        {err && <Alert variant="error" titulo="No se pudo guardar" onClose={() => setErr(null)}>{err}</Alert>}
      </div>
      <div style={{ display: "grid", gap: "var(--do-sp-6)", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", marginTop: "var(--do-sp-4)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
          <Field label="Nombre de la aplicación">
            <Input value={nombreApp} onChange={(e) => setNombreApp(e.target.value)} placeholder="DeltaOps" />
          </Field>
          <Field label="Logo (URL https)" description="URL absoluta a una imagen permitida.">
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" />
          </Field>
          <Field label="Color primario" error={!primarioValido ? "Usa un HEX de 6 dígitos (#RRGGBB)." : undefined}>
            <Input value={colorPrimario} onChange={(e) => setColorPrimario(e.target.value)} placeholder="#0A5FB4" invalid={!primarioValido} />
          </Field>
          <Field label="Color secundario" error={!secundarioValido ? "Usa un HEX de 6 dígitos (#RRGGBB)." : undefined}>
            <Input value={colorSecundario} onChange={(e) => setColorSecundario(e.target.value)} placeholder="#111827" invalid={!secundarioValido} />
          </Field>
          <div>
            <Button variant="primario" onClick={() => void guardar()} disabled={guardarBranding.isPending || !primarioValido || !secundarioValido}>
              {guardarBranding.isPending ? "Guardando…" : "Guardar branding"}
            </Button>
          </div>
        </div>
        <Card role="group" aria-label="Vista previa del branding">
          <CardContent>
            <p style={{ color: "var(--do-texto-suave)", marginTop: 0 }}>Vista previa</p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--do-sp-3)",
                padding: "var(--do-sp-4)",
                borderRadius: "var(--do-radio, 8px)",
                border: "1px solid var(--do-borde)",
                background: colorSeguro(colorPrimario) ?? "var(--do-surface-2)",
                color: "#fff",
              }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" style={{ height: 28 }} />
              ) : (
                <Logo variant="imagotipo" width={120} alt="DeltaOps" />
              )}
              <strong>{nombreApp || "DeltaOps"}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </Section>
  );
}

/* -------------------------------- Módulos ------------------------------- */

function PanelModulos() {
  const { data, isLoading, error, refetch } = useModulos();
  if (isLoading) return <div role="status"><Spinner /> <span>Cargando módulos…</span></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar los módulos" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />;
  const modulos = (data?.modulos ?? []) as Modulo[];
  return (
    <Section titulo="Módulos habilitados">
      <p style={{ color: "var(--do-texto-suave)" }}>
        Los módulos contratados por la empresa. Su habilitación la gestiona la administración global (SUPER_ADMIN).
      </p>
      <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap", marginTop: "var(--do-sp-3)" }}>
        {modulos.length === 0 ? (
          <EmptyState titulo="Sin módulos" descripcion="No hay módulos habilitados para esta empresa." />
        ) : (
          modulos.map((m) => <Badge key={m} variant="info">{MODULOS_META[m]?.nombre ?? m}</Badge>)
        )}
      </div>
    </Section>
  );
}

/* ---------------------------- Notificaciones ---------------------------- */

function PanelNotificaciones() {
  const { data, isLoading, error, refetch } = useNotificaciones();
  if (isLoading) return <div role="status"><Spinner /> <span>Cargando notificaciones…</span></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar las notificaciones" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />;
  return (
    <Section titulo="Notificaciones por correo">
      {!data || data.length === 0 ? (
        <EmptyState titulo="Sin correos" descripcion="Aún no se han enviado notificaciones." />
      ) : (
        <Table caption="Notificaciones de la empresa">
          <thead>
            <tr>
              <th scope="col">Tipo</th>
              <th scope="col">Destinatario</th>
              <th scope="col">Asunto</th>
              <th scope="col">Estado</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {data.map((n) => (
              <tr key={n.emailId}>
                <td>{n.tipo}</td>
                <td>{n.destinatario}</td>
                <td>{n.asunto ?? "—"}</td>
                <td><Badge variant={n.estado === "enviado" ? "exito" : "advertencia"}>{n.estado}</Badge></td>
                <td>{fmt(n.sentAt ?? n.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

/* ------------------------------ Auditoría ------------------------------- */

function PanelAuditoria() {
  const { data, isLoading, error, refetch } = useAuditoriaTenant();
  if (isLoading) return <div role="status"><Spinner /> <span>Cargando auditoría…</span></div>;
  if (error) return <ErrorState titulo="No se pudo cargar la auditoría" descripcion={mensajeDeError(error)} onReintentar={() => void refetch()} />;
  return (
    <Section titulo="Auditoría de la empresa">
      {!data || data.length === 0 ? (
        <EmptyState titulo="Sin eventos" descripcion="No hay eventos de auditoría registrados." />
      ) : (
        <Table caption="Eventos de auditoría del tenant" compacta>
          <thead>
            <tr>
              <th scope="col">Acción</th>
              <th scope="col">Actor</th>
              <th scope="col">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e, i) => (
              <tr key={i}>
                <td>{e.action}</td>
                <td>{e.actorId}</td>
                <td>{fmt(e.occurredAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

/* -------------------------------- Página -------------------------------- */

export default function AdministracionConfiguracion() {
  return (
    <AppShellIdentidad>
      <GuardarAdmin>
        <Tabs
          items={[
            { id: "general", etiqueta: "Regional", contenido: <PanelGeneral /> },
            { id: "branding", etiqueta: "Branding", contenido: <PanelBranding /> },
            { id: "modulos", etiqueta: "Módulos", contenido: <PanelModulos /> },
            { id: "notificaciones", etiqueta: "Notificaciones", contenido: <PanelNotificaciones /> },
            { id: "auditoria", etiqueta: "Auditoría", contenido: <PanelAuditoria /> },
          ]}
        />
      </GuardarAdmin>
    </AppShellIdentidad>
  );
}

function GuardarAdmin({ children }: { children: React.ReactNode }) {
  const { capacidades } = useSesion();
  if (!capacidades.configurarEmpresa) {
    return (
      <Section titulo="Configuración de la empresa">
        <Alert variant="advertencia" titulo="Acceso restringido">
          Esta superficie es para administradores de la empresa. Tu rol no tiene permiso para gestionarla.
        </Alert>
      </Section>
    );
  }
  return <>{children}</>;
}
