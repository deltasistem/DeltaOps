import { describe, expect, it } from 'vitest';

import { derivarAlertas } from '../alertas';
import { ultimoHorometro } from '../calculos';
import {
  anularRegistro,
  cambiarEstadoMaestro,
  crearRegistro,
  editarRegistro,
  guardarMaestro,
  usosEnRegistros,
} from '../operaciones';
import { puedeAnularRegistro, puedeEditarRegistro } from '../permisos';
import { crearSemilla } from '../semillas';
import { resumirDashboard } from '../calculos';
import type { BaseDatos, EntradaRegistro, Usuario } from '../tipos';

const HOY = '2026-09-03';

function contexto(base: BaseDatos, usuarioId: string, sufijo = '1') {
  let n = 0;
  return {
    usuario: base.usuarios.find((u) => u.id === usuarioId)!,
    ahora: `${HOY}T15:00:00.000Z`,
    nuevoId: () => `id-${sufijo}-${(n += 1)}`,
  };
}

const ENTRADA: EntradaRegistro = {
  fecha: HOY,
  clienteId: 'cli-riverport',
  operacionId: 'ope-recogida',
  materialId: 'mat-carbon',
  maquinaId: 'maq-c5',
  recibo: '9001',
  horometroInicial: 100,
  horometroFinal: 107.5,
  turnoId: 'tur-dia',
  supervisorId: 'sup-reinaldo',
  operadorId: 'opr-diego',
  observaciones: '',
};

describe('crearRegistro', () => {
  it('calcula las horas y fotografía los datos del maestro', () => {
    const base = crearSemilla(HOY);
    const { registro } = crearRegistro(base, ENTRADA, contexto(base, 'usr-admin'));

    expect(registro.hours).toBe(7.5);
    expect(registro.maquinaCodigo).toBe('C5');
    expect(registro.clienteNombre).toBe('RIVERPORT');
    expect(registro.materialNombre).toBe('CARBON');
    expect(registro.operadorNombre).toBe('DIEGO RAMIREZ');
    expect(registro.estado).toBe('activo');
  });

  it('deriva propiedad y proveedor de la máquina, sin pedirlos al usuario', () => {
    const base = crearSemilla(HOY);
    const propio = crearRegistro(base, ENTRADA, contexto(base, 'usr-admin')).registro;
    expect(propio.propiedad).toBe('propio');

    const tercerizado = crearRegistro(
      base,
      { ...ENTRADA, maquinaId: 'maq-sem6', recibo: '9002' },
      contexto(base, 'usr-admin'),
    ).registro;
    expect(tercerizado.propiedad).toBe('tercerizado');
    expect(tercerizado.proveedorNombre).toBe('GPR');
  });

  it('conserva la fotografía aunque después cambie el maestro', () => {
    let base = crearSemilla(HOY);
    const creado = crearRegistro(base, ENTRADA, contexto(base, 'usr-admin'));
    base = creado.base;

    base = guardarMaestro(
      base,
      'maquinas',
      { id: 'maq-c5', codigo: 'C5-R', nombre: 'Cargador C5 repotenciado' },
      { codigo: 'Código', nombre: 'Nombre' },
      contexto(base, 'usr-admin', 'm'),
    ).base;

    const guardado = base.registros.find((r) => r.id === creado.registro.id)!;
    expect(guardado.maquinaCodigo).toBe('C5');
    expect(base.maquinas.find((m) => m.id === 'maq-c5')?.codigo).toBe('C5-R');
  });

  it('registra la creación en la auditoría', () => {
    const base = crearSemilla(HOY);
    const { base: siguiente, registro } = crearRegistro(
      base,
      ENTRADA,
      contexto(base, 'usr-admin'),
    );
    const entrada = siguiente.auditoria[0]!;
    expect(entrada.accion).toBe('crear');
    expect(entrada.entidad).toBe('registro');
    expect(entrada.entidadId).toBe(registro.id);
    expect(entrada.usuarioNombre).toBe('Marcela Ortiz');
  });

  it('guarda la advertencia de recibo duplicado sin bloquear', () => {
    const base = crearSemilla(HOY);
    const existente = base.registros[0]!;
    const { registro } = crearRegistro(
      base,
      { ...ENTRADA, recibo: existente.recibo },
      contexto(base, 'usr-admin'),
    );
    expect(registro.advertencias.map((a) => a.clave)).toContain('recibo-duplicado');
  });

  it('encadena el horómetro para el siguiente registro de la máquina', () => {
    const base = crearSemilla(HOY);
    const { base: siguiente, registro } = crearRegistro(
      base,
      ENTRADA,
      contexto(base, 'usr-admin'),
    );
    expect(ultimoHorometro(siguiente.registros, 'maq-c5')?.valor).toBe(
      registro.horometroFinal,
    );
  });
});

