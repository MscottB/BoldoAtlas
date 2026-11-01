// latest.json: el manifiesto firmado del actualizador (spec §12 y §14). Lo arma el job que publica, con los
// archivos de los tres sistemas ya descargados: firma cada paquete del actualizador con `tauri signer sign`
// (la clave privada llega solo como secreto, en TAURI_SIGNING_PRIVATE_KEY), comprueba cada firma contra la
// clave pública de tauri.conf.json y escribe latest.json. Cualquier falla detiene el release: nunca se
// publica un manifiesto sin firmas o con una firma que la app rechazaría.
// Uso: node scripts/manifiesto.mjs <carpeta> <etiqueta>
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "./novedades.mjs";
import { ACTUALIZABLES } from "./release.mjs";

export const MANIFIESTO = "latest.json";

/** @param {string} b64 texto base64 de un archivo de minisign; devuelve sus líneas */
const lineas = (b64) => Buffer.from(b64.trim(), "base64").toString("utf8").replace(/\r\n/g, "\n").split("\n");

/**
 * Comprueba una firma de `tauri signer sign` (minisign en base64) como lo hace tauri-plugin-updater: firma
 * Ed25519 del archivo (o de su BLAKE2b-512 si es prehash, «ED»), firma global sobre el comentario de confianza,
 * la misma clave que la pública y, con `requireSignedVersion`, la versión firmada igual a la anunciada.
 * @param {Buffer} datos
 * @param {string} firma contenido del .sig
 * @param {string} clavePublica `plugins.updater.pubkey` de tauri.conf.json
 * @param {string} version versión que anuncia latest.json
 * @returns {string | null} el problema, o null si la firma vale
 */
export function verificarFirma(datos, firma, clavePublica, version) {
  try {
    const pub = Buffer.from(lineas(clavePublica)[1] ?? "", "base64"); // "Ed" + id (8) + clave (32)
    const [, firmaB64 = "", comentario = "", globalB64 = ""] = lineas(firma);
    const sig = Buffer.from(firmaB64, "base64"); // "Ed"|"ED" + id (8) + firma (64)
    const confianza = comentario.replace(/^trusted comment: /, "");
    if (pub.length !== 42 || sig.length !== 74) return "Firma o clave pública con formato inválido.";
    if (!sig.subarray(2, 10).equals(pub.subarray(2, 10)))
      return "La firma es de otra clave: no coincide con la clave pública de tauri.conf.json.";
    const clave = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: pub.subarray(10).toString("base64url") },
      format: "jwk",
    });
    const alg = sig.subarray(0, 2).toString();
    const mensaje = alg === "ED" ? createHash("blake2b512").update(datos).digest() : datos;
    if (!verify(null, mensaje, clave, sig.subarray(10))) return "La firma no corresponde al archivo.";
    const global = Buffer.from(globalB64, "base64");
    if (!verify(null, Buffer.concat([sig.subarray(10), Buffer.from(confianza)]), clave, global))
      return "El comentario de confianza de la firma no es válido.";
    const firmada = confianza
      .split("\t")
      .find((c) => c.startsWith("version:"))
      ?.slice("version:".length);
    if (firmada?.replace(/^v/, "") !== version.replace(/^v/, ""))
      return `La firma es de la versión ${firmada ?? "(ninguna)"}, no de ${version}.`;
    return null;
  } catch (e) {
    return `Firma ilegible: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * @param {{ version: string, notas: string, fecha: string, base: string, firmas: Record<string, string> }} o
 *   `firmas`: contenido del .sig por nombre de archivo publicado; `base`: URL de descarga del release.
 */
export function manifiesto({ version, notas, fecha, base, firmas }) {
  /** @type {Record<string, { signature: string, url: string }>} */
  const platforms = {};
  for (const [objetivo, archivo] of Object.entries(ACTUALIZABLES)) {
    const firma = firmas[archivo];
    if (!firma) throw new Error(`Falta la firma de ${archivo} (${objetivo}).`);
    platforms[objetivo] = { signature: firma.trim(), url: `${base}/${archivo}` };
  }
  return { version: version.replace(/^v/, ""), notes: notas, pub_date: fecha, platforms };
}

/** Ruta de cada archivo de `dir` (y subcarpetas) por nombre. @param {string} dir */
function porNombre(dir) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const f of readdirSync(dir, { recursive: true, withFileTypes: true }))
    if (f.isFile()) m.set(f.name, join(f.parentPath, f.name));
  return m;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, etiqueta] = process.argv.slice(2);
  const fallar = (/** @type {string} */ m) => {
    console.error(`::error::${m}`);
    process.exit(1);
  };
  if (!dir || !etiqueta) fallar("Uso: node scripts/manifiesto.mjs <carpeta> <etiqueta>");
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY)
    fallar("Falta el secreto TAURI_SIGNING_PRIVATE_KEY: no se publica un release sin latest.json firmado.");
  const version = etiqueta.replace(/^v/, "");
  const clavePublica = JSON.parse(readFileSync(join("src-tauri", "tauri.conf.json"), "utf8")).plugins.updater.pubkey;
  const archivos = porNombre(dir);
  /** @type {Record<string, string>} */
  const firmas = {};
  for (const archivo of new Set(Object.values(ACTUALIZABLES))) {
    const ruta = archivos.get(archivo);
    if (!ruta) fallar(`No está ${archivo} entre los archivos del release.`);
    // stdin cerrado: si la clave pidiera una contraseña que no llegó, falla en vez de quedarse esperando.
    // --no: solo la CLI de node_modules; npx nunca baja de internet un paquete «tauri» junto a la clave
    const r = spawnSync("npx", ["--no", "tauri", "signer", "sign", "--app-version", version, ruta], {
      stdio: ["ignore", "inherit", "inherit"],
      shell: process.platform === "win32",
    });
    const sig = `${ruta}.sig`;
    if (r.status !== 0 || !existsSync(sig)) fallar(`No se pudo firmar ${archivo}.`);
    firmas[archivo] = readFileSync(sig, "utf8");
    rmSync(sig); // la firma va dentro de latest.json; el .sig no se publica
    const problema = verificarFirma(readFileSync(ruta), firmas[archivo], clavePublica, version);
    if (problema) fallar(`${archivo}: ${problema}`);
    console.log(`Firmado y verificado: ${archivo}`);
  }
  const rutaNovedades = archivos.get("novedades.json");
  if (!rutaNovedades) fallar("No está novedades.json entre los archivos del release.");
  /** @type {{ versiones: { version: string, notas: string }[] }} */
  const nov = JSON.parse(readFileSync(rutaNovedades, "utf8"));
  const notas = nov.versiones.find((v) => v.version === version)?.notas ?? "";
  const datos = manifiesto({
    version,
    notas,
    fecha: new Date().toISOString(),
    base: `https://github.com/${process.env.GITHUB_REPOSITORY || REPO}/releases/download/${etiqueta}`,
    firmas,
  });
  writeFileSync(join(dir, MANIFIESTO), JSON.stringify(datos, null, 2) + "\n");
  console.log(`${MANIFIESTO} con ${Object.keys(datos.platforms).length} objetivos para ${version}.`);
}
