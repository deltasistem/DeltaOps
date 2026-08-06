/**
 * DGP-013 · Integración de Abastecimiento en la ficha de un item de inventario.
 *
 * Muestra los artículos de catálogo VINCULADOS a este item (filtro por
 * `inventarioItemId`, autoridad del read model — sin fabricar datos) y ofrece
 * deep links: crear una solicitud de compra anclada al origen «inventario» (con
 * la referencia al item) y abrir el catálogo/órdenes. El contrato congelado NO
 * expone un cruce solicitudes/OC↔item, por lo que usamos DEEP LINKS simples
 * (nunca datos inventados).
 */
import React from "react";
import { Link } from "wouter";
import { Section, Card, CardContent, Button, Spinner, EmptyState, ErrorState, Table, Badge } from "@workspace/design-system";
import { useArticulosDeItem } from "../../lib/abastecimiento/hooks";
import { urlArticulo, urlNuevaSolicitud, urlNuevoArticulo, urlSolicitudes, urlOrdenesCompra } from "../../lib/abastecimiento/deep-links";

export function TabAbastecimientoItem({ itemId, nombreItem }: { itemId: string; nombreItem?: string }) {
  const { datos, cargando, error, recargar } = useArticulosDeItem(itemId);

  return (
    <Section
      titulo="Abastecimiento"
      acciones={
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Link href={urlNuevaSolicitud({ tipo: "inventario", refId: itemId, refTipo: "item", etiqueta: nombreItem })}>
            <Button variant="primario" size="sm" data-testid="crear-solicitud-desde-item">Crear solicitud de compra</Button>
          </Link>
          <Link href={urlNuevoArticulo() + `?inventarioItemId=${encodeURIComponent(itemId)}`}>
            <Button variant="secundario" size="sm">Vincular nuevo artículo</Button>
          </Link>
        </div>
      }
    >
      <Card><CardContent>
        <p style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
          Artículos del catálogo de abastecimiento vinculados a este item de inventario.
        </p>
        {cargando ? (
          <div style={{ display: "grid", placeItems: "center", padding: "var(--do-sp-4)" }}><Spinner /></div>
        ) : error ? (
          <ErrorState titulo="No se pudieron cargar los artículos" descripcion={error.message} onReintentar={recargar} />
        ) : (datos ?? []).length === 0 ? (
          <EmptyState titulo="Sin artículos vinculados" descripcion="No hay artículos de catálogo asociados a este item." />
        ) : (
          <Table caption="Artículos vinculados" captionOculto>
            <thead><tr><th scope="col">Nombre</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col"><span className="do-visualmente-oculto">Acciones</span></th></tr></thead>
            <tbody>
              {(datos ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td>{a.tipo}</td>
                  <td><Badge variant={a.activo === false ? "neutro" : "exito"}>{a.activo === false ? "Inactivo" : "Activo"}</Badge></td>
                  <td><Link href={urlArticulo(a.id)}><Button variant="fantasma" size="sm">Abrir artículo</Button></Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </CardContent></Card>
      <Card><CardContent>
        <div style={{ display: "flex", gap: "var(--do-sp-2)", flexWrap: "wrap" }}>
          <Link href={urlSolicitudes()}><Button variant="fantasma" size="sm">Ver todas las solicitudes</Button></Link>
          <Link href={urlOrdenesCompra()}><Button variant="fantasma" size="sm">Ver órdenes de compra</Button></Link>
        </div>
      </CardContent></Card>
    </Section>
  );
}
