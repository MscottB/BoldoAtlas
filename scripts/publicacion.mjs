// Cada PR fusionado a main es una versión: calcula la siguiente etiqueta y las notas del release.
// Lo usan .github/workflows/version-pr.yml, build-prueba.yml y publicar.yml.
// Uso: node scripts/publicacion.mjs <evento.json>   (PR de un evento pull_request)
//      node scripts/publicacion.mjs --publicar [N]  (al fusionar: los PR desde la última etiqueta)
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Etiquetas del PR que cambian el salto, de menor a mayor. */
export const SALTOS = ["version:parche", "version:menor", "version:mayor"];

/**
 * @param {string} texto p. ej. `v0.1.0-alpha.2`
 * @returns {{ nums: number[], pre: string[] } | null}
 */
export function parsearSemver(texto) {
  const m = texto.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] } : null;
}

/**
 * Orden SemVer 2.0 (la metadata `+...` no cuenta).
 * @param {{ nums: number[], pre: string[] }} a
 * @param {{ nums: number[], pre: string[] }} b
 */
export function compararSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] - b.nums[i];
  // sin pre-release va después que con pre-release
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) return Number(x) - Number(y);
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Siguiente versión a partir de las etiquetas existentes. Sin etiqueta de salto en el PR se avanza la
 * pre-release (`0.1.0-alpha.3` → `0.1.0-alpha.4`); con `version:*` sale una X.Y.Z limpia
 * (desde una pre-release, como `npm version`: `0.1.0-alpha.3` + parche o menor → `0.1.0`).
 * @param {string[]} etiquetas etiquetas git, p. ej. `["v0.1.0-alpha.1"]`
 * @param {string[]} [etiquetasPr] nombres de las etiquetas (labels) del PR
 * @returns {string} sin `v`
 */
export function siguienteVersion(etiquetas, etiquetasPr = []) {
  const ultima = etiquetas
    .map(parsearSemver)
    .filter((v) => v !== null)
    .sort(compararSemver)
    .at(-1);
  const salto = Math.max(-1, ...etiquetasPr.map((e) => SALTOS.indexOf(e)));
  if (!ultima && salto < 0) return "0.1.0-alpha.1";
  const { nums, pre } = ultima ?? { nums: [0, 0, 0], pre: [] };
  const [M, m, p] = nums;
  const esPre = pre.length > 0;
  if (salto === 2) return esPre && m === 0 && p === 0 ? `${M}.0.0` : `${M + 1}.0.0`;
  if (salto === 1) return esPre && p === 0 ? `${M}.${m}.0` : `${M}.${m + 1}.0`;
  if (salto === 0 || !esPre) return esPre ? `${M}.${m}.${p}` : `${M}.${m}.${p + 1}`;
  const fin = pre.at(-1) ?? "";
  const siguiente = /^\d+$/.test(fin) ? [...pre.slice(0, -1), Number(fin) + 1] : [...pre, 1];
  return `${M}.${m}.${p}-${siguiente.join(".")}`;
}

/**
 * Sección «## Notas de la versión» (o `###`, con o sin `:`) del cuerpo del PR, hasta el siguiente título
 * de su nivel o mayor fuera de bloques de código, sin comentarios HTML de la plantilla. "" si falta.
 * @param {string | null | undefined} cuerpo
 */
