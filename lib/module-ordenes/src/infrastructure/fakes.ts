/**
 * DGP-009.1 · Módulo Órdenes de Trabajo — FAKES en memoria de los PUERTOS.
 *
 * Estos fakes NO son infraestructura de producción: son implementaciones en
 * memoria (Map) de los puertos del dominio, para pruebas 100% deterministas.
 * Los ADAPTADORES concretos (PostgreSQL / Record Store) llegan en DGP-009.2.
 *
 * El puerto de Dynamic Forms (`PlantillasPort`) admite dos fakes:
 *   - `FakePlantillas`: catálogo en memoria (pruebas de dominio puras).
 *   - `plantillasDesdeRuntime(...)`: adaptador de PRUEBA que consulta el motor
 *     REAL de Dynamic Forms montado en el harness (NO se envía a producción).
 */
import { ok, fail, KernelErrors, type KernelError, type Result, type UnitOfWork } from "@workspace/kernel";
import { crearCodigoOrden, type CodigoOrden } from "../domain/value-objects";
import { EXTENSION_VACIA, NEUTRO_A_NEGOCIO_BASE, type ExtensionMaquina } from "../domain/maquina-estados";
import type { EntradaCatalogo, NombreCatalogo } from "../domain/catalogos";
import { CANONICOS_POR_CATALOGO, ESTADO_HABILITADO } from "../domain/catalogos";
import type { OrdenTrabajo } from "../domain/orden";
import type {
  CatalogoPort,
  ClasePlantilla,
  ConfigCodigo,
  ConsecutivoPort,
  OpcionCatalogo,
  OrdenFiltro,
  OrdenRepository,
  PlantillaVerificada,
  PlantillasPort,
  Recibo,
  ReciboPort,
  TenantId,
} from "../domain/ports";
import { FakeOrdenReadModel } from "./repository";
import {
  FakeConsolaStore,
  FakeEventLogStore,
  FakeMotorStore,
  FakeProyeccionesStore,
  FakeSyncReceiptStore,
} from "./operacional";

const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const key = (tenant: string, id: string) => `${tenant}::${id}`;

/* ------------------------------- Repositorio ---------------------------- */

export class FakeOrdenRepository implements OrdenRepository {
  private readonly store = new Map<string, OrdenTrabajo>();

  async insert(_uow: UnitOfWork, o: OrdenTrabajo): Promise<Result<OrdenTrabajo, KernelError>> {
    if (this.store.has(key(o.tenantId, o.id))) return fail(KernelErrors.conflict(`La OT ${o.id} ya existe`));
    this.store.set(key(o.tenantId, o.id), clone(o));
    return ok(clone(o));
  }
  async update(_uow: UnitOfWork, o: OrdenTrabajo, expectedVersion: number): Promise<Result<OrdenTrabajo, KernelError>> {
    const prev = this.store.get(key(o.tenantId, o.id));
    if (!prev) return fail(KernelErrors.notFound("orden-trabajo", o.id));
    if (prev.version !== expectedVersion) {
      return fail(KernelErrors.conflict(`Conflicto de versión: esperada ${expectedVersion}, actual ${prev.version}`));
    }
    this.store.set(key(o.tenantId, o.id), clone(o));
    return ok(clone(o));
  }
  async findById(tenantId: TenantId, id: string): Promise<Result<OrdenTrabajo | null, KernelError>> {
    const found = this.store.get(key(tenantId, id));
    return ok(found ? clone(found) : null);
  }
  async list(tenantId: TenantId, filtro: OrdenFiltro): Promise<Result<OrdenTrabajo[], KernelError>> {
    let rows = [...this.store.values()].filter((o) => o.tenantId === tenantId);
    if (filtro.estado) rows = rows.filter((o) => o.estado === filtro.estado);
    if (filtro.limit) rows = rows.slice(0, filtro.limit);
    return ok(rows.map(clone));
  }
}

/* -------------------------------- Catálogos ------------------------------ */

interface EntradaAlmacenada extends EntradaCatalogo {
  readonly habilitado: boolean;
}

export class FakeCatalogos implements CatalogoPort {
  // tenant → catálogo → clave → entrada
  private readonly store = new Map<string, Map<string, Map<string, EntradaAlmacenada>>>();
  // Extensión declarativa de la máquina por tenant (datos, cero código).
  private readonly extensiones = new Map<string, ExtensionMaquina>();

  /** Registra la extensión declarativa de la máquina del tenant (test helper). */
  registrarExtension(tenant: string, extension: ExtensionMaquina): this {
    this.extensiones.set(tenant, extension);
    return this;
  }

