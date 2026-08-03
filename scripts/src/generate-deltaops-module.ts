import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

/**
 * DeltaOps · DGP-001 — Generador oficial de módulos.
 * Genera el esqueleto estándar de un módulo DeltaOps (router backend +
 * esquema Drizzle) siguiendo las convenciones de la fábrica. Los DGP
 * funcionales futuros parten de este molde; el contrato OpenAPI se declara
 * primero en lib/api-spec/openapi.yaml (contract-first, CP-02).
 *
 * Uso: pnpm --filter @workspace/scripts run generate:module -- <nombre-kebab>
 */
function toPascal(kebab: string): string {
  return kebab
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const name = process.argv[2];
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    console.error(
      "Uso: pnpm --filter @workspace/scripts run generate:module -- <nombre-kebab>",
    );
    process.exit(1);
  }

  const pascal = toPascal(name);
  const root = path.resolve(import.meta.dirname, "..", "..");
  const routeDir = path.join(root, "artifacts/api-server/src/routes/deltaops");
  const routeFile = path.join(routeDir, `${name}.ts`);
  const schemaFile = path.join(root, `lib/db/src/schema/deltaops-${name}.ts`);

  for (const f of [routeFile, schemaFile]) {
    if (await exists(f)) {
      console.error(`Ya existe: ${f} — el generador no sobrescribe.`);
      process.exit(1);
    }
  }

  await mkdir(routeDir, { recursive: true });

  await writeFile(
    routeFile,
    `import { Router, type IRouter } from "express";

/**
 * DeltaOps — módulo ${name} (generado por el generador oficial).
 * 1. Declare el contrato en lib/api-spec/openapi.yaml (prefijo /deltaops/${name}).
 * 2. Ejecute codegen: pnpm --filter @workspace/api-spec run codegen
 * 3. Implemente validando entradas/salidas con @workspace/api-zod.
 * 4. Monte este router en src/routes/deltaops/index.ts.
 */
const router: IRouter = Router();

router.get("/deltaops/${name}", async (_req, res): Promise<void> => {
  res.json([]);
});

export default router;
`,
  );

  await writeFile(
    schemaFile,
    `import { integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { deltaopsSchema } from "./deltaops";

/**
 * DeltaOps — tabla ${name} (generada por el generador oficial).
 * Vive en el esquema PostgreSQL "deltaops". Añada la migración SQL numerada
 * correspondiente en lib/db/migrations/deltaops/ y expórtela en schema/index.ts.
 */
export const deltaops${pascal}Table = deltaopsSchema.table("${name.replace(/-/g, "_")}", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nombre: varchar("nombre", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
`,
  );

  console.log(`Módulo "${name}" generado:`);
  console.log(`  - ${path.relative(root, routeFile)}`);
  console.log(`  - ${path.relative(root, schemaFile)}`);
  console.log(
    "Pasos siguientes: contrato OpenAPI → codegen → montar router → migración SQL.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
