// Release del sistema actual en release/<versión>/: zip portable (programa + portable.flag + datos/),
// instaladores y SHA256SUMS.txt. Lo usan `npm run release` (local), .github/workflows/release.yml (con
// --etiqueta, uno por sistema; el job que publica une las sumas de los tres con --sumas) y build-prueba.yml
// (con --solo-portable --perfil prueba).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { obtenerVersion, verificarEtiqueta } from "./version.mjs";

export const SUMAS = "SHA256SUMS.txt";

/** @typedef {"windows" | "linux" | "macos"} Sistema */

/** @type {Record<string, Sistema>} */
const POR_PLATAFORMA = { win32: "windows", linux: "linux", darwin: "macos" };

/**
 * Qué compila Tauri en cada sistema y con qué nombre se publica (spec §14: sin versión, para que el enlace a la
 * última versión no cambie). Los orígenes son relativos a la carpeta del perfil Cargo.
 * @param {Sistema} sistema
 * @param {string} n versión X.Y.Z con que Tauri nombra los paquetes
 */
export function artefactos(sistema, n) {
  switch (sistema) {
    case "windows":
      return {
        zip: "BoldoAtlas_windows_x64_portable.zip",
        programa: { origen: "boldo-atlas.exe", nombre: "BoldoAtlas.exe" },
        instaladores: { "BoldoAtlas_windows_x64_setup.exe": `bundle/nsis/BoldoAtlas_${n}_x64-setup.exe` },
        comprimidos: {},
        bundles: ["nsis"],
        bundlesPortable: [], // el exe no necesita empaquetarse
        objetivo: "",
      };
    case "linux": {
      const appimage = `bundle/appimage/BoldoAtlas_${n}_amd64.AppImage`;
      return {
        zip: "BoldoAtlas_linux_x64_portable.zip",
        programa: { origen: appimage, nombre: "BoldoAtlas.AppImage" },
        instaladores: {
          "BoldoAtlas_linux_x64.AppImage": appimage,
          "BoldoAtlas_linux_x64.deb": `bundle/deb/BoldoAtlas_${n}_amd64.deb`,
          "BoldoAtlas_linux_x64.rpm": `bundle/rpm/BoldoAtlas-${n}-1.x86_64.rpm`,
        },
        comprimidos: {},
        bundles: ["appimage", "deb", "rpm"],
        bundlesPortable: ["appimage"],
        objetivo: "",
      };
    }
    case "macos":
      return {
        zip: "BoldoAtlas_macos_universal_portable.zip",
        programa: { origen: "bundle/macos/BoldoAtlas.app", nombre: "BoldoAtlas.app" },
        instaladores: { "BoldoAtlas_macos_universal.dmg": `bundle/dmg/BoldoAtlas_${n}_universal.dmg` },
        // lo que descarga el actualizador de macOS: el .app en un tar.gz (instalado y portable)
        comprimidos: { "BoldoAtlas_macos_universal.app.tar.gz": "bundle/macos/BoldoAtlas.app" },
        bundles: ["app", "dmg"],
        bundlesPortable: ["app"],
        objetivo: "universal-apple-darwin", // x64 + arm64 en un solo binario
      };
    default:
      throw new Error(`Sistema no soportado: ${sistema}`);
  }
}

/**
 * Paquete que descarga el actualizador en cada objetivo de latest.json (spec §12). `windows-x86_64-portable` es
 * propio de BoldoAtlas: la portable de Windows se reemplaza a sí misma con el zip (ver src-tauri/src/actualizar.rs).
 * La portable de Linux y la de macOS usan el mismo AppImage y el mismo .app que la instalada.
 */
export const ACTUALIZABLES = {
  "windows-x86_64": "BoldoAtlas_windows_x64_setup.exe",
  "windows-x86_64-portable": "BoldoAtlas_windows_x64_portable.zip",
  "linux-x86_64": "BoldoAtlas_linux_x64.AppImage",
  "darwin-x86_64": "BoldoAtlas_macos_universal.app.tar.gz",
  "darwin-aarch64": "BoldoAtlas_macos_universal.app.tar.gz",
};

// el tar de Windows (bsdtar) crea zip con -a; el tar de Git Bash no, por eso la ruta explícita
export const TAR = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");

/**
 * En Linux y macOS, `zip -y` guarda los permisos (el AppImage sigue siendo ejecutable) y los enlaces del .app.
 * @param {string} zip @param {string} dir @param {string[]} entradas
 */
function comprimir(zip, dir, entradas) {
  if (process.platform === "win32") execFileSync(TAR, ["-a", "-c", "-f", zip, "-C", dir, ...entradas]);
  else execFileSync("zip", ["-q", "-r", "-y", zip, ...entradas], { cwd: dir });
}

/** @param {string} ruta */
const sha256 = (ruta) => createHash("sha256").update(readFileSync(ruta)).digest("hex");

