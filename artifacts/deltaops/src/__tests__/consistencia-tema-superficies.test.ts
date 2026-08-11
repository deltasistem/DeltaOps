/**
 * DIRECTIVA CONSISTENCIA VISUAL · Guardas de código fuente sobre las superficies.
 *
 * CAUSA RAÍZ corregida: cada Shell de módulo (órdenes, activos, inventario,
 * planes, abastecimiento, preventivo, correctivo, analytics) fijaba
 * `data-do-theme="light"` en su `.do-root`, forzando tema CLARO e ignorando la
 * preferencia global — de ahí que el Centro (dark/auto) y los módulos (light) se
 * vieran como dos productos distintos. Estas guardas evitan la regresión:
 *  - ninguna superficie de producto vuelve a fijar el tema de forma dura;
 *  - la consola SUPER_ADMIN monta el selector de apariencia (Req 6);
 *  - el ThemeProvider raíz vive en App.tsx (autoridad única, Req 1-2).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, ".."); // .../src

function leer(rel: string): string {
  return readFileSync(resolve(raiz, rel), "utf8");
}

const SHELLS = [
  "lib/ordenes/Shell.tsx",
  "lib/activos/Shell.tsx",
  "lib/inventario/Shell.tsx",
  "lib/planes/Shell.tsx",
  "lib/abastecimiento/Shell.tsx",
  "lib/preventivo/Shell.tsx",
  "lib/correctivo/Shell.tsx",
  "lib/analytics/Shell.tsx",
];

describe("superficies · sin tema forzado (causa raíz corregida)", () => {
  it.each(SHELLS)("%s no fija data-do-theme=\"light\"", (rel) => {
    expect(leer(rel)).not.toContain('data-do-theme="light"');
  });

  it("las páginas técnicas (consola-activos, motores) tampoco fuerzan tema claro", () => {
    for (const rel of ["pages/consola-activos.tsx", "pages/motores.tsx", "pages/motores-playground.tsx"]) {
      expect(leer(rel)).not.toContain('data-do-theme="light"');
    }
  });

  it("el AppShell empresarial no fija data-do-theme=\"light\"", () => {
    expect(leer("lib/identidad/AppShell.tsx")).not.toContain('data-do-theme="light"');
  });
});

describe("autoridad única de la preferencia (Req 1-2)", () => {
  it("App.tsx monta el ThemeProvider del DS a nivel raíz", () => {
    const app = leer("App.tsx");
    expect(app).toContain("ThemeProvider");
    // Debe envolver el árbol de la app (por encima del Router de sesión).
    expect(app).toMatch(/<ThemeProvider>[\s\S]*<WouterRouter/);
  });
});

describe("Req 6 · la consola SUPER_ADMIN respeta la preferencia", () => {
  it("console.tsx monta el SelectorApariencia", () => {
    const console = leer("pages/console.tsx");
    expect(console).toContain("SelectorApariencia");
    expect(console).toContain('from "@/lib/identidad/SelectorApariencia"');
  });
});

describe("Req 5 · el selector vive en el menú de perfil del AppShell", () => {
  it("AppShell.tsx incorpora la opción Apariencia y el OpcionesApariencia", () => {
    const shell = leer("lib/identidad/AppShell.tsx");
    expect(shell).toContain("OpcionesApariencia");
    expect(shell).toMatch(/etiqueta:\s*"Apariencia"/);
  });
});
