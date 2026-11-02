import { convertFileSrc } from "@tauri-apps/api/core";
import type { Trabajador } from "@/db/tipos";
import { leerComoUrl } from "@/features/configuracion/logo";

// La foto más grande en pantalla es de 56 px (vista previa de Personas); en el lienzo, 32 px con zoom 2 son 64 px. Con
// pantallas de 2x y 3x hacen falta hasta 168 px. Probado con retratos sintéticos de 2000x2667: desde 256 px y calidad 0,85
// no se ve diferencia (128 px se ve borroso) y pesa unos 6 KB; 320 px pesa un 50 % más sin verse mejor. Medidas en
// docs/superpowers/notas/2026-11-01-fotos-optimizadas.md.
export const FOTO_LADO_MAX = 256;
export const FOTO_CALIDAD = 0.85;
// JPEG y no WebP: WebP pesa un tercio menos, pero Safari y WebKitGTK no lo escriben desde un canvas (dan PNG), y aquí hay
// poco que ganar.
const TIPO_SALIDA = "image/jpeg";
/** Sin reducirla, una foto se vuelve a comprimir solo si baja al menos un 10 %: si no, se pierde calidad a cambio de nada. */
const GANANCIA_MINIMA = 0.9;

/** Medidas para que el lado mayor no pase de `lado`. Una imagen más chica se queda igual: nunca se agranda. */
export function medidasReducidas(ancho: number, alto: number, lado = FOTO_LADO_MAX) {
  const escala = Math.min(1, lado / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
    reducida: escala < 1,
  };
}

/** ¿Vale la pena quedarse con la convertida? */
export const convieneConvertir = (original: number, convertida: number, reducida: boolean): boolean =>
  convertida < original && (reducida || convertida <= original * GANANCIA_MINIMA);

/**
 * La foto lista para guardar: reducida y en JPEG, o la misma `archivo` si convertirla no conviene. Se dibuja desde un
 * <img>, que aplica la orientación EXIF (probado en WebView2); al reescribirla se van los metadatos, como el GPS.
 * Lo transparente queda blanco.
 */
export async function optimizarFoto(archivo: Blob): Promise<Blob> {
  const img = new Image();
  img.src = await leerComoUrl(archivo);
  await img.decode();
  const { ancho, alto, reducida } = medidasReducidas(img.naturalWidth, img.naturalHeight);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const g = lienzo.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, ancho, alto);
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, ancho, alto);
  const nueva = await new Promise<Blob>((ok, mal) =>
    lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("foto"))), TIPO_SALIDA, FOTO_CALIDAD),
  );
  return convieneConvertir(archivo.size, nueva.size, reducida) ? nueva : archivo;
}

/**
 * URL de la foto, servida por Rust (src-tauri/src/fotos.rs). `convertFileSrc` da la forma de cada sistema:
 * `http://foto.localhost/<id>` en Windows y `foto://localhost/<id>` en Linux y macOS. Solo para quien tiene foto.
 */
export const urlFoto = (w: Pick<Trabajador, "id" | "updated_at">): string =>
  `${convertFileSrc(w.id, "foto")}?v=${encodeURIComponent(w.updated_at)}`;
