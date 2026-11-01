import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ACTUALIZABLES, artefactos, empaquetar, escribirSumas, SUMAS, TAR } from "./release.mjs";

const sha256 = (ruta: string) => createHash("sha256").update(readFileSync(ruta)).digest("hex");
const SISTEMAS = ["windows", "linux", "macos"] as const;
const enWindows = process.platform === "win32";
// el zip se arma con el tar de Windows o con `zip` en Linux y macOS (ver comprimir en release.mjs)
const hayZip = enWindows || spawnSync("zip", ["-v"]).status === 0;

const listar = (zip: string) =>
  (enWindows
    ? execFileSync(TAR, ["-t", "-f", zip], { encoding: "utf8" })
    : execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .sort();

const escribir = (ruta: string, contenido: string) => {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, contenido);
};

// Imita la carpeta del perfil Cargo después de `tauri build`
function compilado(sistema: (typeof SISTEMAS)[number]) {
  const dir = mkdtempSync(join(tmpdir(), `release-${sistema}-`));
  const a = artefactos(sistema, "0.1.0");
  if (sistema === "macos") {
    escribir(join(dir, a.programa.origen, "Contents", "Info.plist"), "PLIST");
    escribir(join(dir, a.programa.origen, "Contents", "MacOS", "boldo-atlas"), "BIN");
  } else {
    escribir(join(dir, a.programa.origen), "PROGRAMA");
    chmodSync(join(dir, a.programa.origen), 0o755);
  }
  for (const [nombre, origen] of Object.entries(a.instaladores))
    if (!existsSync(join(dir, origen))) escribir(join(dir, origen), nombre);
  return { dir, a, salida: join(dir, "salida") };
}

describe("artefactos", () => {
  it("publica los nombres de la spec, sin versión", () => {
    const publicados = SISTEMAS.flatMap((s) => {
      const a = artefactos(s, "1.2.3");
      return [a.zip, ...Object.keys(a.instaladores), ...Object.keys(a.comprimidos)];
    });
    expect(publicados).toEqual([
      "BoldoAtlas_windows_x64_portable.zip",
      "BoldoAtlas_windows_x64_setup.exe",
      "BoldoAtlas_linux_x64_portable.zip",
      "BoldoAtlas_linux_x64.AppImage",
      "BoldoAtlas_linux_x64.deb",
      "BoldoAtlas_linux_x64.rpm",
      "BoldoAtlas_macos_universal_portable.zip",
      "BoldoAtlas_macos_universal.dmg",
      "BoldoAtlas_macos_universal.app.tar.gz",
    ]);
  });

  it("cada paquete del actualizador es un archivo publicado", () => {
    const publicados = new Set(
      SISTEMAS.flatMap((s) => {
        const a = artefactos(s, "1.2.3");
        return [a.zip, ...Object.keys(a.instaladores), ...Object.keys(a.comprimidos)];
      }),
    );
    for (const archivo of Object.values(ACTUALIZABLES)) expect(publicados).toContain(archivo);
  });

  it("busca los paquetes de Tauri con la versión y el binario universal en macOS", () => {
    expect(Object.values(artefactos("linux", "1.2.3").instaladores)).toEqual([
      "bundle/appimage/BoldoAtlas_1.2.3_amd64.AppImage",
      "bundle/deb/BoldoAtlas_1.2.3_amd64.deb",
      "bundle/rpm/BoldoAtlas-1.2.3-1.x86_64.rpm",
    ]);
    expect(artefactos("windows", "1.2.3").instaladores).toEqual({
      "BoldoAtlas_windows_x64_setup.exe": "bundle/nsis/BoldoAtlas_1.2.3_x64-setup.exe",
    });
    expect(artefactos("macos", "1.2.3")).toMatchObject({
      instaladores: { "BoldoAtlas_macos_universal.dmg": "bundle/dmg/BoldoAtlas_1.2.3_universal.dmg" },
      objetivo: "universal-apple-darwin",
    });
    // la portable de Linux es el mismo AppImage, con portable.flag al lado
    expect(artefactos("linux", "1.2.3").programa.origen).toBe(
      "bundle/appimage/BoldoAtlas_1.2.3_amd64.AppImage",
    );
  });
});

