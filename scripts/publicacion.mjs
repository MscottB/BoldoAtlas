// Cada PR fusionado a main es una versión: calcula la siguiente etiqueta y las notas del release.
// Lo usan .github/workflows/version-pr.yml, build-prueba.yml y publicar.yml.
// Uso: node scripts/publicacion.mjs [pr.json]  (el PR de la API de GitHub, o el evento pull_request)
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
 * Sección «## Notas de la versión» del cuerpo del PR (hasta el siguiente `#`/`##`), sin comentarios
 * HTML de la plantilla. Si falta o queda vacía, el título del PR.
 * @param {string | null | undefined} cuerpo
 * @param {string | null | undefined} titulo
 */
export function notasDeVersion(cuerpo, titulo) {
  const lineas = (cuerpo ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n");
  const i = lineas.findIndex((l) => /^##\s+notas de la versi[oó]n\s*$/i.test(l.trim()));
  let notas = "";
  if (i >= 0) {
    const fin = lineas.findIndex((l, j) => j > i && /^#{1,2}\s/.test(l));
    notas = lineas
      .slice(i + 1, fin < 0 ? undefined : fin)
      .join("\n")
      .trim();
  }
  return notas || (titulo ?? "").trim();
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
 * @param {{ number: number, title?: string, body?: string | null, labels?: { name: string }[] } | null} pr
 * @param {string[]} etiquetas
 * @returns {Record<string, string>}
 */
export function publicacion(pr, etiquetas) {
  if (!pr) return { publicar: "false" };
  const version = siguienteVersion(
    etiquetas,
    (pr.labels ?? []).map((l) => l.name),
  );
  return {
    publicar: "true",
    pr: String(pr.number),
    version,
    etiqueta: `v${version}`,
    prerelease: String(version.includes("-")),
    version_prueba: `${version}+pr${pr.number}`,
    notas: notasDeVersion(pr.body, pr.title),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const archivo = process.argv[2];
  const texto = archivo ? readFileSync(archivo, "utf8").trim() : "";
  const datos = texto && texto !== "null" ? JSON.parse(texto) : null;
  const etiquetas = execFileSync("git", ["tag", "-l", "v*"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  // acepta el evento pull_request completo o solo el PR; otro evento (push, workflow_dispatch) no es un PR
  const valores = publicacion(datos?.pull_request ?? (datos?.number ? datos : null), etiquetas);
  console.log(JSON.stringify(valores, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, salidaGithub(valores));
}
