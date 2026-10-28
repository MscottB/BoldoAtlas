// Release de Windows en release/<versión>/: instalador NSIS, zip portable y SHA256SUMS.txt.
// Lo usan `npm run release` (local) y .github/workflows/release.yml (con --etiqueta).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { obtenerVersion, verificarEtiqueta } from "./version.mjs";

export const NOMBRES = {
  zip: "BoldoAtlas_windows_x64_portable.zip",
  setup: "BoldoAtlas_windows_x64_setup.exe",
  sumas: "SHA256SUMS.txt",
};

// el tar de Windows (bsdtar) crea zip con -a; el tar de Git Bash no, por eso la ruta explícita
export const TAR = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");

/**
 * Arma la carpeta `salida` a partir del exe y del instalador ya compilados.
 * @param {{ exe: string, instalador: string, salida: string }} rutas
 */
export function empaquetar({ exe, instalador, salida }) {
  rmSync(salida, { recursive: true, force: true });
  const portable = join(salida, "portable");
  mkdirSync(join(portable, "datos"), { recursive: true });
  cpSync(exe, join(portable, "BoldoAtlas.exe"));
  writeFileSync(join(portable, "portable.flag"), "");
  writeFileSync(join(portable, "datos", ".keep"), "");
  execFileSync(TAR, ["-a", "-c", "-f", join(salida, NOMBRES.zip), "-C", portable, "BoldoAtlas.exe", "portable.flag", "datos"]);
  rmSync(portable, { recursive: true });
  cpSync(instalador, join(salida, NOMBRES.setup));
  const lineas = [NOMBRES.zip, NOMBRES.setup].map(
    (n) => `${createHash("sha256").update(readFileSync(join(salida, n))).digest("hex")}  ${n}`,
  );
  writeFileSync(join(salida, NOMBRES.sumas), lineas.join("\n") + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const v = obtenerVersion();
  const i = process.argv.indexOf("--etiqueta");
  const error = i > 0 ? verificarEtiqueta(v.base, process.argv[i + 1] ?? "") : null;
  if (error) {
    console.error(error);
    process.exit(1);
  }
  // el instalador de Windows solo acepta X.Y.Z: se pasa a Tauri sin tocar archivos versionados
  const config = join("src-tauri", "target", "version-release.json");
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ version: v.numerica }));
  // shell: npm es un .cmd en Windows; un solo texto evita la advertencia DEP0190 (la ruta no lleva espacios)
  const build = spawnSync(`npm run tauri -- build --bundles nsis --config ${config}`, { stdio: "inherit", shell: true });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const release = join("src-tauri", "target", "release");
  empaquetar({
    exe: join(release, "boldo-atlas.exe"),
    instalador: join(release, "bundle", "nsis", `BoldoAtlas_${v.numerica}_x64-setup.exe`),
    salida: join("release", v.base),
  });
  console.log(`\nRelease ${v.completa} listo en release/${v.base}/`);
}
