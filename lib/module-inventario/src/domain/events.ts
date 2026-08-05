/**
 * DGP-011.1 · Módulo Enterprise Inventory — Eventos de dominio (tipos canónicos).
 *
 * TODOS los eventos son AUTOSUFICIENTES: su payload contiene el estado completo
 * necesario para proyectar/reconstruir sin releer el aggregate (Offline First,
 * preparado para CQRS/proyecciones de DGP-011.2 sin acoplarlas aquí).
 *
 * Las existencias NUNCA se mutan directamente: TODO cambio de stock nace de un
 * evento (`MovimientoRegistrado` + `StockActualizado`). El dominio es NEUTRO: los
 * tipos/motivos/estados llegan por catálogos configurables, jamás por enums.
 */
export const ITEM_CREADO = "modulo.inventario.item-creado";
export const ITEM_MODIFICADO = "modulo.inventario.item-modificado";
export const ITEM_ELIMINADO = "modulo.inventario.item-eliminado";
export const MOVIMIENTO_REGISTRADO = "modulo.inventario.movimiento-registrado";
export const STOCK_ACTUALIZADO = "modulo.inventario.stock-actualizado";
export const RESERVA_CREADA = "modulo.inventario.reserva-creada";
export const RESERVA_LIBERADA = "modulo.inventario.reserva-liberada";
export const TRANSFERENCIA_CREADA = "modulo.inventario.transferencia-creada";
export const TRANSFERENCIA_COMPLETADA = "modulo.inventario.transferencia-completada";
export const CONTEO_INICIADO = "modulo.inventario.conteo-iniciado";
export const CONTEO_FINALIZADO = "modulo.inventario.conteo-finalizado";
export const AJUSTE_APLICADO = "modulo.inventario.ajuste-aplicado";
export const LOTE_CREADO = "modulo.inventario.lote-creado";
export const SERIE_REGISTRADA = "modulo.inventario.serie-registrada";
export const BODEGA_CREADA = "modulo.inventario.bodega-creada";
export const UBICACION_CREADA = "modulo.inventario.ubicacion-creada";

/** Catálogo completo de tipos de evento que el módulo emite. */
export const EVENTOS_MODULO = [
  ITEM_CREADO,
  ITEM_MODIFICADO,
  ITEM_ELIMINADO,
  MOVIMIENTO_REGISTRADO,
  STOCK_ACTUALIZADO,
  RESERVA_CREADA,
  RESERVA_LIBERADA,
  TRANSFERENCIA_CREADA,
  TRANSFERENCIA_COMPLETADA,
  CONTEO_INICIADO,
  CONTEO_FINALIZADO,
  AJUSTE_APLICADO,
  LOTE_CREADO,
  SERIE_REGISTRADA,
  BODEGA_CREADA,
  UBICACION_CREADA,
] as const;
export type EventoModulo = (typeof EVENTOS_MODULO)[number];
