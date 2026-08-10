/**
 * DGP-017 · Aceptar invitación (`/invitacion?token=&tenantId=`).
 *
 * El invitado establece su nombre y contraseña; al aceptar, su cuenta queda
 * activa y se le lleva a iniciar sesión. Token inválido/expirado/revocado se
 * comunica de forma accesible. Sólo DS.
 */
import React, { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Field, Input, PasswordInput, Button, Alert } from "@workspace/design-system";
import { AuthLayout, RequisitosContrasena, contrasenaValida } from "@/lib/identidad/AuthLayout";
import { aceptarInvitacion } from "@/lib/identidad/endpoints";
import { IdentidadError, esFalloDeRed } from "@/lib/identidad/api";

export default function Invitacion() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const tenantId = params.get("tenantId") ?? "";

  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenPresente = Boolean(token && tenantId);
  const coincide = password === confirmacion;
  const puedeEnviar = tokenPresente && nombre.trim().length > 0 && contrasenaValida(password) && coincide && !cargando;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      await aceptarInvitacion({ tenantId, token, nombre: nombre.trim(), password });
      setOk(true);
      setTimeout(() => setLocation("/login"), 1500);
    } catch (err) {
      if (esFalloDeRed(err)) setError("No hay conexión con el servidor. Intenta de nuevo.");
      else if (err instanceof IdentidadError)
        setError("La invitación es inválida, expiró o ya fue utilizada. Solicita una nueva a tu administrador.");
      else setError("No se pudo aceptar la invitación.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthLayout titulo="Aceptar invitación" descripcion="Completa tus datos para activar tu cuenta.">
      <div aria-live="assertive">
        {ok && (
          <Alert variant="exito" titulo="Cuenta activada">
            Tu cuenta está lista. Te llevaremos a iniciar sesión.
          </Alert>
        )}
        {error && (
          <Alert variant="error" titulo="No se pudo continuar" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {!tokenPresente && !ok && (
          <Alert variant="advertencia" titulo="Enlace incompleto">
            Esta invitación no es válida. Solicita una nueva a tu administrador.
          </Alert>
        )}
      </div>

      {!ok && tokenPresente && (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }} noValidate>
          <Field label="Nombre completo" required>
            <Input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
          </Field>
          <Field label="Contraseña" required>
            <PasswordInput name="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <RequisitosContrasena password={password} />
          <Field
            label="Confirmar contraseña"
            required
            error={confirmacion && !coincide ? "Las contraseñas no coinciden." : undefined}
          >
            <PasswordInput
              name="confirmacion"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" variant="primario" disabled={!puedeEnviar}>
            {cargando ? "Activando…" : "Aceptar y activar cuenta"}
          </Button>
        </form>
      )}

      <div style={{ textAlign: "center" }}>
        <Button variant="fantasma" size="sm" onClick={() => setLocation("/login")} type="button">
          ← Ir a iniciar sesión
        </Button>
      </div>
    </AuthLayout>
  );
}
