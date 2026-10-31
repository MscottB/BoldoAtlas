// Release de Windows en release/<versión>/: instalador NSIS, zip portable y SHA256SUMS.txt.
// Lo usan `npm run release` (local), .github/workflows/release.yml (con --etiqueta) y
// build-prueba.yml (con --solo-portable --perfil prueba).
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
 * Arma la carpeta `salida` a partir del exe y del instalador ya compilados (sin instalador: solo portable).
 * @param {{ exe: string, instalador?: string, salida: string }} rutas
 */
export function empaquetar({ exe, instalador, salida }) {
  rmSync(salida, { recursive: true, force: true });
  const portable = join(salida, "portable");
  mkdirSync(join(portable, "datos"), { recursive: true });
  cpSync(exe, join(portable, "BoldoAtlas.exe"));
  writeFileSync(join(portable, "portable.flag"), "");
  writeFileSync(join(portable, "datos", ".keep"), "");
  execFileSync(TAR, [
    "-a",
    "-c",
    "-f",
    join(salida, NOMBRES.zip),
    "-C",
    portable,
    "BoldoAtlas.exe",
    "portable.flag",
    "datos",
  ]);
  rmSync(portable, { recursive: true });
  if (instalador) cpSync(instalador, join(salida, NOMBRES.setup));
  const lineas = (instalador ? [NOMBRES.zip, NOMBRES.setup] : [NOMBRES.zip]).map(
    (n) =>
      `${createHash("sha256")
        .update(readFileSync(join(salida, n)))
        .digest("hex")}  ${n}`,
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
  // --solo-portable --perfil prueba: el build de prueba de los PR (sin instalador, perfil Cargo rápido)
  const soloPortable = process.argv.includes("--solo-portable");
  const j = process.argv.indexOf("--perfil");
  const perfil = j > 0 ? (process.argv[j + 1] ?? "") : "release";
  if (!/^[a-z-]+$/.test(perfil)) {
    console.error(`Perfil Cargo no válido: ${perfil}`);
    process.exit(1);
  }
  const bundles = soloPortable ? "--no-bundle" : "--bundles nsis";
  const cargo = perfil === "release" ? "" : ` -- --profile ${perfil}`;
  // shell: npm es un .cmd en Windows; un solo texto evita la advertencia DEP0190 (la ruta no lleva espacios)
  const build = spawnSync(`npm run tauri -- build ${bundles} --config ${config}${cargo}`, {
    stdio: "inherit",
    shell: true,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  const destino = join("src-tauri", "target", perfil);
  empaquetar({
    exe: join(destino, "boldo-atlas.exe"),
    instalador: soloPortable
      ? undefined
      : join(destino, "bundle", "nsis", `BoldoAtlas_${v.numerica}_x64-setup.exe`),
    salida: join("release", v.base),
  });
  console.log(`\nRelease ${v.completa} listo en release/${v.base}/`);
}
