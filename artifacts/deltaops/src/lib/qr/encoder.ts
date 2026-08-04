/**
 * DGP-008.3 · Codificador QR mínimo y autocontenido (sin dependencias).
 *
 * Implementa el modo BYTE con corrección de errores nivel M, selección
 * automática de versión (1–10, suficiente para códigos/URLs de activos) y
 * generación de la matriz de módulos. La app la renderiza como SVG con tokens
 * --do-*. Basado en la especificación ISO/IEC 18004 (Reed–Solomon sobre GF(256)).
 *
 * Alcance acotado: versiones 1–10, EC nivel M, un solo bloque o los bloques que
 * la especificación define por versión. Cubre holgadamente los payloads del
 * módulo (p.ej. "activo:<uuid>" o URLs de la app).
 */

/* ------------------------------- GF(256) --------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Divide el mensaje por el polinomio generador y devuelve los códigos EC. */
function reedSolomon(data: number[], ecLen: number): number[] {
  // Polinomio generador.
  const gen = [1];
  for (let i = 0; i < ecLen; i++) {
    for (let j = gen.length; j > 0; j--) {
      gen[j] = (gen[j] ?? 0) ^ mul(gen[j - 1], EXP[i]);
    }
    gen[0] = mul(gen[0], EXP[i]);
  }
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ (res.shift() ?? 0);
    res.push(0);
    for (let i = 0; i < gen.length; i++) {
      res[i] ^= mul(gen[i], factor);
    }
  }
  return res.slice(0, ecLen);
}

/* ---------------------- Tablas de capacidad (EC-M) ----------------------- */

/** Nº total de codewords de datos por versión (EC nivel M). */
const DATA_CODEWORDS_M: Record<number, number> = {
  1: 16, 2: 28, 3: 44, 4: 64, 5: 86, 6: 108, 7: 124, 8: 154, 9: 182, 10: 216,
};
/** Nº de codewords EC por bloque (EC nivel M). */
const EC_PER_BLOCK_M: Record<number, number> = {
  1: 10, 2: 16, 3: 26, 4: 18, 5: 24, 6: 16, 7: 18, 8: 22, 9: 22, 10: 26,
};
/** Nº de bloques (EC nivel M). */
const BLOCKS_M: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 4, 7: 4, 8: 4, 9: 5, 10: 5,
};

const VERSIONES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Posiciones de los patrones de alineación por versión (2–10). */
const ALIGN_POS: Record<number, number[]> = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

/* ------------------------------ Utilidades ------------------------------- */

function bytesUtf8(texto: string): number[] {
  return Array.from(new TextEncoder().encode(texto));
}

function elegirVersion(len: number): number {
  for (const v of VERSIONES) {
    const total = DATA_CODEWORDS_M[v]!;
    // 4 bits de modo + bits del indicador de longitud (8 o 16) + datos.
    const lenBits = v >= 10 ? 16 : 8;
    const capacidadBits = total * 8;
    const requeridoBits = 4 + lenBits + len * 8;
    if (requeridoBits <= capacidadBits) return v;
  }
  throw new Error("Contenido demasiado largo para QR versión ≤ 10");
}

/* ----------------------------- Bit buffer -------------------------------- */

class BitBuffer {
  bits: number[] = [];
  put(val: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  }
  get length(): number {
    return this.bits.length;
  }
}

/* --------------------------- Matriz de módulos --------------------------- */

interface Matriz {
  size: number;
  modules: (boolean | null)[][];
}

function crearMatriz(version: number): Matriz {
  const size = version * 4 + 17;
  const modules: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array<boolean | null>(size).fill(null),
  );
  return { size, modules };
}

function colocarBuscador(m: Matriz, row: number, col: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;
      const dentro =
        (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      m.modules[rr]![cc] = dentro;
    }
  }
}

