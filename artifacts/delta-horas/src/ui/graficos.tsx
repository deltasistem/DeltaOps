/**
 * Gráficos del Dashboard, dibujados a mano en SVG y CSS para que hereden los
 * tokens del tema y no arrastren una librería de visualización.
 *
 * Todos reciben `PuntoSerie[]` construidos desde `MachineRecord.hours`.
 */

import { formatearHoras, formatearNumero, type PuntoSerie } from '@workspace/horas-maquina';

import { EstadoVacio } from './atomos';
import { cn } from './cn';

const SERIES = [
  'var(--dh-serie-1)',
  'var(--dh-serie-2)',
  'var(--dh-serie-3)',
  'var(--dh-serie-4)',
  'var(--dh-serie-5)',
  'var(--dh-serie-6)',
  'var(--dh-serie-7)',
] as const;

function SinDatos({ mensaje = 'No hay registros para este período.' }: { readonly mensaje?: string }) {
  return <EstadoVacio titulo={mensaje} />;
}

/** Ranking horizontal: la forma más legible de comparar cargadores u operadores. */
export function BarrasHorizontales({
  datos,
  limite = 8,
  color = 'var(--dh-serie-1)',
}: {
  readonly datos: readonly PuntoSerie[];
  readonly limite?: number;
  readonly color?: string;
}) {
  if (datos.length === 0) return <SinDatos />;
  const visibles = datos.slice(0, limite);
  const maximo = Math.max(...visibles.map((d) => d.valor), 1);

  return (
    <ul className="flex flex-col gap-2.5">
      {visibles.map((punto) => (
        <li key={punto.clave} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[14px] font-medium">{punto.etiqueta}</span>
            <span className="dh-numero shrink-0 text-[13px] font-semibold text-texto-2">
              {formatearHoras(punto.valor)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-relleno-2">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max((punto.valor / maximo) * 100, 1.5)}%`,
                background: color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Serie temporal de horas por fecha. */
export function LineaTiempo({ datos }: { readonly datos: readonly PuntoSerie[] }) {
  if (datos.length === 0) return <SinDatos />;

  const ANCHO = 620;
  const ALTO = 190;
  const MARGEN = { arriba: 14, derecha: 10, abajo: 26, izquierda: 10 };
  const util = {
    ancho: ANCHO - MARGEN.izquierda - MARGEN.derecha,
    alto: ALTO - MARGEN.arriba - MARGEN.abajo,
  };
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  const x = (i: number) =>
    MARGEN.izquierda +
    (datos.length === 1 ? util.ancho / 2 : (i / (datos.length - 1)) * util.ancho);
  const y = (valor: number) => MARGEN.arriba + util.alto - (valor / maximo) * util.alto;

  const puntos = datos.map((d, i) => `${x(i)},${y(d.valor)}`).join(' ');
  const area = `M ${MARGEN.izquierda},${MARGEN.arriba + util.alto} L ${puntos
    .split(' ')
    .join(' L ')} L ${x(datos.length - 1)},${MARGEN.arriba + util.alto} Z`;

  const etiquetas = datos.filter(
    (_, i) => i === 0 || i === datos.length - 1 || i % Math.ceil(datos.length / 5) === 0,
  );

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label="Horas máquina por fecha"
      >
        <defs>
          <linearGradient id="dh-degradado-linea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--dh-serie-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--dh-serie-1)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((fraccion) => (
          <line
            key={fraccion}
            x1={MARGEN.izquierda}
            x2={ANCHO - MARGEN.derecha}
            y1={MARGEN.arriba + util.alto * fraccion}
            y2={MARGEN.arriba + util.alto * fraccion}
            stroke="var(--dh-borde)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {datos.length > 1 && <path d={area} fill="url(#dh-degradado-linea)" />}
        <polyline
          points={puntos}
          fill="none"
          stroke="var(--dh-serie-1)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {datos.map((d, i) => (
          <g key={d.clave}>
            <circle
              cx={x(i)}
              cy={y(d.valor)}
              r={datos.length > 24 ? 2 : 3.5}
              fill="var(--dh-superficie)"
              stroke="var(--dh-serie-1)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <title>{`${d.etiqueta}: ${formatearHoras(d.valor)}`}</title>
          </g>
        ))}
      </svg>

      <div className="flex justify-between px-1 text-[11px] text-texto-3">
        {etiquetas.map((d) => (
          <span key={d.clave}>{d.etiqueta}</span>
        ))}
      </div>
    </div>
  );
}

/** Reparto porcentual: propio frente a tercerizado, día frente a noche. */
export function Dona({
  datos,
  centro,
}: {
  readonly datos: readonly PuntoSerie[];
  readonly centro?: string;
}) {
  if (datos.length === 0) return <SinDatos />;

  const total = datos.reduce((suma, d) => suma + d.valor, 0);
  const RADIO = 60;
  const GROSOR = 22;
  const circunferencia = 2 * Math.PI * RADIO;
  let acumulado = 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <svg
        viewBox="0 0 150 150"
        className="h-36 w-36 shrink-0 -rotate-90"
        role="img"
        aria-label="Reparto de horas máquina"
      >
        <circle
          cx="75"
          cy="75"
          r={RADIO}
          fill="none"
          stroke="var(--dh-relleno-2)"
          strokeWidth={GROSOR}
        />
        {total > 0 &&
          datos.map((d, i) => {
            const fraccion = d.valor / total;
            const trazo = fraccion * circunferencia;
            const desfase = acumulado * circunferencia;
            acumulado += fraccion;
            return (
              <circle
                key={d.clave}
                cx="75"
                cy="75"
                r={RADIO}
                fill="none"
                stroke={SERIES[i % SERIES.length]}
                strokeWidth={GROSOR}
                strokeDasharray={`${trazo} ${circunferencia - trazo}`}
                strokeDashoffset={-desfase}
                strokeLinecap="butt"
              >
                <title>{`${d.etiqueta}: ${formatearHoras(d.valor)}`}</title>
              </circle>
            );
          })}
      </svg>

      <ul className="flex w-full flex-col gap-2">
        {centro && (
          <li className="dh-numero font-titulo text-[20px] font-bold">{centro}</li>
        )}
        {datos.map((d, i) => (
          <li key={d.clave} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SERIES[i % SERIES.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {d.etiqueta}
            </span>
            <span className="dh-numero shrink-0 text-[13px] font-semibold text-texto-2">
              {formatearHoras(d.valor)}
            </span>
            <span className="dh-numero w-12 shrink-0 text-right text-[12px] text-texto-3">
              {total > 0 ? `${formatearNumero((d.valor / total) * 100, 1)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Contenedor común: título, subtítulo y el gráfico dentro de una tarjeta. */
export function PanelGrafico({
  titulo,
  detalle,
  className,
  children,
}: {
  readonly titulo: string;
  readonly detalle?: string;
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={cn('dh-tarjeta flex flex-col gap-3 p-4', className)}>
      <div>
        <h3 className="font-titulo text-[15px] font-bold">{titulo}</h3>
        {detalle && <p className="text-[12px] text-texto-3">{detalle}</p>}
      </div>
      {children}
    </div>
  );
}
