/**
 * DGP-008.3 · Árboles de activos.
 * Tres modos: jerárquico (padre/hijo), por ubicación y por componentes.
 * Nodos expandibles y navegables a la ficha.
 */
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  PageHeader,
  Section,
  Card,
  CardContent,
  Field,
  Select,
  RadioGroup,
  Radio,
  EmptyState,
  Spinner,
  ErrorState,
} from "@workspace/design-system";
import { ShellActivos } from "../lib/activos/Shell";
import { useListado, useComponentes } from "../lib/activos/hooks";
import { Arbol } from "../lib/activos/Arbol";
import type { ActivoRow, NodoArbol } from "../lib/activos/tipos";

type Modo = "jerarquico" | "ubicacion" | "componentes";

export default function ActivosArbolesPage() {
  return (
    <ShellActivos activo="/activos/arboles">
      <Arboles />
    </ShellActivos>
  );
}

function Arboles() {
  const [, navegar] = useLocation();
  const [modo, setModo] = useState<Modo>("jerarquico");
  const { datos, cargando, error, recargar } = useListado({});
  const activos = datos ?? [];
  const [raizId, setRaizId] = useState<string>("");

  const irFicha = (id: string) => navegar(`/activos/${id}`);

  return (
    <>
      <PageHeader titulo="Árboles de activos" descripcion="Explora la jerarquía, la distribución por ubicación y la composición por componentes." />

      <Section titulo="Modo de vista">
        <Card>
          <CardContent>
            <RadioGroup name="modo" value={modo} onChange={(v) => setModo(v as Modo)} label="Modo de árbol" orientation="horizontal">
              <Radio value="jerarquico" label="Jerárquico (padre/hijo)" />
              <Radio value="ubicacion" label="Por ubicación" />
              <Radio value="componentes" label="Por componentes" />
            </RadioGroup>
            {modo === "componentes" && (
              <div style={{ marginTop: "var(--do-sp-3)", maxWidth: 360 }}>
                <Field label="Activo raíz" htmlFor="raiz" description="Selecciona el activo cuyos componentes deseas ver.">
                  <Select id="raiz" placeholder="Selecciona un activo" value={raizId} onChange={(e) => setRaizId(e.target.value)}>
                    {activos.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.codigoEmpresarial})</option>)}
                  </Select>
                </Field>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>

      <Section titulo="Árbol">
        {cargando ? (
          <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>
        ) : error ? (
          <Card><CardContent><ErrorState titulo="No se pudo cargar" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>
        ) : modo === "componentes" ? (
          raizId ? <ArbolComponentes id={raizId} onNavegar={irFicha} /> : <Card><CardContent><EmptyState titulo="Selecciona un activo" descripcion="Elige un activo raíz para ver sus componentes." /></CardContent></Card>
        ) : modo === "ubicacion" ? (
          <ArbolPorUbicacion activos={activos} onNavegar={irFicha} />
        ) : (
          <ArbolJerarquico activos={activos} onNavegar={irFicha} />
        )}
      </Section>
    </>
  );
}

/** Construye un árbol jerárquico a partir de datos.padreId si existe. */
function ArbolJerarquico({ activos, onNavegar }: { activos: ActivoRow[]; onNavegar: (id: string) => void }) {
  const raices = useMemo(() => construirJerarquia(activos), [activos]);
  if (raices.length === 0) return <Card><CardContent><EmptyState titulo="Sin activos" descripcion="No hay activos para mostrar." /></CardContent></Card>;
  return (
    <Card><CardContent>
      {raices.map((r) => <Arbol key={r.id} raiz={r} onNavegar={onNavegar} />)}
    </CardContent></Card>
  );
}

function construirJerarquia(activos: ActivoRow[]): NodoArbol[] {
  const porId = new Map<string, NodoArbol & { hijos: NodoArbol[] }>();
  for (const a of activos) {
    porId.set(a.id, { id: a.id, nombre: a.nombre, codigoEmpresarial: a.codigoEmpresarial, estado: a.estado, tipo: a.tipo, hijos: [] });
  }
  const raices: NodoArbol[] = [];
  for (const a of activos) {
    const padreId = (a.datos?.padreId ?? a.datos?.activoPadreId) as string | undefined;
    const nodo = porId.get(a.id)!;
    if (padreId && porId.has(padreId)) porId.get(padreId)!.hijos.push(nodo);
    else raices.push(nodo);
  }
  return raices;
}

/** Agrupa por ubicación (nodo virtual por ubicación). */
function ArbolPorUbicacion({ activos, onNavegar }: { activos: ActivoRow[]; onNavegar: (id: string) => void }) {
  const raiz = useMemo<NodoArbol>(() => {
    const grupos = new Map<string, NodoArbol[]>();
    for (const a of activos) {
      const ub = a.ubicacionId ?? (a.datos?.ubicacion as { etiqueta?: string } | undefined)?.etiqueta ?? "Sin ubicación";
      if (!grupos.has(ub)) grupos.set(ub, []);
      grupos.get(ub)!.push({ id: a.id, nombre: a.nombre, codigoEmpresarial: a.codigoEmpresarial, estado: a.estado });
    }
    return {
      id: "__raiz__",
      nombre: "Ubicaciones",
      hijos: [...grupos.entries()].map(([ub, hijos]) => ({ id: `ub:${ub}`, nombre: ub, hijos })),
    };
  }, [activos]);

  if (activos.length === 0) return <Card><CardContent><EmptyState titulo="Sin activos" descripcion="No hay activos para agrupar." /></CardContent></Card>;
  return <Card><CardContent><Arbol raiz={raiz} onNavegar={(id) => { if (!id.startsWith("ub:") && id !== "__raiz__") onNavegar(id); }} label="Activos por ubicación" /></CardContent></Card>;
}

/** Árbol de componentes servido por el backend. */
function ArbolComponentes({ id, onNavegar }: { id: string; onNavegar: (id: string) => void }) {
  const { datos, cargando, error, recargar } = useComponentes(id);
  if (cargando) return <Card><CardContent><div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-6)" }}><Spinner /></div></CardContent></Card>;
  if (error) return <Card><CardContent><ErrorState titulo="No se pudieron cargar los componentes" descripcion={error.message} onReintentar={recargar} /></CardContent></Card>;
  if (!datos) return <Card><CardContent><EmptyState titulo="Sin componentes" descripcion="Este activo no tiene componentes." /></CardContent></Card>;
  return <Card><CardContent><Arbol raiz={datos} onNavegar={onNavegar} label="Componentes del activo" /></CardContent></Card>;
}
