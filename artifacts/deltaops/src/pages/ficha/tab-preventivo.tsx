/**
 * DGP-014 · Vista 360° del Activo — pestaña «Preventivo».
 *
 * Integra el mantenimiento preventivo en la ficha del activo (y, por tanto, en
 * el flujo QR del activo, que NO crea un QR propio: escanear un activo alcanza
 * sus programas preventivos aquí). Lista los programas cuyo alcance declarativo
 * incluye este activo, con su tipo y estado, enlaza a la ficha del programa y a
 * su calendario filtrado por el activo, y permite crear un programa ya anclado
 * al activo. Compone el read model (`useProgramasDeActivo`); no abre API nueva.
 */
import React from "react";
import { Link } from "wouter";
import {
  Card, CardContent, CardHeader, Badge, Button, Spinner, EmptyState, ErrorState,
} from "@workspace/design-system";
import { useProgramasDeActivo } from "../../lib/preventivo/hooks";
import { BadgeEstadoPrograma } from "../../lib/preventivo/componentes";
import { urlPrograma, urlNuevoPrograma, urlCalendario } from "../../lib/preventivo/deep-links";

export function TabPreventivo({ activoId }: { activoId: string; activoNombre?: string }) {
  const { datos, cargando, error, recargar } = useProgramasDeActivo(activoId);

  if (cargando) return <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div>;
  if (error) return <ErrorState titulo="No se pudieron cargar los programas del activo" descripcion={error.message} onReintentar={recargar} />;

  const programas = datos ?? [];
  const publicados = programas.filter((p) => p.estado === "PUBLICADO").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Badge variant="exito">{publicados} publicado(s)</Badge>
          <Badge variant="neutro">{programas.length} programa(s)</Badge>
        </div>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Link href={urlCalendario({ activo: activoId })}><Button variant="secundario" size="sm">Ver calendario</Button></Link>
          <Link href={urlNuevoPrograma({ activo: activoId })}><Button variant="primario" size="sm">Nuevo programa para este activo</Button></Link>
        </div>
      </div>

      {programas.length === 0 ? (
        <Card><CardContent>
          <EmptyState titulo="Sin programas" descripcion="Este activo no está cubierto por ningún programa preventivo (por alcance de activos)." />
        </CardContent></Card>
      ) : (
        <ul aria-label="Programas preventivos del activo" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
          {programas.map((p) => (
            <li key={p.id}>
              <Card>
                <CardHeader>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--do-sp-2)" }}>
                    <strong>{p.nombre}</strong>
                    <BadgeEstadoPrograma estado={p.estado} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
                    <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{p.tipo}{p.clasificacion ? ` · ${p.clasificacion}` : ""}</span>
                    <Link href={urlPrograma(p.id)}><Button size="sm" variant="secundario">Abrir programa</Button></Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
