/**
 * FINAL-02 · Hub de Informes Operacionales.
 *
 * Tarjetas del catálogo (servido por el backend: la lista visible es la lista
 * autorizada). Solo lectura; sin datos inventados.
 */
import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  PageHeader, Section, Card, CardContent, Spinner, EmptyState, ErrorState,
} from "@workspace/design-system";
import { ShellInformes } from "../lib/informes/Shell";
import { listarInformes, type CatalogoInforme } from "../lib/informes/api";

export default function InformesPage() {
  return (
    <ShellInformes activo="/informes">
      <Hub />
    </ShellInformes>
  );
}

function Hub() {
  const [informes, setInformes] = useState<CatalogoInforme[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    setError(null);
    setInformes(null);
    listarInformes(ctl.signal)
      .then((r) => setInformes(r.informes))
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      });
    return () => ctl.abort();
  }, [intento]);

  return (
    <>
      <PageHeader
        titulo="Informes operacionales"
        descripcion="Consulta y exporta los datos reales de la operación. La exportación entrega exactamente lo que ves en pantalla."
      />
      <Section>
        {error ? (
          <ErrorState titulo="No se pudo cargar el catálogo" descripcion={error.message} onReintentar={() => setIntento((n) => n + 1)} />
        ) : informes === null ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>
        ) : informes.length === 0 ? (
          <EmptyState titulo="Sin informes disponibles" descripcion="No hay informes habilitados para su rol." />
        ) : (
          <div
            style={{
              display: "grid",
              gap: "var(--do-sp-4)",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
            }}
          >
            {informes.map((inf) => (
              <Link key={inf.clave} href={`/informes/${inf.clave}`} style={{ textDecoration: "none", color: "inherit" }}>
                <Card interactiva>
                  <CardContent>
                    <h3 style={{ margin: 0, marginBottom: "var(--do-sp-2)", font: "var(--do-font-h4)" }}>{inf.titulo}</h3>
                    <p style={{ margin: 0, color: "var(--do-texto-suave)", font: "var(--do-font-body-sm)" }}>{inf.descripcion}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
