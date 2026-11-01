import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.stubGlobal("__APP_VERSION__", "prueba");

const { consultar, lote } = await import("./cliente");

const orden = (l: unknown[][]) => l.map((c) => (c[1] as { sentencias: { sql: string }[] }).sentencias[0]!.sql);

describe("lote", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("envía las escrituras una a una, en el orden pedido", async () => {
    const pendientes: (() => void)[] = [];
    invoke.mockImplementation(() => new Promise<void>((r) => pendientes.push(r)));
    const a = lote([{ sql: "a" }]);
    const b = lote([{ sql: "b" }]);
    const c = lote([{ sql: "c" }]);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    // la segunda no sale hasta que Rust termine la primera
    await new Promise((r) => setTimeout(r, 10));
    expect(orden(invoke.mock.calls)).toEqual(["a"]);
    pendientes.shift()!();
    await a;
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(orden(invoke.mock.calls)).toEqual(["a", "b"]);
    pendientes.shift()!();
    await b;
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    pendientes.shift()!();
    await c;
    expect(orden(invoke.mock.calls)).toEqual(["a", "b", "c"]);
  });

  it("un lote llega a Rust aunque haya una carga en curso", async () => {
    invoke.mockImplementation((comando: string) =>
      comando === "db_consultar" ? new Promise(() => {}) : Promise.resolve(),
    );
    void consultar("SELECT 1");
    await lote([{ sql: "a" }]);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(["db_consultar", "db_lote"]);
  });

  it("un lote que falla da su error a quien lo pidió y no detiene al siguiente", async () => {
    invoke.mockRejectedValueOnce("malo").mockResolvedValueOnce(undefined);
    const a = lote([{ sql: "a" }]);
    const b = lote([{ sql: "b" }]);
    await expect(a).rejects.toBe("malo");
    await expect(b).resolves.toBeUndefined();
    expect(orden(invoke.mock.calls)).toEqual(["a", "b"]);
  });
});
