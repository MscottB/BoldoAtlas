import { convertFileSrc } from "@tauri-apps/api/core";
import type { Trabajador } from "@/db/tipos";
import { base64De, leerComoUrl } from "@/features/configuracion/logo";
import { FOTO_MAX_BYTES } from "./validar";

// La foto más grande en pantalla es de 56 px (vista previa de Personas); en el lienzo, 32 px con zoom 2 son 64 px. Con
// pantallas de 2x y 3x hacen falta hasta 168 px. Probado solo con imágenes sintéticas: con detalle de foto (ruido fractal y
// grano, 12 MP), 256 px y calidad 0,85 pesa de 11 a 24 KB y no se distingue del original, mientras que 128 px se ve borroso;
// 320 px pesa un 50 % más y solo mejora un poco en pantallas de 3x. Falta confirmarlo con fotos reales. Medidas en
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

/**
 * ¿Vale la pena quedarse con la convertida? `limpiar`: la original puede traer datos ocultos (ver `puedeTraerDatos`), y
 * entonces basta con que no pese más.
 */
export const convieneConvertir = (
  original: number,
  convertida: number,
  reducida: boolean,
  limpiar = false,
): boolean => {
  if (convertida > original) return false;
  return limpiar || (convertida < original && (reducida || convertida <= original * GANANCIA_MINIMA));
};

const esJpeg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const texto = (b: Uint8Array, desde: number, hasta: number) => String.fromCharCode(...b.subarray(desde, hasta));
const esWebp = (b: Uint8Array) => texto(b, 0, 4) === "RIFF" && texto(b, 8, 12) === "WEBP";

/** El tipo según los bytes, nunca según lo que diga el dato guardado. */
export const tipoImagen = (b: Uint8Array): string =>
  esJpeg(b) ? "image/jpeg" : esWebp(b) ? "image/webp" : b[0] === 0x89 ? "image/png" : "application/octet-stream";

/**
 * ¿Puede traer datos además de la imagen (GPS, cámara, autor)? JPEG: EXIF o XMP (APP1), IPTC (APP13) o comentario. WebP: la
 * marca de EXIF o XMP de su cabecera. PNG u otro: no se revisa y se da por sí. Ante una cabecera que no se entiende, también.
 */
export function puedeTraerDatos(b: Uint8Array): boolean {
  if (esWebp(b)) return texto(b, 12, 16) === "VP8X" && (b[20]! & 0x0c) !== 0;
  if (!esJpeg(b)) return true;
  for (let i = 2; i + 4 <= b.length; i += 2 + ((b[i + 2]! << 8) | b[i + 3]!)) {
    const marca = b[i + 1]!;
    if (b[i] !== 0xff || marca === 0xe1 || marca === 0xed || marca === 0xfe) return true;
    if (marca === 0xda) return false; // empieza la imagen: ya no hay más cabeceras
  }
  return true;
}

/** Sobre esto no se decodifica: ocuparía casi 500 MB de memoria. Los teléfonos sacan entre 12 y 108 megapíxeles. */
export const FOTO_MAX_PIXELES = 120_000_000;
export class FotoEnorme extends Error {}

/** `onload` ya da las medidas y aún no decodifica: así una imagen enorme se rechaza sin ocupar su memoria. */
const leerMedidas = (url: string) =>
  new Promise<HTMLImageElement>((ok, mal) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => mal(new Error("foto"));
    i.src = url;
  });

/**
 * La foto lista para guardar: reducida y en JPEG, o la misma `archivo` si convertirla no conviene. Se dibuja desde un
 * <img>, que aplica la orientación EXIF (probado en WebView2). Lo transparente queda blanco.
 * Datos ocultos: la convertida no trae ninguno. Si convertirla pesaría más que la original, se queda la original, con los que
 * traiga. También se queda una JPEG o WebP sin datos que no baje un 10 %.
 */
