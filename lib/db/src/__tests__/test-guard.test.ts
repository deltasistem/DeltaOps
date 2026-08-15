/**
 * DELTAOPS LITE-11 MENOR-2 — patrón ESTRICTO de nombre de BD de test (B4.c).
 * Predicado PURO: no consulta el entorno ni una base real.
 */
import { describe, expect, it } from "vitest";
import { nombreCasaPatronTest } from "../test-guard";

describe("nombreCasaPatronTest · B4 patrón estricto (token, no subcadena)", () => {
  it("ACEPTA «test» como token delimitado por inicio/fin o por -/_", () => {
    for (const nombre of [
      "test",
      "tests",
      "test_deltaops",
      "deltaops_test",
      "deltaops-test",
      "deltaops_test_ci",
      "ci-tests",
      "TEST", // case-insensitive
    ]) {
      expect(nombreCasaPatronTest(nombre), nombre).toBe(true);
    }
  });

  it("RECHAZA subcadenas arbitrarias que contienen «test» pero no como token", () => {
    for (const nombre of [
      "latest",
      "contest",
      "attestation",
      "greatest",
      "protestas",
      "deltaops", // sin «test» en absoluto
      "produccion",
      "testing", // «testing» no termina el token (no es «test»/«tests» delimitado)
    ]) {
      expect(nombreCasaPatronTest(nombre), nombre).toBe(false);
    }
  });
});
