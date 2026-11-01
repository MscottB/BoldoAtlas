// novedades.json: las notas de cada versión publicada, de la más nueva a la más antigua (spec §12 y §14).
// Sale de las notas de los releases de GitHub (las mismas que publica publicar.yml desde los PR) más las del
// release que se está compilando. Va dentro de la app (diálogo «Novedades», sin conexión) y como archivo
// del release (la ventana de actualización muestra las de las versiones que el usuario se saltó).
// Uso: node scripts/novedades.mjs --etiqueta vX.Y.Z [--releases archivo.json] --salida novedades.json
//      (notas del release actual en $NOTAS; sin --releases las pide a la API pública de GitHub)
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compararSemver, parsearSemver } from "./publicacion.mjs";

export const REPO = "MscottB/BoldoAtlas";

/**
 * Lo que va en la app: hasta el primer título `##` o separador `---`, que en los releases son material de la
 * página (descargas, resumen en inglés), no novedades. Sin comentarios HTML.
 * @param {string | null | undefined} cuerpo
 */
export function limpiarNotas(cuerpo) {
  const lineas = (cuerpo ?? "").replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const fin = lineas.findIndex((l) => /^(##\s|---\s*$)/.test(l));
  return (fin < 0 ? lineas : lineas.slice(0, fin)).join("\n").trim();
}

/**
 * AAAA-MM-DD en America/Santiago, la zona de la fecha de compilación (scripts/version.mjs).
 * @param {Date} fecha
 */
export const fechaSantiago = (fecha) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(fecha);

/** @typedef {{ tag_name: string, body?: string | null, published_at?: string | null, draft?: boolean }} ReleaseGh */
/** @typedef {{ version: string, fecha: string, notas: string }} Novedad */

/**
 * Una entrada por versión publicada (sin borradores ni etiquetas que no son SemVer), de la más nueva a la más
 * antigua. `actual` (el release que se compila) reemplaza a su versión si ya estaba y deja fuera las
 * posteriores: un build de una versión vieja no trae novedades que aún no existían.
 * @param {ReleaseGh[]} releases
 * @param {{ version: string, fecha: string, notas: string } | null} [actual]
 * @returns {{ versiones: Novedad[] }}
 */
export function novedades(releases, actual = null) {
  const tope = actual ? parsearSemver(actual.version) : null;
  /** @type {Map<string, Novedad>} */
  const porVersion = new Map();
  for (const r of releases) {
    const v = parsearSemver(r.tag_name ?? "");
    if (r.draft || !v || (tope && compararSemver(v, tope) >= 0)) continue;
    const version = r.tag_name.replace(/^v/, "");
    const fecha = r.published_at ? fechaSantiago(new Date(r.published_at)) : "";
    porVersion.set(version, { version, fecha, notas: limpiarNotas(r.body) });
  }
  if (actual) {
    const version = actual.version.replace(/^v/, "");
    porVersion.set(version, { version, fecha: actual.fecha, notas: limpiarNotas(actual.notas) });
  }
  const versiones = [...porVersion.values()].sort(
    (a, b) => compararSemver(/** @type {any} */ (parsearSemver(b.version)), /** @type {any} */ (parsearSemver(a.version))),
  );
  return { versiones };
}

/**
 * Todos los releases del repositorio (la API los entrega de a 100). Con `GH_TOKEN`, autenticado.
 * @param {string} repo
 * @returns {Promise<ReleaseGh[]>}
 */
async function releasesDeGitHub(repo) {
  /** @type {Record<string, string>} */
  const cabeceras = { Accept: "application/vnd.github+json", "User-Agent": "BoldoAtlas-release" };
  if (process.env.GH_TOKEN) cabeceras.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  /** @type {ReleaseGh[]} */
  const todos = [];
  for (let pagina = 1; ; pagina++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${pagina}`, {
      headers: cabeceras,
    });
    if (!res.ok) throw new Error(`La API de GitHub respondió ${res.status} al pedir los releases.`);
    const lote = /** @type {ReleaseGh[]} */ (await res.json());
    todos.push(...lote);
    if (lote.length < 100) return todos;
  }
}

/** @param {string} nombre */
const argumento = (nombre) => {
  const i = process.argv.indexOf(nombre);
  return i > 0 ? process.argv[i + 1] : undefined;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const etiqueta = argumento("--etiqueta");
  const salida = argumento("--salida");
  const archivo = argumento("--releases");
  if (!etiqueta || !parsearSemver(etiqueta) || !salida) {
    console.error("Uso: node scripts/novedades.mjs --etiqueta vX.Y.Z [--releases archivo.json] --salida archivo");
    process.exit(1);
  }
  const releases = archivo
    ? JSON.parse(readFileSync(archivo, "utf8"))
    : await releasesDeGitHub(process.env.GITHUB_REPOSITORY || REPO);
  const actual = { version: etiqueta, fecha: fechaSantiago(new Date()), notas: process.env.NOTAS ?? "" };
  const datos = novedades(releases, actual);
  writeFileSync(salida, JSON.stringify(datos, null, 2) + "\n");
  console.log(`novedades.json con ${datos.versiones.length} versiones (la más nueva: ${datos.versiones[0]?.version}).`);
}
