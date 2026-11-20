import type { Nivel } from "./niveles";

/** Lo que aguanta un canvas (WebView2 y WebKit): por lado y en total. */
export const LADO_MAX = 16384;
export const AREA_MAX = 268435456;

/** La escala pedida, bajada si la imagen no cabe. Con el lado en 16384, el área nunca pasa de 16384²; se piden las dos. */
export function escalaQueCabe(
  ancho: number,
  alto: number,
  escala: 1 | 2 | 3 | 4,
): { escala: number; bajada: boolean } {
  const tope = Math.min(LADO_MAX / Math.max(ancho, alto), Math.sqrt(AREA_MAX / (ancho * alto)));
  if (escala <= tope) return { escala, bajada: false };
  // hacia abajo, a 4 decimales: así el producto nunca pasa del tope
  return { escala: Math.floor(tope * 10000) / 10000, bajada: true };
}

// Solo letras y números; lo demás (incluido lo que Windows no admite) pasa a «_», sin repetirse ni quedar en los bordes.
const limpio = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");

/** `Organizacion_Alcance_nivel_AAAA-MM-DD.ext`, seguro en Windows. */
export function nombreArchivo(
  organizacion: string,
  alcance: string,
  nivel: Nivel,
  ext: "png" | "jpg" | "svg",
  fecha: string,
): string {
  const partes = [limpio(organizacion) || "BoldoAtlas", limpio(alcance), nivel, fecha].filter(Boolean);
  return `${partes.join("_")}.${ext}`;
}
