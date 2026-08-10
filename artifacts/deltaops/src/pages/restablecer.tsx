/**
 * DGP-017 · Restablecer contraseña con token (`/restablecer?token=&tenantId=`).
 *
 * Valida el token (implícito al enviar), exige nueva contraseña con confirmación
 * y requisitos visibles; en éxito redirige a /login. Token inválido/expirado se
 * comunica de forma accesible. Sólo DS.
 */
import React, { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Field, PasswordInput, Button, Alert } from "@workspace/design-system";
import { AuthLayout, RequisitosContrasena, contrasenaValida } from "@/lib/identidad/AuthLayout";
import { resetPassword } from "@/lib/identidad/endpoints";
import { IdentidadError, esFalloDeRed } from "@/lib/identidad/api";

export default function Restablecer() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const tenantId = params.get("tenantId") ?? "";

  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenPresente = Boolean(token && tenantId);
  const coincide = password === confirmacion;
  const puedeEnviar = tokenPresente && contrasenaValida(password) && coincide && !cargando;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      await resetPassword({ tenantId, token, password });
      setOk(true);
      setTimeout(() => setLocation("/login"), 1500);
    } catch (err) {
      if (esFalloDeRed(err)) setError("No hay conexión con el servidor. Intenta de nuevo.");
      else if (err instanceof IdentidadError)
        setError("El enlace es inválido o expiró. Solicita uno nuevo desde “¿Olvidaste tu contraseña?”.");
      else setError("No se pudo restablecer la contraseña.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthLayout titulo="Nueva contraseña" descripcion="Define una contraseña segura para tu cuenta.">
      <div aria-live="assertive">
        {ok && (
          <Alert variant="exito" titulo="Contraseña actualizada">
            Tu contraseña se cambió correctamente. Te llevaremos a iniciar sesión.
          </Alert>
        )}
        {error && (
          <Alert variant="error" titulo="No se pudo continuar" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {!tokenPresente && !ok && (
          <Alert variant="advertencia" titulo="Enlace incompleto">
            Este enlace de restablecimiento no es válido. Solicita uno nuevo.
          </Alert>
        )}
      </div>

      {!ok && tokenPresente && (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }} noValidate>
          <Field label="Nueva contraseña" required>
            <PasswordInput
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
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
            {cargando ? "Guardando…" : "Cambiar contraseña"}
          </Button>
        </form>
      )}

      <div style={{ textAlign: "center" }}>
        <Button variant="fantasma" size="sm" onClick={() => setLocation("/login")} type="button">
          ← Volver a iniciar sesión
        </Button>
      </div>
    </AuthLayout>
  );
}
