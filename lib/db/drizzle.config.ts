import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

/**
 * DGP-023.5 (FASE 7): las migraciones (drizzle-kit) deben ejecutarse con el rol
 * `deltaops_owner` (dueño del esquema/objetos), NUNCA con el rol de runtime.
 * La URL de migración se COMPONE desde el entorno (host/puerto/base de PG* +
 * usuario `deltaops_owner` + secreto `DELTAOPS_OWNER_PASSWORD`); si el secreto
 * no está, *fallback* a `DATABASE_URL` (admin). Sin literales en el repo.
 */
function resolveMigrationUrl(): string {
  const ownerPassword = process.env.DELTAOPS_OWNER_PASSWORD;
  const host = process.env.PGHOST;
  const port = process.env.PGPORT ?? "5432";
  const database = process.env.PGDATABASE;
  if (ownerPassword && host && database) {
    const user = process.env.DELTAOPS_OWNER_USER ?? "deltaops_owner";
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(ownerPassword)}`;
    return `postgres://${auth}@${host}:${port}/${database}`;
  }
  return process.env.DATABASE_URL as string;
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: resolveMigrationUrl(),
  },
});