  private mapa(tenant: string, catalogo: NombreCatalogo): Map<string, EntradaAlmacenada> {
    let t = this.store.get(tenant);
    if (!t) { t = new Map(); this.store.set(tenant, t); }
    let c = t.get(catalogo);
    if (!c) { c = new Map(); t.set(catalogo, c); }
    return c;
  }

  async upsert(_uow: UnitOfWork, tenant: string, catalogo: NombreCatalogo, entrada: EntradaCatalogo): Promise<Result<void, KernelError>> {
    const c = this.mapa(tenant, catalogo);
    const prev = c.get(entrada.clave);
    c.set(entrada.clave, { ...entrada, habilitado: prev?.habilitado ?? true });
    return ok(undefined);
  }
  async habilitar(_uow: UnitOfWork, tenant: string, catalogo: NombreCatalogo, clave: string, habilitado: boolean): Promise<Result<void, KernelError>> {
    const c = this.mapa(tenant, catalogo);
    const prev = c.get(clave);
    if (!prev) return fail(KernelErrors.notFound(`catalogo:${catalogo}`, clave));
    c.set(clave, { ...prev, habilitado });
    return ok(undefined);
  }
  async opciones(tenant: string, catalogo: NombreCatalogo): Promise<Result<OpcionCatalogo[], KernelError>> {
    const c = this.mapa(tenant, catalogo);
    const rows = [...c.values()]
      .filter((e) => e.habilitado)
      .map((e, i) => ({ value: e.clave, label: e.etiqueta, posicion: e.posicion ?? i, padre: e.padre ?? null }))
      .sort((a, b) => a.posicion - b.posicion);
    return ok(rows);
  }
  async contarEntradas(tenant: string, catalogo: NombreCatalogo): Promise<Result<number, KernelError>> {
    return ok(this.mapa(tenant, catalogo).size);
  }
  async validarReferencia(tenant: string, catalogo: NombreCatalogo, clave: string | null | undefined, obligatorio: boolean): Promise<Result<void, KernelError>> {
    const valor = clave ?? "";
    if (valor === "") {
      return obligatorio ? fail(KernelErrors.validation(`La referencia a "${catalogo}" es obligatoria`)) : ok(undefined);
    }
    const c = this.mapa(tenant, catalogo);
    if (c.size === 0) {
      const canonicos = CANONICOS_POR_CATALOGO[catalogo];
      if (!canonicos || canonicos.length === 0) return ok(undefined); // forma libre
      return canonicos.includes(valor)
        ? ok(undefined)
        : fail(KernelErrors.validation(`"${valor}" no es un valor canónico de "${catalogo}"`));
    }
    const e = c.get(valor);
    if (!e) return fail(KernelErrors.validation(`"${valor}" no existe en el catálogo "${catalogo}"`));
    if (!e.habilitado) return fail(KernelErrors.validation(`"${valor}" está deshabilitado en "${catalogo}"`));
    return ok(undefined);
  }
  async estadosDeclarados(tenant: string): Promise<Result<string[], KernelError>> {
    // El catálogo `estados` guarda los NOMBRES NEUTROS (motor) de estados extra.
    const c = this.mapa(tenant, "estados");
    return ok([...c.values()].filter((e) => e.habilitado).map((e) => e.clave));
  }
  async extensionMaquina(tenant: string): Promise<Result<ExtensionMaquina, KernelError>> {
    return ok(this.extensiones.get(tenant) ?? EXTENSION_VACIA);
  }
}

/* ------------------------------- Consecutivo ----------------------------- */

export class FakeConsecutivo implements ConsecutivoPort {
  private readonly contadores = new Map<string, number>();
  async siguiente(_uow: UnitOfWork, tenant: string, cfg: ConfigCodigo): Promise<Result<CodigoOrden, KernelError>> {
    const k = `${tenant}::${cfg.serie}`;
    const secuencia = (this.contadores.get(k) ?? 0) + 1;
    this.contadores.set(k, secuencia);
    const relleno = String(secuencia).padStart(cfg.padding, "0");
    return crearCodigoOrden({ valor: `${cfg.prefijo}${cfg.separador}${relleno}`, prefijo: cfg.prefijo, secuencia });
  }
}

/* ------------------------- Recibos de idempotencia ----------------------- */

export class FakeRecibos implements ReciboPort {
  private readonly store = new Map<string, Recibo>();
  private k(tenant: string, comando: string, opId: string) { return `${tenant}::${comando}::${opId}`; }
  async buscar(tenant: string, comando: string, opId: string): Promise<Result<Recibo | null, KernelError>> {
    const found = this.store.get(this.k(tenant, comando, opId));
    return ok(found ? clone(found) : null);
  }
  async sellar(_uow: UnitOfWork, tenant: string, recibo: Recibo): Promise<Result<void, KernelError>> {
    this.store.set(this.k(tenant, recibo.comando, recibo.opId), clone(recibo));
    return ok(undefined);
  }
}

