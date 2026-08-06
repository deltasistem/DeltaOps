/**
 * DGP-013 · Pestañas de plataforma que DEGRADAN elegantemente (comentarios y
 * adjuntos). El contrato congelado de Abastecimiento no expone estos endpoints;
 * intentamos la consulta y, si responde 404 (capacidad de plataforma no montada
 * para el módulo), mostramos un aviso claro — NUNCA se fabrican datos. Si en el
 * futuro el backend los expone, la misma superficie los renderiza sin cambios.
 */
import React from "react";
import { Section, Card, CardContent, Alert, Spinner, EmptyState, ErrorState, Table } from "@workspace/design-system";
import { abastecimientoFetch } from "../../lib/abastecimiento/api";
import { useConsulta } from "../../lib/ordenes/hooks";
import { fechaCorta } from "../../lib/abastecimiento/componentes";

interface ComentarioVista { id?: string; autor?: string; texto?: string; creadoAt?: string }
interface AdjuntoVista { attachmentId?: string; nombreArchivo?: string; mimeType?: string; tamanoBytes?: number }

function Marco({ children }: { children: React.ReactNode }) {
  return <Card><CardContent>{children}</CardContent></Card>;
}

export function TabComentariosDegradable({ entityRef }: { entityRef: string }) {
  const { datos, cargando, error, recargar } = useConsulta<ComentarioVista[] | null>(
    async (signal) => {
      const r = await abastecimientoFetch<{ comentarios?: ComentarioVista[] } | ComentarioVista[]>(
        `/comentarios?entityRef=${encodeURIComponent(entityRef)}`,
        { signal, toleraNoEncontrado: true },
      );
      if (r === null) return null; // capacidad de plataforma no montada para el módulo
      return Array.isArray(r) ? r : (r.comentarios ?? []);
    },
    [entityRef],
  );

  if (datos === null && !cargando && !error) {
    return (
      <Section titulo="Comentarios">
        <Marco>
          <Alert variant="info" titulo="Comentarios no disponibles">
            La capacidad de comentarios de plataforma (platform.comment) no está habilitada para el módulo de abastecimiento en este entorno.
          </Alert>
        </Marco>
      </Section>
    );
  }

  return (
    <Section titulo="Comentarios">
      {cargando ? <Marco><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-4)" }}><Spinner /></div></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los comentarios" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin comentarios" descripcion="Aún no hay comentarios." /></Marco>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            {(datos ?? []).map((c, i) => (
              <Card key={c.id ?? i}><CardContent>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                  <strong style={{ fontSize: "var(--do-text-sm)" }}>{c.autor ?? "—"}</strong>
                  <span style={{ fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>{fechaCorta(c.creadoAt)}</span>
                </div>
                <p style={{ margin: "var(--do-sp-1) 0 0" }}>{c.texto}</p>
              </CardContent></Card>
            ))}
          </div>
        )}
    </Section>
  );
}

export function TabAdjuntosDegradable({ entityRef }: { entityRef: string }) {
  const { datos, cargando, error, recargar } = useConsulta<AdjuntoVista[] | null>(
    async (signal) => {
      const r = await abastecimientoFetch<{ adjuntos?: AdjuntoVista[] } | AdjuntoVista[]>(
        `/adjuntos?entityRef=${encodeURIComponent(entityRef)}`,
        { signal, toleraNoEncontrado: true },
      );
      if (r === null) return null;
      return Array.isArray(r) ? r : (r.adjuntos ?? []);
    },
    [entityRef],
  );

  if (datos === null && !cargando && !error) {
    return (
      <Section titulo="Adjuntos">
        <Marco>
          <Alert variant="info" titulo="Adjuntos no disponibles">
            La capacidad de adjuntos de plataforma (platform.attachment) no está habilitada para el módulo de abastecimiento en este entorno.
          </Alert>
        </Marco>
      </Section>
    );
  }

  return (
    <Section titulo="Adjuntos">
      {cargando ? <Marco><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-4)" }}><Spinner /></div></Marco>
        : error ? <Marco><ErrorState titulo="No se pudieron cargar los adjuntos" descripcion={error.message} onReintentar={recargar} /></Marco>
        : (datos ?? []).length === 0 ? <Marco><EmptyState titulo="Sin adjuntos" descripcion="Aún no hay documentos adjuntos." /></Marco>
        : (
          <Marco>
            <Table caption="Adjuntos" captionOculto>
              <thead><tr><th scope="col">Archivo</th><th scope="col">Tipo</th><th scope="col">Tamaño</th></tr></thead>
              <tbody>
                {(datos ?? []).map((a, i) => (
                  <tr key={a.attachmentId ?? i}>
                    <td>{a.nombreArchivo ?? a.attachmentId ?? "—"}</td>
                    <td>{a.mimeType ?? "—"}</td>
                    <td>{typeof a.tamanoBytes === "number" ? `${Math.round(a.tamanoBytes / 1024)} KB` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Marco>
        )}
    </Section>
  );
}
