/**
 * DIRECTIVA CONSISTENCIA VISUAL · Req 8 — Sin desbordamiento horizontal en móvil.
 *
 * E2E visual detectó scroll horizontal de página en ~390px (p. ej.
 * /correctivo/solicitudes: scrollWidth 613 vs clientWidth 375). Guardas de
 * fuente para evitar la regresión de las DOS causas comunes:
 *   1. rejillas `minmax(NNNpx, 1fr)` sin `min(NNNpx, 100%)` — fuerzan pistas
 *      más anchas que el viewport;
 *   2. ausencia de la capa de contención de overflow en `index.css`, que
 *      permite que las envolturas scrollables (tablas) empujen la página en
 *      lugar de desplazarse dentro de su contenedor.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, ".."); // .../src

function leer(rel: string): string {
  return readFileSync(resolve(raiz, rel), "utf8");
}

/** Recolecta *.tsx bajo un directorio, recursivamente, excluyendo tests. */
function tsxRecursivo(relDir: string): string[] {
  const abs = resolve(raiz, relDir);
  const salida: string[] = [];
  for (const ent of readdirSync(abs, { withFileTypes: true })) {
    if (ent.name === "__tests__") continue;
    const rel = join(relDir, ent.name);
    if (ent.isDirectory()) salida.push(...tsxRecursivo(rel));
    else if (ent.name.endsWith(".tsx")) salida.push(rel);
  }
  return salida;
}

// Todas las superficies de módulos + centro (pages) y sus componentes (lib).
const ARCHIVOS = [...tsxRecursivo("pages"), ...tsxRecursivo("lib")];

// `minmax(` seguido directamente de un número en px (sin `min(`).
const MINMAX_DURO = /minmax\(\s*\d+px/;

describe("Req 8 · rejillas responsivas (minmax con min(…, 100%))", () => {
  it("ninguna página/componente usa minmax(NNNpx, …) sin envolver en min()", () => {
    const infractores = ARCHIVOS.filter((rel) => MINMAX_DURO.test(leer(rel)));
    expect(infractores, `Rejillas con minmax de ancho fijo (usar minmax(min(NNNpx, 100%), 1fr)):\n${infractores.join("\n")}`).toEqual([]);
  });
});

describe("Req 8 · capa de contención de overflow en index.css", () => {
  const css = leer("index.css");

  it("la raíz de superficie no provoca scroll horizontal de página", () => {
    expect(css).toMatch(/\.do-root\s*\{[\s\S]*?max-width:\s*100%/);
    expect(css).toMatch(/\.do-root\s*\{[\s\S]*?overflow-x:\s*clip/);
  });

  it("la envoltura de tabla del DS puede encogerse dentro de su contenedor", () => {
    expect(css).toContain(".do-tabla__envoltura");
    expect(css).toMatch(/\.do-tabla__envoltura\s*\{[\s\S]*?min-width:\s*0/);
  });

  it("los contenedores scrollables shadcn (overflow-auto) pueden encogerse", () => {
    expect(css).toContain(".overflow-auto");
    expect(css).toMatch(/overflow-auto[\s\S]*?min-width:\s*0/);
  });

  it("los hijos de flex/grid en superficies pueden encogerse (min-width:0)", () => {
    expect(css).toMatch(/\.do-root :where\(main, section, article[\s\S]*?min-width:\s*0/);
  });

  it("la contención cubre los envoltorios de contenido del DS (Section/Card)", () => {
    // El DS envuelve el contenido de Section/Card en `.do-section__contenido` y
    // `.do-card__content`. Sin ellos en la capa de contención, una tabla/rejilla
    // anidada un nivel más adentro empuja la página en móvil (regresión real de
    // /utilizacion/lecturas: scrollWidth 789 vs 375). La regla `:where(…)` que
    // aplica `min-width:0` a los hijos directos debe incluir ambos envoltorios.
    const regla = css.match(/\.do-root :where\(([^)]*)\)\s*>\s*\*\s*\{[^}]*min-width:\s*0[^}]*\}/);
    expect(regla, "no se encontró la regla de contención `:where(...) > * { min-width:0 }`").toBeTruthy();
    const lista = regla![1];
    expect(lista).toContain(".do-section__contenido");
    expect(lista).toContain(".do-card__content");
  });
});

/* ------------------------------------------------------------------ */
/* Guarda estructural del módulo Utilización: las tablas deben ir en   */
/* el componente `Table` del DS (que renderiza `.do-tabla__envoltura`  */
/* con overflow-x:auto), nunca `<table>` suelto que empujaría la página*/
/* ------------------------------------------------------------------ */
describe("Req 8 · módulo Utilización — tablas en el envoltorio desplazable del DS", () => {
  const PAGINAS = tsxRecursivo("pages").filter((r) => /utilizacion-/.test(r));

  it("las páginas de utilización existen y se escanean", () => {
    expect(PAGINAS.length).toBeGreaterThanOrEqual(5);
  });

  it("ninguna página de utilización usa `<table>` crudo (usar el componente Table)", () => {
    const infractores = PAGINAS.filter((rel) => /<table[\s>]/.test(leer(rel)));
    expect(infractores, `Tablas crudas fuera de <Table> del DS:\n${infractores.join("\n")}`).toEqual([]);
  });

  it("las páginas con tabla la renderizan con el componente `Table` del DS", () => {
    for (const rel of PAGINAS) {
      const src = leer(rel);
      if (/<thead[\s>]/.test(src)) {
        expect(/<Table[\s>]/.test(src), `${rel} usa <thead> sin el componente <Table> del DS`).toBe(true);
      }
    }
  });

  // Regresión E2E real (~375-500px): una tabla ancha del DS infla
  // `document.documentElement.scrollWidth` (scroll de PÁGINA) aunque `body` esté
  // recortado, porque su contenido desborda dentro del `overflow-x:auto` de la
  // envoltura. El patrón sistémico del DS (Activos) es tabla en desktop +
  // tarjetas en móvil. Toda página de utilización con tabla DEBE ofrecer ambas
  // variantes con `.do-solo-desktop` / `.do-solo-movil`.
  it("las páginas de lista con tabla ofrecen variante de tarjetas en móvil", () => {
    const conTabla = PAGINAS.filter((rel) => /<Table[\s>]/.test(leer(rel)));
    expect(conTabla.length, "se esperaban páginas de lista con tabla (lecturas/tanqueos)").toBeGreaterThanOrEqual(2);
    const sinResponsive = conTabla.filter((rel) => {
      const src = leer(rel);
      return !(src.includes("do-solo-desktop") && src.includes("do-solo-movil"));
    });
    expect(
      sinResponsive,
      `Tablas sin variante responsive (añadir .do-solo-desktop tabla + .do-solo-movil tarjetas):\n${sinResponsive.join("\n")}`,
    ).toEqual([]);
  });
});
