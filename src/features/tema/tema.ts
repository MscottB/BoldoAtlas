export type Tema = "claro" | "oscuro" | "sistema";
export type Acento = "cobre" | "azul" | "verde" | "violeta";
export type Escala = 90 | 100 | 110 | 125;

export const ACENTOS: Record<Acento, string> = {
  cobre: "#C8743F",
  azul: "#2563EB",
  verde: "#0D9488",
  violeta: "#7C3AED",
};

/**
 * La marca como texto («Atlas» del logo, enlaces): el mismo tono que el acento, con la luminosidad justa para AA
 * (≥ 4,5:1) sobre background, card y sidebar de cada tema. Se escribe en --marca-texto.
 */
export const MARCA_TEXTO: Record<Acento, { claro: string; oscuro: string }> = {
  cobre: { claro: "#9e511e", oscuro: "#c8743f" },
  azul: { claro: "#205ee6", oscuro: "#3a7aff" },
  verde: { claro: "#00776c", oscuro: "#0d9488" },
  violeta: { claro: "#7c3aed", oscuro: "#985fff" },
};

function luminancia(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razón de contraste WCAG 2.x entre dos colores #RRGGBB / #RGB.
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export function textoSobre(hex: string): "#ffffff" | "#111827" {
  return contraste("#ffffff", hex) >= contraste("#111827", hex) ? "#ffffff" : "#111827";
}

/** --card de main.css en cada tema (oklch(1 0 0) y oklch(0.205 0 0)). */
const TARJETA = { claro: "#ffffff", oscuro: "#171717" };

/** Una marca con menos de 3:1 contra la tarjeta (p. ej. azul marino en oscuro) no se distingue: lleva contorno. */
export const marcaTenue = (color: string, oscuro: boolean): boolean =>
  contraste(color, oscuro ? TARJETA.oscuro : TARJETA.claro) < 3;
