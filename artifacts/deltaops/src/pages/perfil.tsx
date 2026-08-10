/**
 * DGP-017 · Perfil del usuario y cambio de contraseña (`/perfil`,
 * `/perfil/contrasena`). Muestra identidad, empresa y rol; permite cambiar la
 * contraseña con requisitos visibles. Sólo DS, dentro del AppShell autenticado.
 */
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Section, Field, PasswordInput, Button, Alert, Card, CardContent, Badge } from "@workspace/design-system";
import { AppShellIdentidad } from "@/lib/identidad/AppShell";
import { useSesionActiva } from "@/lib/identidad/sesion";
import { nombreRol } from "@/lib/identidad/rbac";
import { cambiarPassword } from "@/lib/identidad/endpoints";
import { RequisitosContrasena, contrasenaValida } from "@/lib/identidad/AuthLayout";
import { IdentidadError, esFalloDeRed } from "@/lib/identidad/api";

function FichaPerfil() {
  const sesion = useSesionActiva();
  return (
    <Card role="group" aria-label="Datos de la cuenta">
      <CardContent>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--do-sp-2) var(--do-sp-4)", margin: 0 }}>
          <dt style={{ color: "var(--do-texto-suave)" }}>Nombre</dt>
          <dd style={{ margin: 0 }}>{sesion.nombre}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Correo</dt>
          <dd style={{ margin: 0 }}>{sesion.email}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Empresa</dt>
          <dd style={{ margin: 0 }}>{sesion.tenant.nombre}</dd>
          <dt style={{ color: "var(--do-texto-suave)" }}>Rol</dt>
          <dd style={{ margin: 0 }}>
            <Badge variant="info">{nombreRol(sesion.rol)}</Badge>
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function CambioContrasena() {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coincide = nueva === confirmacion;
  const puede = actual.length > 0 && contrasenaValida(nueva) && coincide && !cargando;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setOk(false);
    try {
      await cambiarPassword({ actual, nueva });
      setOk(true);
      setActual("");
      setNueva("");
      setConfirmacion("");
    } catch (err) {
      if (esFalloDeRed(err)) setError("No hay conexión con el servidor.");
      else if (err instanceof IdentidadError && err.status === 401)
        setError("La contraseña actual no es correcta.");
      else setError("No se pudo cambiar la contraseña.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <Section titulo="Cambiar contraseña">
      <div aria-live="assertive">
        {ok && (
          <Alert variant="exito" titulo="Contraseña actualizada">
            Tu contraseña se cambió correctamente.
          </Alert>
        )}
        {error && (
          <Alert variant="error" titulo="No se pudo cambiar" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </div>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-5)", maxWidth: 420, marginTop: "var(--do-sp-4)" }} noValidate>
        <Field label="Contraseña actual" required>
          <PasswordInput autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        </Field>
        <Field label="Nueva contraseña" required>
          <PasswordInput autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} required />
        </Field>
        <RequisitosContrasena password={nueva} />
        <Field
          label="Confirmar nueva contraseña"
          required
          error={confirmacion && !coincide ? "Las contraseñas no coinciden." : undefined}
        >
          <PasswordInput autoComplete="new-password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} required />
        </Field>
        <Button type="submit" variant="primario" disabled={!puede}>
          {cargando ? "Guardando…" : "Cambiar contraseña"}
        </Button>
      </form>
    </Section>
  );
}

export default function Perfil() {
  const [location] = useLocation();
  const soloContrasena = location === "/perfil/contrasena";
  return (
    <AppShellIdentidad>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-6)" }}>
        <Section titulo="Mi perfil">
          <div style={{ marginTop: "var(--do-sp-4)" }}>
            <FichaPerfil />
          </div>
        </Section>
        {(!soloContrasena || soloContrasena) && <CambioContrasena />}
      </div>
    </AppShellIdentidad>
  );
}
