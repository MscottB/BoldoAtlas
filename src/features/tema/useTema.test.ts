import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("useTema", () => {
  it("importarlo sin window (node) no lanza", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null }); // evita el aviso de localStorage de Node
    await expect(import("./useTema")).resolves.toBeDefined();
  });
});