export async function optimizarFoto(archivo: Blob): Promise<Blob> {
  const img = await leerMedidas(await leerComoUrl(archivo));
  if (img.naturalWidth * img.naturalHeight > FOTO_MAX_PIXELES) throw new FotoEnorme();
  await img.decode();
  const inicio = new Uint8Array(await archivo.slice(0, 256 * 1024).arrayBuffer());
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
  return convieneConvertir(archivo.size, nueva.size, reducida, puedeTraerDatos(inicio)) ? nueva : archivo;
}

export type ErrorFoto = "fotoPesada" | "fotoLectura" | "fotoEnorme" | "fotoDemorada" | "fotoGuardado";
export type FotoPreparada = { base64: string } | { error: ErrorFoto };

/** Cerrar la ficha espera a la foto: un `decode()` o `toBlob` que no responde no puede dejarla sin poder cerrarse. */
export const FOTO_TOPE_MS = 30_000;
class FotoDemorada extends Error {}

/**
 * Lo que la ficha guarda de un archivo elegido. Procesarlo toma tiempo: si mientras tanto se abrió otra ficha (`sigueAbierta`
 * da false), devuelve null y no entrega nada, para que la foto de una persona nunca termine en otra. Lo que termine después
 * del tope se pierde: quien llama ya recibió el error.
 */
export async function prepararFoto(
  archivo: Blob,
  sigueAbierta: () => boolean,
  pasos: { optimizar: (a: Blob) => Promise<Blob>; aBase64: (f: Blob) => Promise<string> } = {
    optimizar: optimizarFoto,
    aBase64: async (f) => base64De(await leerComoUrl(f)),
  },
): Promise<FotoPreparada | null> {
  if (!sigueAbierta()) return null;
  const trabajo = async (): Promise<FotoPreparada | null> => {
    const foto = await pasos.optimizar(archivo);
    if (!sigueAbierta()) return null;
    if (foto.size > FOTO_MAX_BYTES) return { error: "fotoPesada" };
    const base64 = await pasos.aBase64(foto);
    return sigueAbierta() ? { base64 } : null;
  };
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, mal) => {
    reloj = setTimeout(() => mal(new FotoDemorada()), FOTO_TOPE_MS);
  });
  try {
    return await Promise.race([trabajo(), tope]);
  } catch (e) {
    if (!sigueAbierta()) return null;
    if (e instanceof FotoDemorada) return { error: "fotoDemorada" };
    return { error: e instanceof FotoEnorme ? "fotoEnorme" : "fotoLectura" };
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Una tarea de la cola de guardado de la ficha: nunca rechaza, porque una cola rechazada dejaría de guardar y de cerrar, y
 * siempre llama a `terminar`. El mensaje es de la última foto elegida (`vigente`): si la primera falla y la segunda sale bien,
 * el error desaparece.
 */
export async function procesarFoto(tarea: {
  preparar: () => Promise<FotoPreparada | null>;
  vigente: () => boolean;
  guardar: (base64: string) => Promise<void>;
  avisar: (error: ErrorFoto | null) => void;
  terminar: () => void;
}): Promise<void> {
  try {
    const r = await tarea.preparar();
    if (!r) return;
    if ("error" in r) {
      if (tarea.vigente()) tarea.avisar(r.error);
      return;
    }
    if (tarea.vigente()) tarea.avisar(null);
    await tarea.guardar(r.base64);
  } catch {
    if (tarea.vigente()) tarea.avisar("fotoGuardado");
  } finally {
    tarea.terminar();
  }
}

/**
 * URL de la foto, servida por Rust (src-tauri/src/fotos.rs). `convertFileSrc` da la forma de cada sistema:
 * `http://foto.localhost/<id>` en Windows y `foto://localhost/<id>` en Linux y macOS. Solo para quien tiene foto.
 */
export const urlFoto = (w: Pick<Trabajador, "id" | "updated_at">): string =>
  `${convertFileSrc(w.id, "foto")}?v=${encodeURIComponent(w.updated_at)}`;
