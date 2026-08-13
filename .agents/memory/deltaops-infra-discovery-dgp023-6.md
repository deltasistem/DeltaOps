---
name: Discovery Infra/Secrets DGP-023.6
description: Riesgos de infraestructura y configuración para producción detectados en el discovery (fallback a superusuario, CORS, health gate, shutdown).
---

# Discovery Infra/Secrets (DGP-023.6) — hallazgos durables

Doc: `docs/dgp/DGP-023.6-DESCUBRIMIENTO-INFRA-SECRETS.md` (revisión independiente PASS).

- **I-03 (ALTO, cuasi-bloqueante de prod):** el pool cae SILENCIOSAMENTE a `DATABASE_URL` (postgres superuser+BYPASSRLS) si falta `DELTAOPS_APP_PASSWORD`/PG* — sin distinguir NODE_ENV ni loguear. En producción reabriría H-02.
  **How to apply:** el hardening debe hacer fail-fast en `NODE_ENV=production` cuando falte la credencial de mínimo privilegio; hasta entonces, vigilar que los secrets existan en cada entorno.
- **I-05 (ALTO):** `app.use(cors())` sin opciones = wildcard; hoy mitigado por same-origin y sin credentials, pero exige allowlist para prod externa.
- **I-09 (MEDIO):** el health gate del deploy apunta a `/health` (liveness-only, siempre 200); `/ready` (SELECT 1 + SESSION_SECRET, 503) existe pero NO es el gate — un deploy puede marcar sano un proceso sin DB.
- **I-02 (MEDIO):** `SESSION_SECRET` se reutiliza como clave HMAC de URLs firmadas de adjuntos — rotar el secret invalida URLs firmadas; separar claves en hardening.
- **I-09b (BAJO):** secrets `M365_*` sin consumo en código (Graph lee `GRAPH_*`) — probable legado, candidatos a limpieza.
- **I-08 (MEDIO):** `.gitignore` no ignora `.env`.
- **I-10 (MEDIO):** sin graceful shutdown (SIGTERM/server.close/pool.end) en runtime.
- Cero secretos reales en repo/commits (30 últimos); fixtures de test con valores autoevidentemente falsos son ACEPTABLE pero deben enumerarse en auditorías para no parecer omisión.
- Frontend prod es estático (`serve=static`): allowedHosts/0.0.0.0 de vite solo aplican a dev. Storage referencia-only (sin blobs locales). Email Graph con fail-fast en prod. Runtime sin dependencias de APIs Replit (la DB Helium sí es dependencia de datos).