/**
 * Escribe `dir/SHA256SUMS.txt` con todos los archivos de `dir` y sus subcarpetas, por nombre y sin ruta (así se
 * publican). Reemplaza las sumas parciales de cada sistema; falla si dos archivos se llaman igual o no hay ninguno.
 * @param {string} dir
 */
export function escribirSumas(dir) {
  /** @type {Map<string, string>} */
  const archivos = new Map();
  for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!f.isFile()) continue;
    const ruta = join(f.parentPath, f.name);
    if (f.name === SUMAS) rmSync(ruta);
    else if (archivos.has(f.name))
      throw new Error(`Hay dos archivos ${f.name}: ${archivos.get(f.name)} y ${ruta}`);
    else archivos.set(f.name, ruta);
  }
  if (archivos.size === 0) throw new Error(`No hay archivos que sumar en ${dir}`);
  const lineas = [...archivos]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([nombre, ruta]) => `${sha256(ruta)}  ${nombre}`);
  writeFileSync(join(dir, SUMAS), lineas.join("\n") + "\n");
}

/**
 * Arma `salida` con lo ya compilado en `dir` (la carpeta del perfil Cargo); con `soloPortable`, sin instaladores.
 * @param {{ sistema: Sistema, version: string, dir: string, salida: string, soloPortable?: boolean }} o
 */
export function empaquetar({ sistema, version, dir, salida, soloPortable = false }) {
  const a = artefactos(sistema, version);
  rmSync(salida, { recursive: true, force: true });
  const portable = join(salida, "portable");
  mkdirSync(join(portable, "datos"), { recursive: true });
  cpSync(join(dir, a.programa.origen), join(portable, a.programa.nombre), {
    recursive: true,
    verbatimSymlinks: true,
  });
  writeFileSync(join(portable, "portable.flag"), "");
  writeFileSync(join(portable, "datos", ".keep"), "");
  comprimir(resolve(salida, a.zip), portable, [a.programa.nombre, "portable.flag", "datos"]);
  rmSync(portable, { recursive: true });
  if (!soloPortable) {
    for (const [nombre, origen] of Object.entries(a.instaladores))
      cpSync(join(dir, origen), join(salida, nombre));
    for (const [nombre, origen] of Object.entries(a.comprimidos)) {
      const tar = process.platform === "win32" ? TAR : "tar";
      const args = ["-c", "-z", "-f", resolve(salida, nombre), "-C", join(dir, dirname(origen)), basename(origen)];
      // sin los ._* de los atributos extendidos de macOS: dentro del .app romperían su firma
      execFileSync(tar, args, { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    }
  }
  escribirSumas(salida);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const k = process.argv.indexOf("--sumas");
  if (k > 0) {
    // el job que publica: una sola SHA256SUMS.txt con los archivos de los tres sistemas
    escribirSumas(process.argv[k + 1] ?? "");
    process.exit(0);
  }
  const sistema = POR_PLATAFORMA[process.platform];
  if (!sistema) {
    console.error(`No hay release para ${process.platform}.`);
    process.exit(1);
  }
  const v = obtenerVersion();
  const i = process.argv.indexOf("--etiqueta");
  const error = i > 0 ? verificarEtiqueta(v.base, process.argv[i + 1] ?? "") : null;
  if (error) {
    console.error(error);
    process.exit(1);
  }
  // los instaladores solo aceptan X.Y.Z: se pasa a Tauri sin tocar archivos versionados
  const config = join("src-tauri", "target", "version-release.json");
  mkdirSync(dirname(config), { recursive: true });
  writeFileSync(config, JSON.stringify({ version: v.numerica }));
  // --solo-portable --perfil prueba: el build de prueba de los PR (sin instaladores, perfil Cargo rápido)
  const soloPortable = process.argv.includes("--solo-portable");
  const j = process.argv.indexOf("--perfil");
  const perfil = j > 0 ? (process.argv[j + 1] ?? "") : "release";
  if (!/^[a-z-]+$/.test(perfil)) {
    console.error(`Perfil Cargo no válido: ${perfil}`);
    process.exit(1);
  }
  const a = artefactos(sistema, v.numerica);
  const lista = soloPortable ? a.bundlesPortable : a.bundles;
  const bundles = lista.length ? `--bundles ${lista.join(",")}` : "--no-bundle";
  const objetivo = a.objetivo ? ` --target ${a.objetivo}` : "";
  const cargo = perfil === "release" ? "" : ` -- --profile ${perfil}`;
  // shell: npm es un .cmd en Windows; un solo texto evita la advertencia DEP0190 (la ruta no lleva espacios)
  const build = spawnSync(`npm run tauri -- build ${bundles}${objetivo} --config ${config}${cargo}`, {
    stdio: "inherit",
    shell: true,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
  empaquetar({
    sistema,
    version: v.numerica,
    dir: join("src-tauri", "target", a.objetivo, perfil),
    salida: join("release", v.base),
    soloPortable,
  });
  console.log(`\nRelease ${v.completa} (${sistema}) listo en release/${v.base}/`);
}
