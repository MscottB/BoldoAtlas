import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { empaquetar, NOMBRES, TAR } from "./release.mjs";

const sha256 = (ruta: string) => createHash("sha256").update(readFileSync(ruta)).digest("hex");

// El release es solo para Windows: usa el tar.exe del sistema para crear el zip.
describe.skipIf(process.platform !== "win32")("empaquetar", () => {
  it("arma el zip portable, copia el instalador y calcula las sumas", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-"));
    const exe = join(dir, "boldo-atlas.exe");
    const instalador = join(dir, "BoldoAtlas_0.1.0_x64-setup.exe");
    writeFileSync(exe, "EXE");
    writeFileSync(instalador, "SETUP");
    const salida = join(dir, "salida");

    empaquetar({ exe, instalador, salida });

    expect(readdirSync(salida).sort()).toEqual([NOMBRES.zip, NOMBRES.setup, NOMBRES.sumas].sort());
    const contenido = execFileSync(TAR, ["-t", "-f", join(salida, NOMBRES.zip)], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean)
      .sort();
    expect(contenido).toEqual(["BoldoAtlas.exe", "datos/", "datos/.keep", "portable.flag"]);
    expect(readFileSync(join(salida, NOMBRES.sumas), "utf8")).toBe(
      `${sha256(join(salida, NOMBRES.zip))}  ${NOMBRES.zip}\n${sha256(join(salida, NOMBRES.setup))}  ${NOMBRES.setup}\n`,
    );
  });
});
