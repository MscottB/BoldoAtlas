// Copia al sitio lo que vive en otro lugar del repo, para no duplicarlo en git:
//  - ayuda/<es|en>/*.md (el manual que también lee la app) → manual/ y en/manual/
//  - capturas de docs/capturas/fase2 → public/capturas/ (con nombre corto)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sitio = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(sitio, "..");

const manual = { es: "manual", en: "en/manual" };
for (const [idioma, destino] of Object.entries(manual)) {
  const origen = join(repo, "ayuda", idioma);
  if (!existsSync(origen) || readdirSync(origen).length === 0) throw new Error(`falta ${origen}`);
  rmSync(join(sitio, destino), { recursive: true, force: true });
  cpSync(origen, join(sitio, destino), { recursive: true });
}

// nombre en el sitio → archivo en docs/capturas/fase2
const capturas = {
  "arbol-claro.png": "18c-despues-claro.png",
  "arbol-oscuro.png": "18c-despues-oscuro.png",
  "tarjeta.png": "18c-tarjeta-claro.png",
  "calendario.png": "18e-calendario-claro.png",
  "directorio.png": "17j-despues-directorio-claro.png",
  "idioma-es.png": "18b-menu-es.png",
  "idioma-en.png": "18b-menu-en.png",
};
const dest = join(sitio, "public", "capturas");
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const [nombre, archivo] of Object.entries(capturas)) {
  const origen = join(repo, "docs", "capturas", "fase2", archivo);
  if (!existsSync(origen)) throw new Error(`falta la captura ${origen}`);
  cpSync(origen, join(dest, nombre));
}