/* ---------------- Fake del puerto de Dynamic Forms (dominio) ------------- */

export interface PlantillaFake {
  readonly clave: string;
  readonly version: number;
  readonly clase: ClasePlantilla;
  readonly titulo?: string;
}
export interface RespuestaFake {
  readonly respuestaId: string;
  readonly plantillaClave: string;
  readonly plantillaVersion: number;
}

/** Catálogo en memoria de plantillas/respuestas para pruebas de dominio puras. */
export class FakePlantillas implements PlantillasPort {
  private readonly plantillas: PlantillaFake[] = [];
  private readonly respuestas: RespuestaFake[] = [];

  registrarPlantilla(p: PlantillaFake): this { this.plantillas.push(p); return this; }
  registrarRespuesta(r: RespuestaFake): this { this.respuestas.push(r); return this; }

  private versionActiva(clave: string): number | null {
    const vs = this.plantillas.filter((p) => p.clave === clave).map((p) => p.version);
    return vs.length ? Math.max(...vs) : null;
  }

  async verificar(_tenant: string, clase: ClasePlantilla, clave: string, version: number): Promise<Result<PlantillaVerificada, KernelError>> {
    const p = this.plantillas.find((x) => x.clave === clave && x.version === version);
    if (!p) return fail(KernelErrors.notFound("plantilla-formulario", `${clave}:${version}`));
    if (p.clase !== clase) {
      return fail(KernelErrors.validation(`La plantilla ${clave}:${version} es de clase "${p.clase}", se esperaba "${clase}"`));
    }
    return ok({ clave, version, clase: p.clase, titulo: p.titulo ?? clave, versionActiva: this.versionActiva(clave) });
  }
  async verificarRespuesta(_tenant: string, respuestaId: string, plantillaClave: string): Promise<Result<{ respuestaId: string; plantillaClave: string; plantillaVersion: number }, KernelError>> {
    const r = this.respuestas.find((x) => x.respuestaId === respuestaId);
    if (!r) return fail(KernelErrors.notFound("respuesta-formulario", respuestaId));
    if (r.plantillaClave !== plantillaClave) {
      return fail(KernelErrors.validation(`La respuesta ${respuestaId} pertenece a la plantilla "${r.plantillaClave}", no a "${plantillaClave}"`));
    }
    return ok({ respuestaId: r.respuestaId, plantillaClave: r.plantillaClave, plantillaVersion: r.plantillaVersion });
  }
}

/** Estados de negocio canónicos (para pruebas que necesiten el mapa base). */
export const ESTADOS_NEGOCIO_BASE = NEUTRO_A_NEGOCIO_BASE;
export const CATALOGO_HABILITADO = ESTADO_HABILITADO;

/* ------------------------------- Ensamblaje ------------------------------ */

export interface FakeAdapters {
  readonly repository: FakeOrdenRepository;
  readonly catalogos: FakeCatalogos;
  readonly consecutivo: FakeConsecutivo;
  readonly recibos: FakeRecibos;
  readonly plantillas: PlantillasPort;
  readonly readModel: FakeOrdenReadModel;
  readonly eventLog: FakeEventLogStore;
  readonly proyecciones: FakeProyeccionesStore;
  readonly motor: FakeMotorStore;
  readonly syncReceipts: FakeSyncReceiptStore;
  readonly consola: FakeConsolaStore;
}

/**
 * Crea el juego completo de fakes en memoria. `outboxRecords` inyecta el
 * acceso perezoso a los registros del outbox in-memory para la consola técnica;
 * la composición del runtime la cablea al `InMemoryOutboxStore` real.
 */
export function crearFakeAdapters(
  plantillas: PlantillasPort = new FakePlantillas(),
  outboxRecords: () => readonly import("@workspace/kernel").OutboxRecord[] = () => [],
): FakeAdapters {
  return {
    repository: new FakeOrdenRepository(),
    catalogos: new FakeCatalogos(),
    consecutivo: new FakeConsecutivo(),
    recibos: new FakeRecibos(),
    plantillas,
    readModel: new FakeOrdenReadModel(),
    eventLog: new FakeEventLogStore(),
    proyecciones: new FakeProyeccionesStore(),
    motor: new FakeMotorStore(),
    syncReceipts: new FakeSyncReceiptStore(),
    consola: new FakeConsolaStore(outboxRecords),
  };
}