function colocarAlineacion(m: Matriz, version: number): void {
  const pos = ALIGN_POS[version];
  if (!pos) return;
  for (const r of pos) {
    for (const c of pos) {
      // Saltar solapes con los buscadores.
      if (m.modules[r]![c] !== null) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dentro = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          m.modules[r + dr]![c + dc] = dentro;
        }
      }
    }
  }
}

function colocarTemporizador(m: Matriz): void {
  for (let i = 8; i < m.size - 8; i++) {
    const val = i % 2 === 0;
    if (m.modules[6]![i] === null) m.modules[6]![i] = val;
    if (m.modules[i]![6] === null) m.modules[i]![6] = val;
  }
}

function reservarFormato(m: Matriz): void {
  // Se rellena luego; marcamos como reservado (no data) con false temporal.
  const s = m.size;
  for (let i = 0; i <= 8; i++) {
    if (m.modules[8]![i] === null) m.modules[8]![i] = false;
    if (m.modules[i]![8] === null) m.modules[i]![8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (m.modules[8]![s - 1 - i] === null) m.modules[8]![s - 1 - i] = false;
    if (m.modules[s - 1 - i]![8] === null) m.modules[s - 1 - i]![8] = false;
  }
  // Módulo oscuro fijo.
  m.modules[s - 8]![8] = true;
}

/** Máscara 0: (row+col) % 2 === 0. */
function mascara(row: number, col: number): boolean {
  return (row + col) % 2 === 0;
}

function esFuncion(m: Matriz, r: number, c: number, plantilla: (boolean | null)[][]): boolean {
  return plantilla[r]![c] !== null;
}

function colocarDatos(m: Matriz, datos: number[], plantilla: (boolean | null)[][]): void {
  const s = m.size;
  let bitIdx = 0;
  const totalBits = datos.length * 8;
  let dirArriba = true;
  for (let col = s - 1; col > 0; col -= 2) {
    if (col === 6) col--; // saltar columna de temporizador
    for (let i = 0; i < s; i++) {
      const row = dirArriba ? s - 1 - i : i;
      for (let j = 0; j < 2; j++) {
        const c = col - j;
        if (esFuncion(m, row, c, plantilla)) continue;
        let bit = false;
        if (bitIdx < totalBits) {
          const byte = datos[bitIdx >> 3]!;
          bit = ((byte >> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        if (mascara(row, c)) bit = !bit;
        m.modules[row]![c] = bit;
      }
    }
    dirArriba = !dirArriba;
  }
}

/** Bits de formato para EC nivel M (bits 00) y máscara 0. */
function colocarFormato(m: Matriz): void {
  // EC M = 0b00, máscara = 0b000 -> data = 0b00000
  const data = 0b00000;
  // BCH(15,5) con generador 0b10100110111, luego XOR con máscara 0x5412.
  let bch = data << 10;
  const g = 0b10100110111;
  for (let i = 4; i >= 0; i--) {
    if ((bch >> (10 + i)) & 1) {
      bch ^= g << i;
    }
  }
  const bits = ((data << 10) | bch) ^ 0b101010000010010;
  const s = m.size;
  // Colocación estándar de los 15 bits de formato.
  for (let i = 0; i <= 5; i++) m.modules[8]![i] = ((bits >> i) & 1) === 1;
  m.modules[8]![7] = ((bits >> 6) & 1) === 1;
  m.modules[8]![8] = ((bits >> 7) & 1) === 1;
  m.modules[7]![8] = ((bits >> 8) & 1) === 1;
  for (let i = 9; i <= 14; i++) m.modules[14 - i]![8] = ((bits >> i) & 1) === 1;

  for (let i = 0; i <= 7; i++) m.modules[s - 1 - i]![8] = ((bits >> i) & 1) === 1;
  for (let i = 8; i <= 14; i++) m.modules[8]![s - 15 + i] = ((bits >> i) & 1) === 1;
  m.modules[s - 8]![8] = true;
}

/* ------------------------------- API pública ----------------------------- */

export interface MatrizQr {
  /** Tamaño (nº de módulos por lado). */
  readonly size: number;
  /** Matriz booleana (true = módulo oscuro). */
  readonly modules: boolean[][];
  readonly version: number;
}

/** Codifica un texto en una matriz QR (modo byte, EC nivel M). */
export function codificarQr(texto: string): MatrizQr {
  const bytes = bytesUtf8(texto);
  const version = elegirVersion(bytes.length);
  const totalData = DATA_CODEWORDS_M[version]!;
  const numBloques = BLOCKS_M[version]!;
  const ecPorBloque = EC_PER_BLOCK_M[version]!;

  // 1. Codificar bits de datos: modo byte (0100) + longitud + datos.
  const bb = new BitBuffer();
  bb.put(0b0100, 4);
  bb.put(bytes.length, version >= 10 ? 16 : 8);
  for (const b of bytes) bb.put(b, 8);
  // Terminador.
  const capBits = totalData * 8;
  const term = Math.min(4, capBits - bb.length);
  bb.put(0, term);
  // Alinear a byte.
  while (bb.length % 8 !== 0) bb.bits.push(0);
  // Bytes de relleno.
  const dataCodewords: number[] = [];
  for (let i = 0; i < bb.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | (bb.bits[i + j] ?? 0);
    dataCodewords.push(v);
  }
  const PAD = [0xec, 0x11];
  let p = 0;
  while (dataCodewords.length < totalData) {
    dataCodewords.push(PAD[p % 2]!);
    p++;
  }

  // 2. Dividir en bloques y calcular EC por bloque.
  const base = Math.floor(totalData / numBloques);
  const resto = totalData % numBloques;
  const bloquesData: number[][] = [];
  const bloquesEc: number[][] = [];
  let offset = 0;
  for (let i = 0; i < numBloques; i++) {
    const len = base + (i >= numBloques - resto ? 1 : 0);
    const blk = dataCodewords.slice(offset, offset + len);
    offset += len;
    bloquesData.push(blk);
    bloquesEc.push(reedSolomon(blk, ecPorBloque));
  }

  // 3. Entrelazado de datos y EC.
  const finales: number[] = [];
  const maxData = Math.max(...bloquesData.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const blk of bloquesData) if (i < blk.length) finales.push(blk[i]!);
  }
  for (let i = 0; i < ecPorBloque; i++) {
    for (const blk of bloquesEc) finales.push(blk[i]!);
  }

  // 4. Construir la matriz.
  const m = crearMatriz(version);
  colocarBuscador(m, 0, 0);
  colocarBuscador(m, 0, m.size - 7);
  colocarBuscador(m, m.size - 7, 0);
  colocarAlineacion(m, version);
  colocarTemporizador(m);
  reservarFormato(m);
  // Plantilla de funciones (copia del estado actual = módulos de función).
  const plantilla = m.modules.map((fila) => fila.slice());
  colocarDatos(m, finales, plantilla);
  colocarFormato(m);

  const modules = m.modules.map((fila) => fila.map((v) => v === true));
  return { size: m.size, modules, version };
}

/** Serializa una matriz QR a una cadena SVG (usa colores por parámetro). */
export function qrASvg(
  matriz: MatrizQr,
  opts: { colorFondo?: string; colorModulo?: string; margen?: number; tamano?: number } = {},
): string {
  const margen = opts.margen ?? 4;
  const total = matriz.size + margen * 2;
  const tamano = opts.tamano ?? total * 4;
  const fondo = opts.colorFondo ?? "#ffffff";
  const modulo = opts.colorModulo ?? "#000000";
  let paths = "";
  for (let r = 0; r < matriz.size; r++) {
    for (let c = 0; c < matriz.size; c++) {
      if (matriz.modules[r]![c]) {
        paths += `M${c + margen} ${r + margen}h1v1h-1z`;
      }
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tamano}" height="${tamano}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="Código QR">` +
    `<rect width="${total}" height="${total}" fill="${fondo}"/>` +
    `<path d="${paths}" fill="${modulo}"/></svg>`
  );
}
