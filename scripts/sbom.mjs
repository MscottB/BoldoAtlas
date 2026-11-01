// Listas de componentes (SBOM) de cada publicación, en CycloneDX JSON, para npm y Cargo. Las arma un job aparte de
// release.yml, sin secretos. Viajan como un artefacto más: el job que publica las suma y las adjunta, y como no están en
// ACTUALIZABLES, la app nunca las ofrece. Si algo falla, no se publica: la versión saldría sin su lista.
// npm: todo el archivo de bloqueo; `scope` dice qué va en la app («required») y qué es herramienta («optional»).
// Requiere cargo-cyclonedx. Uso: node scripts/sbom.mjs <carpeta> <etiqueta>
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SBOM_NPM = "BoldoAtlas_sbom_npm.cdx.json";
export const SBOM_CARGO = "BoldoAtlas_sbom_cargo.cdx.json";

/**
 * Comprueba una lista y le pone la versión publicada: package.json y Cargo.toml no la llevan (scripts/version.mjs).
 * @param {string} texto
 * @param {string} version
 */
export function sbomDeVersion(texto, version) {
  const bom = JSON.parse(texto);
  if (bom.bomFormat !== "CycloneDX" || !bom.components?.length || !bom.metadata?.component)
    throw new Error("La lista de componentes no es CycloneDX o viene vacía.");
  bom.metadata.component.version = version;
  return JSON.stringify(bom, null, 2) + "\n";
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, etiqueta] = process.argv.slice(2);
  if (!dir || !etiqueta) throw new Error("Uso: node scripts/sbom.mjs <carpeta> <etiqueta>");
  const version = etiqueta.replace(/^v/, "");
  mkdirSync(dir, { recursive: true });
  const shell = process.platform === "win32"; // npm es un .cmd en Windows
  const npm = execFileSync(
    "npm",
    ["sbom", "--package-lock-only", "--sbom-format=cyclonedx", "--sbom-type=application"],
    { encoding: "utf8", shell, maxBuffer: 256 * 1024 * 1024 },
  );
  writeFileSync(join(dir, SBOM_NPM), sbomDeVersion(npm, version));
  const manifiesto = join("src-tauri", "Cargo.toml");
  // todos los objetivos: Windows, Linux y macOS comparten esta lista. cargo-cyclonedx la escribe junto al manifiesto
  execFileSync(
    "cargo",
    [
      "cyclonedx",
      "--manifest-path",
      manifiesto,
      "--format",
      "json",
      "--spec-version",
      "1.5",
      "--target",
      "all",
      "--override-filename",
      SBOM_CARGO.replace(/\.json$/, ""),
    ],
    { stdio: "inherit" },
  );
  renameSync(join("src-tauri", SBOM_CARGO), join(dir, SBOM_CARGO));
  writeFileSync(join(dir, SBOM_CARGO), sbomDeVersion(readFileSync(join(dir, SBOM_CARGO), "utf8"), version));
  console.log(`Listas de componentes de ${version} en ${dir}/.`);
}
