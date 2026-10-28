// Versión SemVer 2.0 derivada de la etiqueta git `vX.Y.Z`, con la fecha de compilación DDMMAAAA como metadato.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * @param {string} salida p. ej. `v1.2.0-5-g3f2a1bc-dirty`
 * @returns {{ tag: string | null, distancia: number, sha: string, sucio: boolean }}
 */
export function parsearDescribe(salida) {
  const m = salida.trim().match(/^(.*)-(\d+)-g([0-9a-f]+)(-dirty)?$/);
  if (!m) return { tag: null, distancia: 0, sha: "", sucio: false };
  return { tag: m[1], distancia: Number(m[2]), sha: m[3], sucio: Boolean(m[4]) };
}

/**
 * @param {Date} fecha
 * @param {string} [zona]
 */
export function fechaDDMMAAAA(fecha, zona = "America/Santiago") {
  const partes = new Intl.DateTimeFormat("es-CL", {
    timeZone: zona,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(fecha);
  const p = (/** @type {string} */ tipo) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}${p("month")}${p("year")}`;
}

/**
 * @param {{ tag: string | null, distancia: number, sha: string, sucio: boolean, fecha: string }} v
 * @returns {{ completa: string, base: string, numerica: string }}
 */
export function formatearVersion({ tag, distancia, sha, sucio, fecha }) {
  const base = tag ? tag.replace(/^v/, "") : "0.0.0";
  const numerica = base.split(/[-+]/)[0];
  let pre = "";
  if (distancia > 0 || !tag) pre = `${base.includes("-") ? "." : "-"}dev.${distancia}`;
  const meta = [fecha];
  if (sha && (distancia > 0 || sucio)) meta.push(sha);
  if (sucio) meta.push("sucio");
  return { completa: `${base}${pre}+${meta.join(".")}`, base, numerica };
}

/** @param {string[]} args @param {string} cwd */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/**
 * Nunca lanza: sin etiquetas cae a 0.0.0-dev.N, sin git a 0.0.0-dev.0.
 * @param {string} [cwd]
 */
export function obtenerVersion(cwd = process.cwd()) {
  /** @type {{ tag: string | null, distancia: number, sha: string, sucio: boolean }} */
  let info = { tag: null, distancia: 0, sha: "", sucio: false };
  try {
    info = parsearDescribe(git(["describe", "--tags", "--long", "--match", "v*"], cwd));
  } catch {
    try {
      info = {
        tag: null,
        distancia: Number(git(["rev-list", "--count", "HEAD"], cwd)),
        sha: git(["rev-parse", "--short=7", "HEAD"], cwd),
        sucio: false,
      };
    } catch {
      // sin git (código descargado como zip)
    }
  }
  try {
    // --aplicar modifica estos dos archivos en el release: no deben marcar la versión como sucia
    info.sucio =
      git(
        [
          "status",
          "--porcelain",
          "--untracked-files=no",
          "--",
          ".",
          ":(exclude)package.json",
          ":(exclude)src-tauri/tauri.conf.json",
        ],
        cwd,
      ) !== "";
  } catch {
    info.sucio = false;
  }
  const fecha = fechaDDMMAAAA(new Date());
  return { ...formatearVersion({ ...info, fecha }), fecha, commit: info.sha };
}

/** @param {string} ruta @param {string} version */
function escribirVersion(ruta, version) {
  const json = JSON.parse(readFileSync(ruta, "utf8"));
  json.version = version;
  writeFileSync(ruta, JSON.stringify(json, null, 2) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = obtenerVersion();
  if (process.argv.includes("--aplicar")) {
    escribirVersion("package.json", v.numerica);
    escribirVersion("src-tauri/tauri.conf.json", v.numerica);
  }
  console.log(JSON.stringify(v, null, 2));
}
