// Las capturas de la ayuda, que scripts/sync.mjs copia a img/ y en/img/.
const es = import.meta.glob("../../img/es/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const en = import.meta.glob("../../en/img/en/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

export const imgAyuda = (lang: "es" | "en", nombre: string) =>
  lang === "es" ? es[`../../img/es/${nombre}.webp`] : en[`../../en/img/en/${nombre}.webp`];
