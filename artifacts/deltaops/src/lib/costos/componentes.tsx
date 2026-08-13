/**
 * DGP-021.3 · Piezas de presentación COMPARTIDAS de la composición de costos.
 *
 * Núcleo PRESENTACIONAL puro (sin fetching), probable por estados. Sólo tokens
 * --do-* (§23). Responsive por grids fluidas (§22). Todo el dato viene del
 * backend; cero reglas económicas aquí (sólo formateo, §26).
 */
import React from "react";
import { Badge, Alert } from "@workspace/design-system";
import type { BadgeVariant } from "@workspace/design-system";
import {
  formatearMoneda,
  formatearNumero,
  formatearFecha,
  formatearRatio,
  formatearMagnitud,
  ETIQUETA_ESTADO,
  TONO_ESTADO,
  ETIQUETA_ESTADO_INDICADOR,
  TONO_ESTADO_INDICADOR,
  ETIQUETA_UNIDAD,
  ETIQUETA_COMPONENTE,
  SIN_DATOS_TEXTO,
} from "./formato";
import type {
  Componente,
  EstadoCosto,
  EstadoIndicador,
  TotalMoneda,
  Evidencia,
  Pendiente,
  CombustibleActivo,
  IndicadorMedidor,
} from "./tipos";

/** Badge de estado (§8): COMPLETO/PARCIAL/SIN DATOS SUFICIENTES/PENDIENTE/NO APLICA. */
export function EstadoBadge({ estado }: { estado: EstadoCosto }) {
  const tono: BadgeVariant = TONO_ESTADO[estado] ?? "neutro";
  return <Badge variant={tono}>{ETIQUETA_ESTADO[estado] ?? estado}</Badge>;
}

/** Badge de estado de INDICADOR económico (DGP-021.4). */
export function EstadoIndicadorBadge({ estado }: { estado: EstadoIndicador }) {
  const tono: BadgeVariant = TONO_ESTADO_INDICADOR[estado] ?? "neutro";
  return <Badge variant={tono}>{ETIQUETA_ESTADO_INDICADOR[estado] ?? estado}</Badge>;
}

/** Fila de dato compacta. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>{etiqueta}</div>
      <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{children}</div>
    </div>
  );
}

/**
 * Totales POR MONEDA (§6): una línea por moneda, NUNCA mezcladas. Muestra el neto
 * y, si difieren, el desglose cargos/abonos. Si no hay monedas ⇒ «Sin datos
 * suficientes» (nunca «$0»).
 */
