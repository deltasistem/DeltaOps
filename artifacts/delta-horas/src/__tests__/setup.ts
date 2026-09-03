import '@testing-library/jest-dom/vitest';

import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * jsdom no implementa `matchMedia` (tema automático) ni las animaciones que
 * usa framer-motion. Se resuelven aquí para que las pruebas ejerciten la
 * lógica de las pantallas y no los detalles del entorno.
 */
beforeEach(() => {
  window.localStorage.clear();
  // La navegación usa la History API: cada prueba debe arrancar en Inicio.
  window.history.replaceState(null, '', '/');

  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (consulta: string) => ({
        matches: false,
        media: consulta,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
