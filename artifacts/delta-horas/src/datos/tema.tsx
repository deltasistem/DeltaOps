/**
 * Tema claro, oscuro o el del sistema. La preferencia se recuerda en el
 * navegador y se aplica añadiendo la clase `oscuro` al documento.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export const TEMAS = ['auto', 'claro', 'oscuro'] as const;
export type Tema = (typeof TEMAS)[number];

export const ETIQUETA_TEMA: Record<Tema, string> = {
  auto: 'Automático',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

const CLAVE = 'delta-horas.tema';

interface ValorTema {
  readonly tema: Tema;
  readonly oscuro: boolean;
  readonly cambiar: (tema: Tema) => void;
}

const Contexto = createContext<ValorTema | null>(null);

export function useTema(): ValorTema {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useTema requiere <ProveedorTema>.');
  return valor;
}

function leerPreferencia(): Tema {
  if (typeof window === 'undefined') return 'auto';
  const guardado = window.localStorage.getItem(CLAVE);
  return TEMAS.includes(guardado as Tema) ? (guardado as Tema) : 'auto';
}

export function ProveedorTema({ children }: { readonly children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(leerPreferencia);
  const [sistemaOscuro, setSistemaOscuro] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const consulta = window.matchMedia('(prefers-color-scheme: dark)');
    const alCambiar = (evento: MediaQueryListEvent) => setSistemaOscuro(evento.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  const oscuro = tema === 'oscuro' || (tema === 'auto' && sistemaOscuro);

  useEffect(() => {
    document.documentElement.classList.toggle('oscuro', oscuro);
    document.documentElement.style.colorScheme = oscuro ? 'dark' : 'light';
  }, [oscuro]);

  const cambiar = useCallback((siguiente: Tema) => {
    setTema(siguiente);
    window.localStorage.setItem(CLAVE, siguiente);
  }, []);

  const valor = useMemo(() => ({ tema, oscuro, cambiar }), [cambiar, oscuro, tema]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