export function TotalesPorMoneda({
  totales,
  estado,
  destacar,
}: {
  totales: readonly TotalMoneda[];
  estado?: EstadoCosto;
  destacar?: boolean;
}) {
  if (totales.length === 0) {
    // $0 real (hay hechos pero netean cero) NO llega aquí: el backend devuelve la
    // moneda con total "0.000000". La lista vacía ⇒ ausencia de datos.
    return <span style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>{SIN_DATOS_TEXTO}</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
      {totales.map((t) => {
        const neto = formatearMoneda(t.total, t.moneda) ?? `${t.total} ${t.moneda}`;
        const hayAbonos = formatearNumero(t.abonos) !== formatearNumero("0");
        return (
          <div key={t.moneda} style={{ minWidth: 0 }}>
            <strong style={{ fontSize: destacar ? "var(--do-text-lg)" : "var(--do-text-base)", fontVariantNumeric: "tabular-nums" }}>
              {neto}
            </strong>
            {hayAbonos && (
              <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                Cargos {formatearMoneda(t.cargos, t.moneda)} · Abonos {formatearMoneda(t.abonos, t.moneda)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Lista de evidencia (hechos/valoraciones) que respaldan un componente (§18). */
export function ListaEvidencia({ items }: { items: readonly Evidencia[] }) {
  if (items.length === 0) return null;
  return (
    <details style={{ marginTop: "var(--do-sp-2)" }}>
      <summary style={{ cursor: "pointer", color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
        Ver {items.length} registro(s) de origen
      </summary>
      <ul style={{ margin: "var(--do-sp-2) 0 0", padding: 0, display: "grid", gap: "var(--do-sp-2)" }}>
        {items.map((e, i) => (
          <li
            key={e.costoId ?? e.sesionId ?? `${e.movimientoId ?? "ev"}-${i}`}
            style={{
              listStyle: "none",
              border: "1px solid var(--do-borde)",
              borderRadius: "var(--do-radius-md)",
              padding: "var(--do-sp-2) var(--do-sp-3)",
              fontSize: "var(--do-text-xs)",
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--do-sp-2) var(--do-sp-4)",
              alignItems: "baseline",
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {e.valor && e.moneda ? formatearMoneda(e.valor, e.moneda) ?? `${e.valor} ${e.moneda}` : "—"}
            </span>
            {e.naturaleza && <Badge variant={e.naturaleza === "ABONO" ? "info" : "neutro"}>{e.naturaleza}</Badge>}
            <span style={{ color: "var(--do-texto-suave)" }}>{formatearFecha(e.cuando)}</span>
            {e.fuente && <span style={{ color: "var(--do-texto-suave)" }}>Fuente: {e.fuente}</span>}
            {e.quien && <span style={{ color: "var(--do-texto-suave)" }}>Por: {e.quien}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Lista de pendientes (jamás se asume $0). */
export function ListaPendientes({ items, titulo }: { items: readonly Pendiente[]; titulo: string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: "var(--do-sp-3)" }}>
      <Alert variant="advertencia" titulo={titulo}>
        <ul style={{ margin: 0, paddingLeft: "var(--do-sp-5)", fontSize: "var(--do-text-sm)" }}>
          {items.map((p, i) => (
            <li key={p.movimientoId ?? p.sesionId ?? i}>
              {(p.articuloId ?? p.sesionId ?? "Registro")}{" "}
              {p.motivo && <span style={{ color: "var(--do-texto-suave)" }}>· {p.motivo}</span>}
              {p.cantidad && <span style={{ color: "var(--do-texto-suave)" }}> · {p.cantidad} {p.unidad ?? ""}</span>}
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  );
}

/**
 * Tarjeta de un COMPONENTE económico (mano de obra / repuestos / otros). Muestra
 * su estado, totales por moneda, evidencia y pendientes. La ausencia de datos se
 * muestra explícita (§4), nunca como «$0».
 */
export function TarjetaComponente({ c }: { c: Componente }) {
  const nombre = ETIQUETA_COMPONENTE[c.tipo] ?? c.tipo;
  const pendientes = c.pendientes ?? [];
  const evidencia = c.evidencia ?? [];
  return (
    <div
      style={{
        border: "1px solid var(--do-borde)",
        borderRadius: "var(--do-radius-lg)",
        padding: "var(--do-sp-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--do-sp-3)",
        minWidth: 0,
        background: "var(--do-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
        <strong>{nombre}</strong>
        <EstadoBadge estado={c.estado} />
      </div>
      {c.estado === "SIN_DATOS_SUFICIENTES" && c.porMoneda.length === 0 ? (
        <span style={{ color: "var(--do-texto-suave)" }}>{SIN_DATOS_TEXTO}</span>
      ) : (
        <TotalesPorMoneda totales={c.porMoneda} estado={c.estado} />
      )}
      <ListaPendientes items={pendientes} titulo={`${nombre}: pendiente(s) de resolver`} />
      <ListaEvidencia items={evidencia} />
    </div>
  );
}

/**
 * Combustible CONTEXTUAL del activo (§3): SIEMPRE separado del total económico y
 * nunca atribuible a una OT.
 *
 * DGP-021.3 R1 (§26): NO se muestra ningún TOTAL monetario de combustible (el dinero
 * de origen es float, GAP-FUEL-MONEY). Sólo se presentan CONTEOS de tanqueos por
 * moneda y, opcionalmente, los valores de ORIGEN por tanqueo individual (no sumados),
 * marcados como referenciales/no-exactos.
 */
export function TarjetaCombustible({ c }: { c: CombustibleActivo }) {
  const conteo = c.conteoPorMoneda ?? [];
  const eventos = c.eventos ?? [];
  const sinDatos = (c.tanqueos ?? 0) === 0;
  return (
    <div
      style={{
        border: "1px dashed var(--do-borde)",
        borderRadius: "var(--do-radius-lg)",
        padding: "var(--do-sp-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--do-sp-3)",
        minWidth: 0,
        background: "var(--do-surface-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
        <strong>Combustible (contextual)</strong>
        <Badge variant="info">Contextual</Badge>
      </div>
      <p style={{ margin: 0, color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
        Referencia operacional del activo en el período. No se suma al total económico
        de mantenimiento ni se atribuye a órdenes. Los valores de origen son
        aproximados; no se calcula ningún total monetario de combustible en esta fase.
      </p>
      {sinDatos ? (
        <span style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>{SIN_DATOS_TEXTO}</span>
      ) : (
        <>
          {/* Conteo de tanqueos (entero) por moneda — SIN dinero. */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-1)" }}>
            <span>
              <strong style={{ fontVariantNumeric: "tabular-nums" }}>{c.tanqueos}</strong> tanqueo(s) en el período
            </span>
            {conteo.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--do-sp-2)" }}>
                {conteo.map((m) => (
                  <Badge key={m.moneda} variant="neutro">
                    {m.moneda}: {m.tanqueos} tanqueo(s)
                  </Badge>
                ))}
              </div>
            )}
            {typeof c.tanqueosSinCosto === "number" && c.tanqueosSinCosto > 0 && (
              <span style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                {c.tanqueosSinCosto} tanqueo(s) sin costo de origen registrado.
              </span>
            )}
          </div>

          {/* Valores de ORIGEN por tanqueo, individuales (no sumados). */}
          {eventos.length > 0 && (
            <details>
              <summary style={{ cursor: "pointer", color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                Ver {eventos.length} tanqueo(s) con su valor de origen (aprox., sin sumar)
              </summary>
              <ul style={{ margin: "var(--do-sp-2) 0 0", padding: 0, display: "grid", gap: "var(--do-sp-2)" }}>
                {eventos.map((e, i) => (
                  <li
                    key={e.tanqueoId ?? i}
                    style={{
                      listStyle: "none",
                      border: "1px solid var(--do-borde)",
                      borderRadius: "var(--do-radius-md)",
                      padding: "var(--do-sp-2) var(--do-sp-3)",
                      fontSize: "var(--do-text-xs)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--do-sp-2) var(--do-sp-4)",
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ color: "var(--do-texto-suave)" }}>{formatearFecha(e.cuando ?? undefined)}</span>
                    <span style={{ fontWeight: 600 }}>
                      {e.costoOrigen != null && e.moneda
                        ? `≈ ${e.costoOrigen} ${e.moneda}`
                        : "Sin costo de origen"}
                    </span>
                    {e.litros != null && (
                      <span style={{ color: "var(--do-texto-suave)" }}>
                        {formatearNumero(e.litros) ?? e.litros} L
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * DGP-021.4 · Tarjeta de un INDICADOR económico (costo/hora o costo/km).
 *
 * Presenta el estado semántico, el avance del medidor (horas/km del período) y el
 * ratio POR MONEDA (nunca combinadas). La ausencia se muestra explícita (§4): jamás
 * «$0». NO APLICA (p. ej. km sin odómetro) se rotula sin inventar valor.
 * String-safe: sólo formatea cadenas exactas del backend (§26).
 */
export function TarjetaIndicador({ titulo, ind }: { titulo: string; ind: IndicadorMedidor }) {
  const unidadLegible = ETIQUETA_UNIDAD[ind.unidad] ?? ind.unidad;
  const noAplica = ind.estado === "NO_APLICA";
  const sinDatos = ind.estado === "SIN_DATOS_SUFICIENTES";
  const magnitud = formatearMagnitud(ind.delta, ind.unidad);
  return (
    <div
      style={{
        border: "1px solid var(--do-borde)",
        borderRadius: "var(--do-radius-lg)",
        padding: "var(--do-sp-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--do-sp-3)",
        minWidth: 0,
        background: "var(--do-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--do-sp-3)", flexWrap: "wrap" }}>
        <strong>{titulo}</strong>
        <EstadoIndicadorBadge estado={ind.estado} />
      </div>

      {noAplica ? (
        <span style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>
          {ETIQUETA_ESTADO_INDICADOR.NO_APLICA}
          {ind.nota && <div style={{ fontWeight: 400, fontSize: "var(--do-text-xs)" }}>{ind.nota}</div>}
        </span>
      ) : sinDatos || ind.porMoneda.length === 0 ? (
        <span style={{ color: "var(--do-texto-suave)", fontWeight: 600 }}>
          {SIN_DATOS_TEXTO}
          {ind.nota && <div style={{ fontWeight: 400, fontSize: "var(--do-text-xs)" }}>{ind.nota}</div>}
        </span>
      ) : (
        <>
          {/* Ratio por moneda (una línea por moneda; nunca mezcladas). */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--do-sp-2)" }}>
            {ind.porMoneda.map((r) => {
              const ratio = formatearRatio(r.valor, r.moneda, ind.unidad) ?? `${r.valor} ${r.moneda}/${ind.unidad}`;
              return (
                <div key={r.moneda} style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: "var(--do-text-lg)", fontVariantNumeric: "tabular-nums" }}>{ratio}</strong>
                  <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
                    Costo {formatearMoneda(r.costoTotal, r.moneda) ?? `${r.costoTotal} ${r.moneda}`}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Denominador: avance del medidor en el período. */}
          {magnitud && (
            <div style={{ color: "var(--do-texto-suave)", fontSize: "var(--do-text-xs)" }}>
              {unidadLegible === "horas" ? "Horas de operación" : "Distancia recorrida"}: <span style={{ fontVariantNumeric: "tabular-nums" }}>{magnitud}</span>
              {ind.tramos > 1 && ` · ${ind.tramos} tramos (medidor reiniciado)`}
            </div>
          )}
        </>
      )}
    </div>
  );
}