export function seccionNotas(cuerpo) {
  const lineas = (cuerpo ?? "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n");
  const i = lineas.findIndex((l) => /^#{2,3}\s+notas de la versi[oó]n\s*:?\s*$/i.test(l.trim()));
  if (i < 0) return "";
  const nivel = (lineas[i].trim().match(/^#+/) ?? [""])[0].length;
  const fin = new RegExp(`^#{1,${nivel}}\\s`);
  let enCodigo = false;
  const notas = [];
  for (const l of lineas.slice(i + 1)) {
    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo;
    else if (!enCodigo && fin.test(l)) break;
    notas.push(l);
  }
  return notas.join("\n").trim();
}

/**
 * Notas de un PR: su sección «Notas de la versión» o, si falta o queda vacía, el título.
 * @param {string | null | undefined} cuerpo
 * @param {string | null | undefined} titulo
 */
export function notasDeVersion(cuerpo, titulo) {
  return seccionNotas(cuerpo) || (titulo ?? "").trim();
}

/** @typedef {{ number: number, title?: string, body?: string | null, labels?: { name: string }[] }} PR */

/**
 * Notas de un release con todos los PR fusionados desde la última etiqueta (del más antiguo al más
 * nuevo): con uno, sus notas tal cual; con varios, un `###` por PR con su título y número.
 * @param {PR[]} prs
 */
export function notasCombinadas(prs) {
  if (prs.length === 1) return notasDeVersion(prs[0].body, prs[0].title);
  return prs
    .map((p) => `### ${(p.title ?? "").trim()} (#${p.number})\n\n${seccionNotas(p.body)}`.trim())
    .join("\n\n");
}

/**
 * Número de PR en el asunto de un commit de merge: `Merge pull request #N from …` (GitHub) o
 * `Título (#N)` (el asunto que usa el autor al fusionar).
 * @param {string} asunto
 * @returns {number | null}
 */
export function prDeAsunto(asunto) {
  const m = asunto.trim().match(/^Merge pull request #(\d+)\b/) ?? asunto.trim().match(/\(#(\d+)\)$/);
  return m ? Number(m[1]) : null;
}

/**
 * PR a publicar: los de los asuntos de `git log --first-parent --merges` (del más nuevo al más antiguo)
 * más el del commit empujado, sin repetir y del más antiguo al más nuevo.
 * @param {string[]} asuntos
 * @param {number | null} gatillo
 */
export function numerosDePrs(asuntos, gatillo) {
  const numeros = asuntos.map(prDeAsunto).filter((n) => n !== null);
  numeros.reverse();
  if (gatillo !== null) numeros.push(gatillo);
  return [...new Set(numeros)];
}

/**
 * El PR de un archivo de evento: el evento `pull_request` completo o un PR suelto. Otro evento
 * (push, workflow_dispatch) o un archivo vacío no es un PR.
 * @param {any} datos
 * @returns {PR | null}
 */
export function prDelEvento(datos) {
  return datos?.pull_request ?? (datos?.number ? datos : null);
}

/**
 * Formato de $GITHUB_OUTPUT; los valores de varias líneas van con delimitador.
 * @param {Record<string, string>} valores
 * @param {string} [delimitador]
 */
export function salidaGithub(valores, delimitador = `FIN_${randomUUID()}`) {
  return Object.entries(valores)
    .map(([k, v]) => (v.includes("\n") ? `${k}<<${delimitador}\n${v}\n${delimitador}\n` : `${k}=${v}\n`))
    .join("");
}

/**
 * @param {PR[]} prs del más antiguo al más nuevo; el último es el que dispara (su número va en la
 *   versión de prueba). Los labels de salto de todos cuentan.
 * @param {string[]} etiquetas
 * @returns {Record<string, string>}
 */
export function publicacion(prs, etiquetas) {
  const ultimo = prs.at(-1);
  if (!ultimo) return { publicar: "false" };
  const version = siguienteVersion(
    etiquetas,
    prs.flatMap((p) => (p.labels ?? []).map((l) => l.name)),
  );
  return {
    publicar: "true",
    pr: prs.map((p) => `#${p.number}`).join(" "),
    version,
    etiqueta: `v${version}`,
    prerelease: String(version.includes("-")),
    version_prueba: `${version}+pr${ultimo.number}`,
    notas: notasCombinadas(prs),
  };
}

/** @param {string[]} args */
function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * @param {string} ruta ruta de la API con {owner}/{repo}, que gh completa con el remoto
 * @param {...string} args
 */
function gh(ruta, ...args) {
  return execFileSync("gh", ["api", ruta, ...args], { encoding: "utf8" }).trim();
}

/**
 * PR fusionados desde la última etiqueta hasta el commit empujado (publicar.yml). Lanza si un asunto
 * dice que es un merge de PR pero el PR no se puede leer: mejor un fallo visible que no publicar.
 * @param {number | null} forzado PR del ensayo manual
 * @returns {PR[]}
 */
function prsAPublicar(forzado) {
  const sha = process.env.GITHUB_SHA || git("rev-parse", "HEAD");
  const publicada = git("tag", "--contains", sha, "--list", "v*");
  if (publicada) {
    console.log(`::notice::${sha} ya está publicado en ${publicada.split(/\s+/).join(", ")}: no se publica.`);
    return [];
  }
  let desde = "";
  try {
    desde = git("describe", "--tags", "--abbrev=0", "--match", "v*", sha);
  } catch {
    // sin etiquetas: toda la historia
  }
  const asuntos = git("log", "--first-parent", "--merges", "--format=%s", desde ? `${desde}..${sha}` : sha)
    .split(/\r?\n/)
    .filter(Boolean);
  const gatillo =
    forzado ??
    prDeAsunto(git("log", "-1", "--format=%s", sha)) ??
    (Number(
      gh(
        `repos/{owner}/{repo}/commits/${sha}/pulls`,
        "--jq",
        `[.[] | select(.merge_commit_sha == "${sha}")][0].number // empty`,
      ),
    ) ||
      null);
  if (gatillo === null) return [];
  return numerosDePrs(asuntos, gatillo).map((n) => JSON.parse(gh(`repos/{owner}/{repo}/pulls/${n}`)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let prs;
  if (args[0] === "--publicar") {
    // node scripts/publicacion.mjs --publicar [N]: release al fusionar (N: ensayo con ese PR)
    prs = prsAPublicar(args[1] ? Number(args[1]) : null);
  } else {
    // node scripts/publicacion.mjs <evento.json>: el PR del evento pull_request
    const texto = args[0] ? readFileSync(args[0], "utf8").trim() : "";
    const pr = prDelEvento(texto && texto !== "null" ? JSON.parse(texto) : null);
    prs = pr ? [pr] : [];
  }
  for (const p of prs)
    if (!seccionNotas(p.body))
      console.log(`::notice::El PR #${p.number} no tiene «## Notas de la versión»: se usa su título.`);
  const etiquetas = git("tag", "-l", "v*").split(/\r?\n/).filter(Boolean);
  const valores = publicacion(prs, etiquetas);
  console.log(JSON.stringify(valores, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, salidaGithub(valores));
}
