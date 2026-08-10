/**
 * DGP-017 · Solicitud de recuperación de contraseña (`/recuperar`).
 *
 * Respuesta NEUTRA anti-enumeración: se muestre o no un usuario, el mensaje de
 * éxito es idéntico. Sólo DS. AA (aria-live, labels, foco).
 */
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Field, Input, Button, Alert } from "@workspace/design-system";
import { AuthLayout } from "@/lib/identidad/AuthLayout";
import { forgotPassword } from "@/lib/identidad/endpoints";
import { esFalloDeRed } from "@/lib/identidad/api";

const MENSAJE_NEUTRO =
  "Si el correo corresponde a una cuenta, enviaremos instrucciones para restablecer la contraseña.";

export default function Recuperar() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errorRed, setErrorRed] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setErrorRed(false);
    try {
      await forgotPassword({ email });
      setEnviado(true);
    } catch (err) {
      // El endpoint es neutro (202); sólo un fallo de red se comunica.
      if (esFalloDeRed(err)) setErrorRed(true);
      else setEnviado(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <AuthLayout titulo="Recuperar contraseña" descripcion="Te enviaremos un enlace seguro a tu correo.">
      <div aria-live="polite">
        {enviado && (
          <Alert variant="info" titulo="Revisa tu correo">
            {MENSAJE_NEUTRO}
          </Alert>
        )}
        {errorRed && (
          <Alert variant="error" titulo="Sin conexión" onClose={() => setErrorRed(false)}>
            No se pudo enviar la solicitud. Verifica tu red e intenta de nuevo.
          </Alert>
        )}
      </div>

      {!enviado && (
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-5)" }} noValidate>
          <Field label="Correo electrónico" required>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              placeholder="nombre@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" variant="primario" disabled={cargando || !email}>
            {cargando ? "Enviando…" : "Enviar instrucciones"}
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
