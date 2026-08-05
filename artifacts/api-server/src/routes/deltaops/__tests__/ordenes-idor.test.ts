/**
 * DGP-009.3 (ronda 2) · Seguridad IDOR de la firma de URL de adjuntos.
 *
 * `GET /:id/documentacion/:attachmentId/url` sólo debe emitir una URL firmada si
 * el adjunto está REALMENTE referenciado en la documentación de ESA OT. Aquí se
 * prueba el predicado de autorización usado por la ruta contra documentación de
 * la OT propia y de OTs ajenas (rechazo de adjunto foráneo del mismo tenant).
 */
import { describe, expect, it } from "vitest";
import { attachmentPerteneceAOrden, type FilaDocumentacion } from "../ordenes-module";

const docsOrden1: FilaDocumentacion[] = [
  { referenciaClave: "att-propia-1", datos: { attachmentId: "att-propia-1", nombreArchivo: "[fotografia] a.jpg" } },
  { referenciaClave: "att-propia-2", datos: { attachmentId: "att-propia-2" } },
  { referenciaClave: null, datos: { attachmentId: "att-en-datos" } },
];

describe("IDOR · attachmentPerteneceAOrden", () => {
  it("acepta un adjunto referenciado por referenciaClave en la OT", () => {
    expect(attachmentPerteneceAOrden(docsOrden1, "att-propia-1")).toBe(true);
    expect(attachmentPerteneceAOrden(docsOrden1, "att-propia-2")).toBe(true);
  });

  it("acepta un adjunto referenciado sólo en datos.attachmentId (robustez)", () => {
    expect(attachmentPerteneceAOrden(docsOrden1, "att-en-datos")).toBe(true);
  });

  it("RECHAZA un adjunto ajeno a la OT (aunque exista en el tenant)", () => {
    // Adjunto perteneciente a OTRA orden del mismo tenant → no debe firmarse.
    expect(attachmentPerteneceAOrden(docsOrden1, "att-de-otra-orden")).toBe(false);
  });

  it("RECHAZA cuando la documentación de la OT está vacía", () => {
    expect(attachmentPerteneceAOrden([], "att-propia-1")).toBe(false);
  });

  it("RECHAZA un attachmentId vacío", () => {
    expect(attachmentPerteneceAOrden(docsOrden1, "")).toBe(false);
  });

  it("no confunde coincidencias parciales de id", () => {
    expect(attachmentPerteneceAOrden(docsOrden1, "att-propia")).toBe(false);
    expect(attachmentPerteneceAOrden(docsOrden1, "att-propia-11")).toBe(false);
  });
});
