import { describe, it, expect } from "vitest";
import { esViteDeEsteRepo, pidsEscuchando, primerPuertoLibre } from "./dev.mjs";

describe("primerPuertoLibre", () => {
  it("usa el inicial si está libre", async () => {
    expect(await primerPuertoLibre(1420, async () => false)).toBe(1420);
  });

  it("salta los ocupados hasta encontrar uno libre", async () => {
    const ocupados = new Set([1420, 1421, 1422]);
    expect(await primerPuertoLibre(1420, async (p) => ocupados.has(p))).toBe(1423);
  });

  it("falla si todos los intentos están ocupados", async () => {
    await expect(primerPuertoLibre(1420, async () => true)).rejects.toThrow("1420");
  });
});

describe("pidsEscuchando", () => {
  const netstat = `
Conexiones activas

  Proto  Dirección local         Dirección remota       Estado           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1032
  TCP    127.0.0.1:1420         0.0.0.0:0              LISTENING       4242
  TCP    [::1]:1420             [::]:0                 LISTENING       4242
  TCP    [::1]:14200            [::]:0                 LISTENING       777
  TCP    127.0.0.1:1420         127.0.0.1:50000        ESTABLISHED     5151
  TCP    127.0.0.1:61420        0.0.0.0:0              LISTENING       888
  TCP    [::]:1420              [::]:0                 LISTENING       9001
`;

  it("devuelve los PID únicos que escuchan en el puerto exacto", () => {
    expect(pidsEscuchando(netstat, 1420)).toEqual([4242, 9001]);
  });

  it("devuelve vacío si nadie escucha", () => {
    expect(pidsEscuchando(netstat, 1500)).toEqual([]);
  });
});

describe("esViteDeEsteRepo", () => {
  const repo = String.raw`C:\Users\Administrator\Proyectos\BoldoAtlas`;

  it("acepta el Vite de este repositorio", () => {
    const cmd = String.raw`"C:\Program Files\nodejs\node.exe" ${repo}\node_modules\vite\bin\vite.js --port 1420`;
    expect(esViteDeEsteRepo(cmd, repo)).toBe(true);
  });

  it("ignora mayúsculas y el tipo de barra", () => {
    const cmd = "node c:/users/administrator/proyectos/boldoatlas/node_modules/vite/bin/vite.js";
    expect(esViteDeEsteRepo(cmd, repo)).toBe(true);
  });

  it("rechaza un Vite de otro proyecto", () => {
    const cmd = String.raw`node C:\Users\Administrator\Proyectos\Otro\node_modules\vite\bin\vite.js --port 1420`;
    expect(esViteDeEsteRepo(cmd, repo)).toBe(false);
  });

  it("rechaza otro proceso de este repositorio que no es Vite", () => {
    expect(esViteDeEsteRepo(String.raw`${repo}\src-tauri\target\debug\boldo-atlas.exe`, repo)).toBe(false);
  });

  it("rechaza una línea de comando vacía o desconocida", () => {
    expect(esViteDeEsteRepo("", repo)).toBe(false);
    expect(esViteDeEsteRepo(undefined, repo)).toBe(false);
  });
});