describe('editarRegistro', () => {
  it('recalcula las horas y deja el rastro del cambio', () => {
    let base = crearSemilla(HOY);
    const creado = crearRegistro(base, ENTRADA, contexto(base, 'usr-admin'));
    base = creado.base;

    const editado = editarRegistro(
      base,
      creado.registro.id,
      { ...ENTRADA, horometroFinal: 110 },
      contexto(base, 'usr-supervisor', 'e'),
    );

    expect(editado.registro.hours).toBe(10);
    expect(editado.registro.actualizadoPorNombre).toBe('Reinaldo Mendoza');
    expect(editado.registro.creadoPorNombre).toBe('Marcela Ortiz');

    const cambios = editado.base.auditoria[0]!.cambios;
    expect(cambios.map((c) => c.etiqueta)).toEqual(
      expect.arrayContaining(['Horómetro final', 'Horas']),
    );
    expect(cambios.find((c) => c.etiqueta === 'Horas')).toMatchObject({
      anterior: '7,50 h',
      nuevo: '10,00 h',
    });
  });
});

describe('anularRegistro', () => {
  it('conserva el registro y guarda quién, cuándo y por qué', () => {
    let base = crearSemilla(HOY);
    const creado = crearRegistro(base, ENTRADA, contexto(base, 'usr-admin'));
    base = creado.base;
    const antes = base.registros.length;

    const anulado = anularRegistro(
      base,
      creado.registro.id,
      'Recibo cargado dos veces',
      contexto(base, 'usr-admin', 'a'),
    );

    expect(anulado.base.registros).toHaveLength(antes);
    expect(anulado.registro.estado).toBe('anulado');
    expect(anulado.registro.anuladoPorNombre).toBe('Marcela Ortiz');
    expect(anulado.registro.motivoAnulacion).toBe('Recibo cargado dos veces');
    expect(anulado.base.auditoria[0]!.motivo).toBe('Recibo cargado dos veces');
  });

  it('saca las horas anuladas del Dashboard', () => {
    let base = crearSemilla(HOY);
    const creado = crearRegistro(base, ENTRADA, contexto(base, 'usr-admin'));
    base = creado.base;
    const antes = resumirDashboard(base.registros).totalHoras;

    base = anularRegistro(base, creado.registro.id, 'Error', contexto(base, 'usr-admin', 'a')).base;

    expect(resumirDashboard(base.registros).totalHoras).toBeCloseTo(antes - 7.5, 2);
  });
});

