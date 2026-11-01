// Copia al sitio lo que vive en otro lugar del repo, para no duplicarlo en git:
//  - ayuda/<es|en>/*.md (el manual que también lee la app) → manual/ y en/manual/
//  - capturas de docs/capturas/sitio → public/capturas/
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sitio = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(sitio, "..");

// El selector de idioma lleva a la misma página: si falta una en un idioma, sería un 404.
const lista = (i) => readdirSync(join(repo, "ayuda", i)).filter((f) => f.endsWith(".md")).sort().join();
if (lista("es") !== lista("en")) throw new Error("ayuda/es y ayuda/en no tienen las mismas páginas");

const manual = { es: "manual", en: "en/manual" };
for (const [idioma, destino] of Object.entries(manual)) {
  const origen = join(repo, "ayuda", idioma);
  if (!existsSync(origen) || readdirSync(origen).length === 0) throw new Error(`falta ${origen}`);
  rmSync(join(sitio, destino), { recursive: true, force: true });
  cpSync(origen, join(sitio, destino), { recursive: true });
}

// capturas de la portada (WebP ya recortadas y comprimidas) → public/capturas/
const origenCapturas = join(repo, "docs", "capturas", "sitio");
const dest = join(sitio, "public", "capturas");
rmSync(dest, { recursive: true, force: true });
if (!existsSync(origenCapturas) || !readdirSync(origenCapturas).some((f) => f.endsWith(".webp")))
  throw new Error(`faltan las capturas en ${origenCapturas}`);
cpSync(origenCapturas, dest, { recursive: true });
