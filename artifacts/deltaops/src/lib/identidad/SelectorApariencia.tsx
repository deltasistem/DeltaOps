/**
 * DIRECTIVA CONSISTENCIA VISUAL · Selector de apariencia (Claro/Oscuro/Automático).
 *
 * Compone EXCLUSIVAMENTE sobre el Design System: `useTheme` (Theme Engine del DS,
 * autoridad única de la preferencia, persistida en `localStorage["do-tema"]`) y
 * `RadioGroup`/`Radio` (accesibles: `role="radiogroup"`, navegación por teclado,
 * labels). El cambio se aplica de inmediato (sin logout): `setTema` actualiza el
 * `data-do-theme` global y todos los `do-root` que heredan de él.
 *
 * No crea un segundo sistema de tema ni contratos backend: la persistencia
 * server-side por identidad queda documentada como evolución futura.
 */
import React, { useState } from "react";
import { useTheme, RadioGroup, Radio, Modal, Button, type Tema } from "@workspace/design-system";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";

/** Etiqueta legible de cada tema para lectura semántica. */
const ETIQUETA: Record<Tema, string> = {
  light: "Claro",
  dark: "Oscuro",
  auto: "Automático",
};

/**
 * Contenido del selector (radiogroup). Reutilizable dentro de un Modal (menú de
 * perfil) o embebido (consola SUPER_ADMIN).
 */
export function OpcionesApariencia() {
  const { tema, setTema } = useTheme();
  return (
    <RadioGroup
      label="Apariencia de la interfaz"
      value={tema}
      onChange={(v) => setTema(v as Tema)}
      orientation="vertical"
    >
      <Radio value="light" label="Claro" />
      <Radio value="dark" label="Oscuro" />
      <Radio value="auto" label="Automático (según el sistema)" />
    </RadioGroup>
  );
}

/**
 * Disparador + Modal para el menú de perfil del AppShell. El botón tiene
 * `minHeight:48` (objetivo táctil) e icono acorde al tema activo.
 */
export function SelectorApariencia({
  variante = "boton",
}: {
  /** "boton": botón completo (menú de perfil). "compacto": para barras densas. */
  variante?: "boton" | "compacto";
}) {
  const { tema } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const Icono = tema === "dark" ? Moon : tema === "light" ? Sun : MonitorSmartphone;
  return (
    <>
      <Button
        variant="secundario"
        size={variante === "compacto" ? "sm" : "md"}
        style={variante === "compacto" ? undefined : { minHeight: 48 }}
        onClick={() => setAbierto(true)}
        aria-haspopup="dialog"
      >
        <Icono size={18} aria-hidden="true" /> Apariencia: {ETIQUETA[tema]}
      </Button>
      <Modal
        abierto={abierto}
        onClose={() => setAbierto(false)}
        titulo="Apariencia"
        size="sm"
        pie={
          <Button variant="primario" size="md" style={{ minHeight: 48 }} onClick={() => setAbierto(false)}>
            Listo
          </Button>
        }
      >
        <p style={{ margin: "0 0 var(--do-sp-3)", color: "var(--do-texto-suave)", fontSize: "var(--do-text-sm)" }}>
          Elige cómo se ve DeltaOps. La preferencia se mantiene en toda la
          plataforma y se recuerda en este dispositivo.
        </p>
        <OpcionesApariencia />
      </Modal>
    </>
  );
}
