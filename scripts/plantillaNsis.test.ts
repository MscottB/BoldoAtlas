import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// La plantilla NSIS es una copia de la de Tauri con cambios propios. Si sube el CLI, una copia vieja compila igual y
// sus arreglos o los de Tauri se pierden sin aviso: al fallar esto, compara con la plantilla nueva y actualiza la versión.
describe("plantilla NSIS", () => {
  it("corresponde a la versión instalada del CLI de Tauri", () => {
    const plantilla = readFileSync("src-tauri/instalador/plantilla.nsi", "utf8");
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
      packages: Record<string, { version: string }>;
    };
    const declarada = /@tauri-apps\/cli (\d+\.\d+\.\d+)/.exec(plantilla)?.[1];
    expect(declarada).toBe(lock.packages["node_modules/@tauri-apps/cli"]!.version);
  });
});
