import { FOTO_MAX_BYTES, FOTO_TIPOS } from "@/features/trabajadores/validar";

/** Lado mayor al convertir: meta se relee entero tras cada escritura, así que el logo no debe pesar de más. */
const LADO_MAX = 512;

/** null = válido; si no, qué falló (sufijo de `config.logo.error.*`). El tipo se revisa antes que el tamaño. */
export function validarLogo(archivo: { type: string; size: number }): "tipo" | "tamano" | null {
  if (!FOTO_TIPOS.includes(archivo.type)) return "tipo"; // mismos tipos y tope que la foto de la ficha
  return archivo.size > FOTO_MAX_BYTES ? "tamano" : null;
}

/** La parte base64 de un data URL (`meta.logo_png` no lleva el prefijo). */
export const base64De = (dataUrl: string): string => dataUrl.slice(dataUrl.indexOf(",") + 1);

export const leerComoUrl = (archivo: Blob) =>
  new Promise<string>((ok, mal) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result as string);
    lector.onerror = () => mal(lector.error);
    lector.readAsDataURL(archivo);
  });

/** Base64 de un PNG; JPG y WebP se convierten con un canvas (reducidos a `LADO_MAX` si lo superan). */
export async function logoComoPng(archivo: File): Promise<string> {
  const url = await leerComoUrl(archivo);
  if (archivo.type === "image/png") return base64De(url);
  const img = await new Promise<HTMLImageElement>((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => mal(new Error("imagen"));
    i.src = url;
  });
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(img.naturalWidth * escala));
  lienzo.height = Math.max(1, Math.round(img.naturalHeight * escala));
  lienzo.getContext("2d")!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return base64De(lienzo.toDataURL("image/png"));
}
