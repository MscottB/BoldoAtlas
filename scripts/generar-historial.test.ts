import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SCRIPT = new URL("./generar-historial.mjs", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const generar = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

describe("generar-historial", () => {
  it("sin opciones repite la migración del historial tal cual", () => {
    const migracion = readFileSync(
      new URL("../src-tauri/migrations/0003_historial.sql", import.meta.url),
      "utf8",
    );
    expect(generar().stdout.replace(/\r\n/g, "\n")).toBe(migracion.replace(/\r\n/g, "\n"));
  });

  it("con --tablas da solo los triggers de esas tablas, primero borrando los que había", () => {
    const r = generar("--tablas", "cargos,sedes");
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain("CREATE TABLE");
    for (const t of ["cargos", "sedes"])
      for (const op of ["insert", "update", "delete"]) {
        const borra = r.stdout.indexOf(`DROP TRIGGER IF EXISTS historial_${t}_${op};`);
        expect(borra).toBeGreaterThanOrEqual(0);
        expect(r.stdout.indexOf(`CREATE TRIGGER historial_${t}_${op} `)).toBeGreaterThan(borra);
      }
    expect(r.stdout.match(/CREATE TRIGGER/g)).toHaveLength(6);
  });

  it("con una tabla que no existe falla sin escribir nada", () => {
    const r = generar("--tablas", "no_existe");
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("no_existe");
  });
});