describe.skipIf(!hayZip)("empaquetar", () => {
  const contenidoPortable: Record<(typeof SISTEMAS)[number], string[]> = {
    windows: ["BoldoAtlas.exe", "datos/", "datos/.keep", "portable.flag"],
    linux: ["BoldoAtlas.AppImage", "datos/", "datos/.keep", "portable.flag"],
    macos: [
      "BoldoAtlas.app/",
      "BoldoAtlas.app/Contents/",
      "BoldoAtlas.app/Contents/Info.plist",
      "BoldoAtlas.app/Contents/MacOS/",
      "BoldoAtlas.app/Contents/MacOS/boldo-atlas",
      "datos/",
      "datos/.keep",
      "portable.flag",
    ],
  };

  it.each(SISTEMAS)("%s: zip portable, instaladores y sumas", (sistema) => {
    const { dir, a, salida } = compilado(sistema);

    empaquetar({ sistema, version: "0.1.0", dir, salida });

    const publicados = [a.zip, ...Object.keys(a.instaladores), ...Object.keys(a.comprimidos)].sort();
    expect(readdirSync(salida).sort()).toEqual([...publicados, SUMAS].sort());
    expect(listar(join(salida, a.zip))).toEqual(contenidoPortable[sistema]);
    expect(readFileSync(join(salida, SUMAS), "utf8")).toBe(
      publicados.map((n) => `${sha256(join(salida, n))}  ${n}\n`).join(""),
    );
  });

  it.each(SISTEMAS)("%s solo portable (build de prueba): sin instaladores", (sistema) => {
    const { dir, a, salida } = compilado(sistema);

    empaquetar({ sistema, version: "0.1.0", dir, salida, soloPortable: true });

    expect(readdirSync(salida).sort()).toEqual([a.zip, SUMAS].sort());
    expect(readFileSync(join(salida, SUMAS), "utf8")).toBe(`${sha256(join(salida, a.zip))}  ${a.zip}\n`);
  });

  it("macOS: el actualizador recibe el .app en un tar.gz", () => {
    const { dir, salida } = compilado("macos");
    empaquetar({ sistema: "macos", version: "0.1.0", dir, salida });
    const tar = enWindows ? TAR : "tar";
    const lista = execFileSync(
      tar,
      ["-t", "-z", "-f", join(salida, "BoldoAtlas_macos_universal.app.tar.gz")],
      {
        encoding: "utf8",
      },
    );
    expect(lista.split(/\r?\n/).filter(Boolean).sort()).toEqual([
      "BoldoAtlas.app/",
      "BoldoAtlas.app/Contents/",
      "BoldoAtlas.app/Contents/Info.plist",
      "BoldoAtlas.app/Contents/MacOS/",
      "BoldoAtlas.app/Contents/MacOS/boldo-atlas",
    ]);
  });

  it.skipIf(enWindows)("el AppImage sigue siendo ejecutable dentro del zip", () => {
    const { dir, a, salida } = compilado("linux");
    empaquetar({ sistema: "linux", version: "0.1.0", dir, salida, soloPortable: true });
    const linea = execFileSync("unzip", ["-Z", join(salida, a.zip)], { encoding: "utf8" })
      .split("\n")
      .find((l) => l.endsWith(" BoldoAtlas.AppImage"));
    expect(linea).toMatch(/^-rwx/);
  });
});

describe("escribirSumas", () => {
  it("une las sumas de los tres sistemas en una sola, sin rutas", () => {
    const dir = mkdtempSync(join(tmpdir(), "sumas-"));
    escribir(join(dir, "release-v1-windows", "1.0.0", "a.zip"), "A");
    escribir(join(dir, "release-v1-windows", "1.0.0", SUMAS), "parcial");
    escribir(join(dir, "release-v1-linux", "1.0.0", "c.deb"), "C");
    escribir(join(dir, "release-v1-linux", "1.0.0", SUMAS), "parcial");
    escribir(join(dir, "release-v1-macos", "1.0.0", "b.dmg"), "B");

    escribirSumas(dir);

    const sha = (t: string) => createHash("sha256").update(t).digest("hex");
    expect(readFileSync(join(dir, SUMAS), "utf8")).toBe(
      `${sha("A")}  a.zip\n${sha("B")}  b.dmg\n${sha("C")}  c.deb\n`,
    );
    expect(existsSync(join(dir, "release-v1-windows", "1.0.0", SUMAS))).toBe(false);
    expect(existsSync(join(dir, "release-v1-linux", "1.0.0", SUMAS))).toBe(false);
  });

  it("falla si dos sistemas publican un archivo con el mismo nombre", () => {
    const dir = mkdtempSync(join(tmpdir(), "sumas-"));
    escribir(join(dir, "windows", "a.zip"), "A");
    escribir(join(dir, "linux", "a.zip"), "B");
    expect(() => escribirSumas(dir)).toThrow(/dos archivos a\.zip/);
  });

  it("falla si no hay nada que publicar", () => {
    expect(() => escribirSumas(mkdtempSync(join(tmpdir(), "sumas-")))).toThrow(/No hay archivos/);
  });
});
