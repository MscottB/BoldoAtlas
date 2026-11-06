import { withBase } from "vitepress";
import { imgAyuda } from "./imagenesAyuda";
import type { Imagen, Lang } from "./tipos";

// Los enlaces internos llevan la base del sitio (/BoldoAtlas/); los externos van tal cual.
export const enlace = (href: string) => (href.startsWith("http") ? href : withBase(href));

// Las capturas del sitio (docs/capturas/sitio → public/capturas) o, con `ayuda`, las del manual.
export const fuenteImagen = (lang: Lang, imagen: Imagen, tema: "claro" | "oscuro") => {
  if (imagen.ayuda) return imgAyuda(lang, imagen.nombre);
  return withBase(`/capturas/${imagen.temas ? `${imagen.nombre}-${lang}-${tema}` : imagen.nombre}.webp`);
};
