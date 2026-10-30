import { describe, it, expect } from "vitest";
import { primerPuertoLibre } from "./dev.mjs";

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
