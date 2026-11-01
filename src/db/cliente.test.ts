import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.stubGlobal("__APP_VERSION__", "prueba");

const { lote } = await import("./cliente");
const { lectura } = await import("./cola");

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

  it("un lote no se intercala entre las lecturas de una carga en la cola", async () => {
    const eventos: string[] = [];
    invoke.mockImplementation(async () => void eventos.push("lote"));
    let terminarCarga = () => {};
    const carga = lectura(async () => {
      eventos.push("lectura 1");
      await new Promise<void>((r) => (terminarCarga = r));
      eventos.push("lectura 2");
    });
    const l = lote([{ sql: "a" }]);
    await vi.waitFor(() => expect(eventos).toEqual(["lectura 1"]));
    await new Promise((r) => setTimeout(r, 10));
    expect(eventos).toEqual(["lectura 1"]);
    terminarCarga();
    await Promise.all([carga, l]);
    expect(eventos).toEqual(["lectura 1", "lectura 2", "lote"]);
  });

  it("una carga lenta no detiene a otra, y la que sigue a un lote lo ve aplicado", async () => {
    const eventos: string[] = [];
    let terminarLenta = () => {};
    const lenta = lectura(() => new Promise<void>((r) => (terminarLenta = r)));
    await lectura(async () => void eventos.push("rápida"));
    expect(eventos).toEqual(["rápida"]);
    let terminarLote = () => {};
    invoke.mockImplementation(() => new Promise<void>((r) => (terminarLote = r)));
    const l = lote([{ sql: "a" }]);
    const despues = lectura(async () => void eventos.push("después"));
    terminarLenta();
    await lenta;
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(eventos).toEqual(["rápida"]);
    terminarLote();
    await Promise.all([l, despues]);
    expect(eventos).toEqual(["rápida", "después"]);
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
