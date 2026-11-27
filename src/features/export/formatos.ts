import type { Nivel } from "./niveles";

/** Lo que aguanta un canvas (WebView2 y WebKit): por lado y en total. */
export const LADO_MAX = 16384;
// Más que esto, un canvas puede salir en blanco sin avisar en equipos con poca GPU.
export const AREA_MAX = 120_000_000;

/** La escala pedida, bajada si la imagen no cabe: ni por lado ni en área. */
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

/** A 1x ya no cabe: PNG, JPG o copiar saldrían más chicos que en pantalla (ilegibles). */
export const pngMenorQuePantalla = (ancho: number, alto: number) => escalaQueCabe(ancho, alto, 1).bajada;

/** El fondo con que se arma la imagen: el elegido solo cuenta en PNG (solo ahí se ofrece); los demás van en blanco. */
export const fondoDePng = (
  formato: "png" | "jpg" | "svg" | "pdf" | "html",
  fondo: "blanco" | "transparente",
): "blanco" | "transparente" => (formato === "png" ? fondo : "blanco");

// Solo letras y números; lo demás (incluido lo que Windows no admite) pasa a «_», sin repetirse ni quedar en los bordes.
const limpio = (t: string) =>
  Array.from(t.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, ""))
    .slice(0, 50) // el nombre entero queda bajo ~150 caracteres
    .join("")
    .replace(/_$/, "");

/** `Organizacion_Alcance_nivel_AAAA-MM-DD.ext`, seguro en Windows. El manual va con «manual» en lugar del nivel. */
export function nombreArchivo(
  organizacion: string,
  alcance: string,
  nivel: Nivel | "manual",
  ext: "png" | "jpg" | "svg" | "pdf" | "html",
  fecha: string,
): string {
  const partes = [limpio(organizacion) || "BoldoAtlas", limpio(alcance), nivel, fecha].filter(Boolean);
  return `${partes.join("_")}.${ext}`;
}

/**
 * Cuántas páginas tiene un PDF de pdfmake. pdfkit escribe sus diccionarios sin comprimir, y el de las páginas va al
 * final: ahí está su cuenta. Se lee desde el final, cada vez el doble, para no pasar a texto un PDF de cientos de MB.
 */
export function paginasDelPdf(pdf: Uint8Array): number {
  for (let n = 1 << 16; ; n *= 2) {
    const m = /\/Type \/Pages\n\/Count (\d+)/.exec(
      new TextDecoder("latin1").decode(pdf.subarray(Math.max(0, pdf.length - n))),
    );
    if (m || n >= pdf.length) return Number(m?.[1] ?? 0);
  }
}