describe('maestros', () => {
  it('crea y actualiza sin perder la historia', () => {
    let base = crearSemilla(HOY);
    const creado = guardarMaestro(
      base,
      'materiales',
      { nombre: 'CLINKER', categoria: 'Mineral' },
      { nombre: 'Nombre', categoria: 'Categoría' },
      contexto(base, 'usr-admin'),
    );
    base = creado.base;
    expect(base.materiales.map((m) => m.nombre)).toContain('CLINKER');
    expect(creado.elemento.estado).toBe('activo');
    expect(base.auditoria[0]!.accion).toBe('crear');
  });

  it('desactiva en lugar de eliminar y lo registra', () => {
    let base = crearSemilla(HOY);
    const resultado = cambiarEstadoMaestro(
      base,
      'maquinas',
      'maq-c1',
      'inactivo',
      contexto(base, 'usr-admin'),
    );
    base = resultado.base;
    expect(base.maquinas.find((m) => m.id === 'maq-c1')?.estado).toBe('inactivo');
    expect(base.auditoria[0]!.accion).toBe('desactivar');
  });

  it('reporta cuántos registros dependen de un maestro', () => {
    const base = crearSemilla(HOY);
    expect(usosEnRegistros(base, 'maquinas', 'maq-c1')).toBeGreaterThan(0);
    expect(usosEnRegistros(base, 'materiales', 'mat-caliza')).toBe(0);
  });
});

describe('permisos sobre registros', () => {
  const base = crearSemilla(HOY);
  const usuario = (id: string): Usuario => base.usuarios.find((u) => u.id === id)!;
  const reciente = base.registros.find((r) => r.fecha === HOY && r.estado === 'activo')!;
  const antiguo = { ...reciente, fecha: '2026-06-01' };

  it('el administrador corrige cualquier registro', () => {
    expect(puedeEditarRegistro(usuario('usr-admin'), antiguo, HOY)).toBe(true);
  });

  it('el supervisor autorizado solo corrige los recientes', () => {
    expect(puedeEditarRegistro(usuario('usr-supervisor'), reciente, HOY)).toBe(true);
    expect(puedeEditarRegistro(usuario('usr-supervisor'), antiguo, HOY)).toBe(false);
  });

  it('captura y gerencia no editan ni anulan', () => {
    expect(puedeEditarRegistro(usuario('usr-captura'), reciente, HOY)).toBe(false);
    expect(puedeEditarRegistro(usuario('usr-gerencia'), reciente, HOY)).toBe(false);
    expect(puedeAnularRegistro(usuario('usr-captura'), reciente)).toBe(false);
    expect(puedeAnularRegistro(usuario('usr-admin'), reciente)).toBe(true);
  });

  it('un registro anulado ya no se edita', () => {
    expect(
      puedeEditarRegistro(usuario('usr-admin'), { ...reciente, estado: 'anulado' }, HOY),
    ).toBe(false);
  });
});

describe('semilla', () => {
  const base = crearSemilla(HOY);

  it('trae la operación de referencia de RIVERPORT', () => {
    expect(base.clientes.map((c) => c.nombre)).toEqual(['RIVERPORT']);
    expect(base.maquinas.map((m) => m.codigo)).toEqual([
      'C1',
      'C5',
      'C7',
      'C11',
      '950-01',
      '950-03',
      'SEM 6 GPR',
    ]);
    expect(base.turnos.map((t) => t.nombre)).toEqual(['Día', 'Noche']);
    expect(base.supervisores.map((s) => s.nombre)).toContain('REINALDO');
  });

  it('incluye el registro de referencia del cargador C1', () => {
    const c1 = base.registros.find((r) => r.fecha === HOY && r.maquinaCodigo === 'C1')!;
    expect(c1.recibo).toBe('1949');
    expect(c1.horometroInicial).toBe(8871.7);
    expect(c1.horometroFinal).toBe(8879.2);
    expect(c1.hours).toBe(7.5);
    expect(c1.operadorNombre).toBe('WILMER DE LA ROSA SANCHEZ');
  });

  it('mantiene la continuidad del horómetro del C1', () => {
    const anteriores = base.registros
      .filter((r) => r.maquinaId === 'maq-c1' && r.fecha < HOY)
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    expect(anteriores.at(-1)?.horometroFinal).toBe(8871.7);
  });

  it('deja una anomalía de cada tipo para el panel de alertas', () => {
    const claves = new Set(derivarAlertas(base.registros).map((a) => a.clave));
    expect(claves).toContain('cero-horas');
    expect(claves).toContain('horometro-diferencia');
    expect(claves).toContain('recibo-duplicado');
    expect(claves).toContain('anulado');
  });
});
