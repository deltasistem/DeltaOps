/**
 * DGP-016 · Catálogo de indicadores (/analytics/indicadores).
 *
 * Listado por categoría con enlace a la ficha de cada indicador. Filtro de
 * categoría persistido en URL. Sólo Design System; estados honestos.
 */
import React, { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Select,
  Spinner,
  ErrorState,
  EmptyState,
} from "@workspace/design-system";
import { ShellAnalytics } from "../lib/analytics/Shell";
import { useIndicadores } from "../lib/analytics/hooks";
import { urlIndicador, urlIndicadores, leerParam } from "../lib/analytics/deep-links";
import type { Indicador } from "../lib/analytics/tipos";

export default function AnalyticsIndicadoresPage() {
  return (
    <ShellAnalytics activo="/analytics/indicadores">
      <Catalogo />
    </ShellAnalytics>
  );
}

function Catalogo() {
  const search = useSearch();
  const [, navegar] = useLocation();
  const categoria = leerParam(search, "categoria");
  const { datos, cargando, error, recargar } = useIndicadores(categoria ? { categoria } : {});

  const indicadores: Indicador[] = datos ?? [];
  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const ind of indicadores) set.add(ind.categoria);
    return [...set].sort();
  }, [indicadores]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, Indicador[]>();
    for (const ind of indicadores) {
      const arr = m.get(ind.categoria) ?? [];
      arr.push(ind);
      m.set(ind.categoria, arr);
    }
    return m;
  }, [indicadores]);

  return (
    <>
      <PageHeader
        titulo="Catálogo de indicadores"
        descripcion="Definiciones declarativas de KPIs consumibles por dashboards y evaluaciones ad-hoc."
        acciones={
          <label style={{ display: "flex", gap: "var(--do-sp-2)", alignItems: "center" }}>
            <span style={{ fontSize: "var(--do-text-sm)" }}>Categoría</span>
            <Select
              aria-label="Filtrar por categoría"
              value={categoria ?? ""}
              onChange={(e) => navegar(e.target.value ? urlIndicadores(e.target.value) : urlIndicadores())}
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </label>
        }
      />

      {error && <ErrorState titulo="No se pudieron cargar los indicadores" descripcion={error.message} onReintentar={recargar} />}
      {cargando && !datos && <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}><Spinner /></div>}
      {!error && !cargando && indicadores.length === 0 && (
        <EmptyState titulo="Sin indicadores" descripcion="No hay indicadores para el filtro actual." />
      )}

      {[...porCategoria.entries()].map(([cat, inds]) => (
        <Section key={cat} titulo={cat}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", gap: "var(--do-sp-4)" }}>
            {inds.map((ind) => (
              <Card key={ind.clave} interactiva role="group" aria-label={`Indicador ${ind.nombre}`}>
                <CardHeader>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--do-sp-2)" }}>
                    <strong>{ind.nombre}</strong>
                    {ind.delSistema && <Badge variant="neutro">sistema</Badge>}
                  </div>
                </CardHeader>
                <CardContent>
                  {ind.descripcion && <p style={{ margin: "0 0 var(--do-sp-2)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>{ind.descripcion}</p>}
                  <p style={{ margin: "0 0 var(--do-sp-3)", fontSize: "var(--do-text-xs)", color: "var(--do-texto-suave)" }}>
                    <code>{ind.clave}</code> · {ind.unidad} · fuente {ind.fuente.modulo}/{ind.fuente.dataset}
                  </p>
                  <Link href={urlIndicador(ind.clave)}>
                    <Button variant="secundario" size="sm">Ver ficha</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}
