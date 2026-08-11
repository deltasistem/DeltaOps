/**
 * DGP-017 (corrección de separación por rol) · Landing EMPRESARIAL del tenant.
 *
 * Superficie de inicio para los roles de negocio (TENANT_ADMIN, SUPERVISOR,
 * PLANIFICADOR, TECNICO, CONSULTA). Vive dentro del AppShell empresarial de
 * identidad (encabezado con empresa/usuario/rol, branding del tenant y
 * navegación por módulos habilitados). NUNCA muestra la consola técnica global
 * (Estado Global / Uptime / Readiness / Información de Sistema): esos conceptos
 * son exclusivos del SUPER_ADMIN.
 *
 * No es un rediseño ni un nuevo sistema de navegación: sólo compone tarjetas de
 * acceso a superficies YA existentes con el Design System, priorizando la
 * entrada operacional que corresponde al rol y respetando los entitlements.
 */
import React from "react";
import { Link } from "wouter";
import { Section, Card, CardContent, CardHeader, Button, Badge, EmptyState } from "@workspace/design-system";
import { ArrowRight, Building2, Users, SlidersHorizontal } from "lucide-react";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesionActiva, useSesion } from "@/lib/identidad/sesion";
import { landingOperacional, modulosVisibles, nombreRol } from "@/lib/identidad/rbac";

function TarjetaAcceso({ titulo, descripcion, ruta, destacada = false }: { titulo: string; descripcion: string; ruta: string; destacada?: boolean }) {
  return (
    <Card style={destacada ? { borderColor: "var(--do-primario)", borderWidth: 2 } : undefined}>
      <CardContent>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
            <h3 style={{ margin: 0, fontSize: "var(--do-text-lg)" }}>{titulo}</h3>
            {destacada && <Badge variant="primario">Recomendado</Badge>}
          </div>
          <p style={{ margin: 0, color: "var(--do-texto-suave)" }}>{descripcion}</p>
          <div>
            <Link href={ruta}>
              <Button variant={destacada ? "primario" : "secundario"} size="sm">
                Abrir <ArrowRight size={16} aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ContenidoInicio() {
  const sesion = useSesionActiva();
  const { capacidades } = useSesion();
  const landing = landingOperacional(sesion);
  const modulos = modulosVisibles(sesion);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-6)" }}>
      <Section titulo={`Bienvenido, ${sesion.nombre}`}>
        <p style={{ color: "var(--do-texto-suave)", marginTop: "var(--do-sp-2)" }}>
          <Building2 size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> {sesion.tenant.nombre}
          {" · "}
          <Badge variant="info">{nombreRol(sesion.rol)}</Badge>
        </p>
      </Section>

      {landing && (
        <Section titulo="Tu punto de partida">
          <div style={{ marginTop: "var(--do-sp-3)" }}>
            <TarjetaAcceso
              titulo={landing.etiqueta}
              descripcion="Superficie operacional destacada para tu perfil."
              ruta={landing.ruta}
              destacada
            />
          </div>
        </Section>
      )}

      <Section titulo="Módulos disponibles">
        {modulos.length === 0 ? (
          <EmptyState
            titulo="Sin módulos habilitados"
            descripcion="Tu empresa aún no tiene módulos operativos habilitados. Contacta a tu administrador."
          />
        ) : (
          <div
            style={{
              display: "grid",
              gap: "var(--do-sp-4)",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              marginTop: "var(--do-sp-3)",
            }}
          >
            {modulos.map((m) => (
              <TarjetaAcceso key={m.modulo} titulo={m.nombre} descripcion={`Ir a ${m.nombre}.`} ruta={m.ruta} />
            ))}
          </div>
        )}
      </Section>

      {(capacidades.administrarUsuarios || capacidades.configurarEmpresa) && (
        <Section titulo="Administración de la empresa">
          <div
            style={{
              display: "grid",
              gap: "var(--do-sp-4)",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              marginTop: "var(--do-sp-3)",
            }}
          >
            {capacidades.administrarUsuarios && (
              <Card>
                <CardHeader>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                    <Users size={18} aria-hidden="true" /> Usuarios
                  </span>
                </CardHeader>
                <CardContent>
                  <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)" }}>
                    Gestiona usuarios, roles e invitaciones de tu empresa.
                  </p>
                  <Link href="/administracion/usuarios">
                    <Button variant="secundario" size="sm">Administrar usuarios</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
            {capacidades.configurarEmpresa && (
              <Card>
                <CardHeader>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--do-sp-2)" }}>
                    <SlidersHorizontal size={18} aria-hidden="true" /> Configuración
                  </span>
                </CardHeader>
                <CardContent>
                  <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)" }}>
                    Idioma, zona horaria, moneda, branding y notificaciones.
                  </p>
                  <Link href="/administracion/configuracion">
                    <Button variant="secundario" size="sm">Configurar empresa</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

export default function InicioEmpresa() {
  return (
    <AppShellIdentidad>
      <ContenidoInicio />
    </AppShellIdentidad>
  );
}
