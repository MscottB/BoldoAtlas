export type Tema = "claro" | "oscuro" | "sistema";
export type Acento = "cobre" | "azul" | "verde" | "violeta";
export type Escala = 90 | 100 | 110 | 125;

export const ACENTOS: Record<Acento, string> = {
  cobre: "#C8743F",
  azul: "#2563EB",
  verde: "#0D9488",
  violeta: "#7C3AED",
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
