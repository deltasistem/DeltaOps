/**
 * DGP-006 · Business Foundation Framework — Generic Entity/Aggregate Runtime.
 *
 * Fábrica que, dada una DefinicionEntidad, produce un aggregate genérico PURO
 * (sin infraestructura): esquema Zod de datos, validación de invariantes,
 * funciones puras crear/actualizar/transicionar que devuelven Result con el
 * nuevo estado y el evento de dominio autosuficiente (payload completo, para
 * proyección solo-desde-payload), y versión optimista.
 */
import { z } from "zod";
import { fail, KernelErrors, ok, type KernelError, type Result } from "@workspace/kernel";
import {
  camposAZod,
  estadoInicial,
  eventosDeEntidad,
  type DefinicionEntidad,
} from "./definicion";
import { MaquinaEstados } from "./maquina-estados";

/** Estado de un registro genérico del aggregate (proyección del Record Store). */
export interface RegistroEntidad {
  readonly id: string;
  readonly tenantId: string;
  readonly estado: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
  readonly createdBy: string;
  readonly updatedAt: Date;
}

/** Cambio producido por una operación pura: nuevo registro + evento de dominio. */
export interface CambioEntidad {
  readonly registro: RegistroEntidad;
  readonly evento: { readonly tipo: string; readonly payload: Record<string, unknown> };
}

/**
 * Runtime del aggregate genérico. Todas las funciones son puras: no persisten
 * ni leen; devuelven Result para que la capa de aplicación (crud.ts) orqueste
 * repositorio + UoW + auditoría + outbox.
 */
export class RuntimeEntidad {
  readonly maquina?: MaquinaEstados;
  private readonly dataSchema: z.ZodObject<z.ZodRawShape>;
  private readonly eventos: ReturnType<typeof eventosDeEntidad>;

  constructor(readonly def: DefinicionEntidad) {
    this.dataSchema = camposAZod(def.campos);
    this.eventos = eventosDeEntidad(def);
    if (def.maquinaEstados) this.maquina = new MaquinaEstados(def.maquinaEstados);
  }

  /** Esquema Zod del objeto `data` de la entidad. */
  esquemaData(): z.ZodObject<z.ZodRawShape> {
    return this.dataSchema;
  }

  /**
   * Valida invariantes de `data` (tipos, requeridos, longitudes, enums). Las
   * claves de metadato (prefijo `_`, p. ej. `_opIds` para idempotencia offline)
   * se preservan tal cual: no son campos de dominio y Zod las descartaría.
   */
  validar(data: Record<string, unknown>): Result<Record<string, unknown>, KernelError> {
    const parsed = this.dataSchema.safeParse(data);
    if (!parsed.success) {
      return fail(
        KernelErrors.validation(`Datos inválidos para ${this.def.nombre}`, {
          issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
        }),
      );
    }
    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith("_")) meta[k] = v;
    }
    return ok({ ...(parsed.data as Record<string, unknown>), ...meta });
  }

  private construirEvento(
    r: RegistroEntidad,
    tipo: string,
    actorId: string,
    extra: Record<string, unknown> = {},
  ): { tipo: string; payload: Record<string, unknown> } {
    // Payload AUTOSUFICIENTE: la proyección se construye solo desde el evento.
    return {
      tipo,
      payload: {
        tenantId: r.tenantId,
        id: r.id,
        entityRef: `${this.def.servicio}.${this.def.nombre}:${r.id}`,
        recordType: this.def.nombre,
        estado: r.estado,
        version: r.version,
        data: r.data,
        createdBy: r.createdBy,
        actualizadoAt: r.updatedAt.toISOString(),
        actorId,
        ...extra,
      },
    };
  }

  /** Crea el aggregate en su estado inicial con versión 1. */
  crear(args: {
    id: string;
    tenantId: string;
    data: Record<string, unknown>;
    actorId: string;
    ahora: Date;
  }): Result<CambioEntidad, KernelError> {
    const validado = this.validar(args.data);
    if (!validado.ok) return validado;
    const registro: RegistroEntidad = {
      id: args.id,
      tenantId: args.tenantId,
      estado: estadoInicial(this.def) ?? "vigente",
      version: 1,
      data: validado.value,
      createdBy: args.actorId,
      updatedAt: args.ahora,
    };
    return ok({ registro, evento: this.construirEvento(registro, this.eventos.creada, args.actorId) });
  }

  /** Actualiza datos del aggregate (merge parcial) subiendo la versión. */
  actualizar(
    actual: RegistroEntidad,
    patch: Record<string, unknown>,
    actorId: string,
    ahora: Date,
  ): Result<CambioEntidad, KernelError> {
    if (this.maquina && this.maquina.esFinal(actual.estado)) {
      return fail(KernelErrors.conflict(`Un registro en estado final "${actual.estado}" es inmutable`));
    }
    const merged = { ...actual.data, ...patch };
    const validado = this.validar(merged);
    if (!validado.ok) return validado;
    const registro: RegistroEntidad = {
      ...actual,
      data: validado.value,
      version: actual.version + 1,
      updatedAt: ahora,
    };
    return ok({ registro, evento: this.construirEvento(registro, this.eventos.actualizada, actorId) });
  }

  /** Ejecuta una transición de la máquina de estados (comando lógico). */
  transicionar(
    actual: RegistroEntidad,
    comando: string,
    actorId: string,
    ahora: Date,
  ): Result<CambioEntidad, KernelError> {
    if (!this.maquina) {
      return fail(KernelErrors.conflict(`La entidad ${this.def.nombre} no define máquina de estados`));
    }
    const evaluado = this.maquina.evaluar(actual.estado, comando, actual.data);
    if (!evaluado.ok) return evaluado;
    const registro: RegistroEntidad = {
      ...actual,
      estado: evaluado.value.estadoNuevo,
      version: actual.version + 1,
      updatedAt: ahora,
    };
    const evento = this.construirEvento(registro, this.eventos.transicionada, actorId, {
      comando,
      estadoAnterior: evaluado.value.estadoAnterior,
    });
    return ok({ registro, evento });
  }

  /** Evento de eliminación (borrado suave) autosuficiente. */
  eventoEliminacion(actual: RegistroEntidad, actorId: string): {
    tipo: string;
    payload: Record<string, unknown>;
  } {
    return this.construirEvento(actual, this.eventos.eliminada, actorId, { eliminado: true });
  }

  nombresEventos(): ReturnType<typeof eventosDeEntidad> {
    return this.eventos;
  }
}
