/**
 * DGP-017 · Envoltura visual común de las superficies de autenticación pública
 * (login, recuperación, restablecer, invitación). Sólo tokens del DS. AA.
 */
import React from "react";
import { ThemeProvider, Logo } from "@workspace/design-system";

export function AuthLayout({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <div
        className="do-root"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--do-bg)", padding: "var(--do-sp-4)" }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: 420,
            display: "flex",
            flexDirection: "column",
            gap: "var(--do-sp-6)",
            background: "var(--do-surface)",
            border: "1px solid var(--do-borde)",
            borderRadius: "var(--do-radio-lg, 12px)",
            padding: "var(--do-sp-8)",
          }}
        >
          <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "var(--do-sp-3)", alignItems: "center" }}>
            <Logo variant="imagotipo-auto" width={160} alt="DeltaOps" />
            <h1 style={{ fontSize: "var(--do-text-xl)", margin: 0 }}>{titulo}</h1>
            {descripcion && (
              <p style={{ color: "var(--do-texto-suave)", margin: 0, fontSize: "var(--do-text-sm)" }}>{descripcion}</p>
            )}
          </div>
          {children}
        </main>
      </div>
    </ThemeProvider>
  );
}

/** Requisitos de contraseña mostrados de forma accesible. */
export function RequisitosContrasena({ password }: { password: string }) {
  const reglas = [
    { ok: password.length >= 8, texto: "Al menos 8 caracteres" },
    { ok: /[A-Za-z]/.test(password), texto: "Al menos una letra" },
    { ok: /[0-9]/.test(password), texto: "Al menos un número" },
  ];
  return (
    <ul style={{ margin: 0, paddingLeft: "var(--do-sp-5)", fontSize: "var(--do-text-sm)", color: "var(--do-texto-suave)" }}>
      {reglas.map((r) => (
        <li key={r.texto} style={{ color: r.ok ? "var(--do-exito)" : "var(--do-texto-suave)" }}>
          {r.ok ? "✓ " : "• "}
          {r.texto}
        </li>
      ))}
    </ul>
  );
}

/** ¿La contraseña cumple los requisitos mínimos visibles? */
export function contrasenaValida(password: string): boolean {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}
