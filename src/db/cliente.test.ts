import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.stubGlobal("__APP_VERSION__", "prueba");

const c = await import("./cliente");
const { consultar, lote, alOtraBase, colaVacia } = c;
const { BaseCambiada, fijarBase, marcarCambio } = await import("@/lib/baseActiva");
const { mensajeFallo } = await import("@/features/respaldos/respaldos");
const { traducirError } = await import("./errores");

const orden = (l: unknown[][]) =>
  l.map((c) => (c[1] as { sentencias: { sql: string }[] }).sentencias[0]!.sql);

const CASOS: [string, () => Promise<unknown>][] = [
  ["consultar", () => c.consultar("SELECT 1")],
  ["lote", () => c.lote([{ sql: "a" }])],
  ["leerMeta", () => c.leerMeta()],
  ["listarRespaldos", () => c.listarRespaldos()],
  ["respaldarAhora", () => c.respaldarAhora()],
  ["restaurarRespaldo", () => c.restaurarRespaldo("n")],
  ["abrirCarpetaRespaldos", () => c.abrirCarpetaRespaldos()],
  ["infoProyecto", () => c.infoProyecto()],
  ["exportarPreparar", () => c.exportarPreparar("t", null)],
  ["importarAbrir", () => c.importarAbrir("t", "codigo")],
  ["importarAgregar", () => c.importarAgregar("t", {})],
  ["importarReemplazar", () => c.importarReemplazar("t")],
  ["importarComparar", () => c.importarComparar("t", {})],
  [
    "revisionPagina",
    () => c.revisionPagina("t", { tipo: null, tabla: null, soloDudosas: false, desde: 0, cuantos: 1 }),
  ],
  ["revisionDetalle", () => c.revisionDetalle("t", "tabla", "id")],
  ["revisionVerificar", () => c.revisionVerificar("t")],
  ["revisionBloqueos", () => c.revisionBloqueos("t", 0, 1)],
  ["revisionOpciones", () => c.revisionOpciones("t", "destino", "texto")],
  ["revisionAplicar", () => c.revisionAplicar("t", 1, false)],
  ["fotosHay", () => c.fotosHay()],
  ["fotosQuitar", () => c.fotosQuitar()],
  ["compararOrganizaciones", () => c.compararOrganizaciones("otra", "t")],
  ["comparacionPagina", () => c.comparacionPagina({ tabla: null, presencia: null, desde: 0, cuantos: 1 })],
  ["comparacionDetalle", () => c.comparacionDetalle("tabla", "id")],
  ["ladoAbrir", () => c.ladoAbrir("otra")],
  ["historialDeshacer", () => c.historialDeshacer(["a"])],
  ["historialRehacer", () => c.historialRehacer(["a"])],
  ["historialPunteros", () => c.historialPunteros()],
  ["historialDeshacerUltima", () => c.historialDeshacerUltima()],
  ["historialRehacerUltima", () => c.historialRehacerUltima()],
];

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue([]);
  fijarBase("A");
  marcarCambio(false);
});

describe("baseId", () => {
  it.each(CASOS)("%s lleva baseId", async (_, llamar) => {
    await llamar();
    expect(invoke.mock.lastCall?.[1]).toMatchObject({ baseId: "A" });
  });

  it("lo que no toca la conexión no lo lleva", async () => {
    await c.infoApp();
    expect(invoke.mock.lastCall?.[1]).toBeUndefined();
    await c.revisionResumen("t");
    expect(invoke.mock.lastCall?.[1]).toEqual({ trabajo: "t" });
    await c.comparacionCancelar("t");
    expect(invoke).toHaveBeenLastCalledWith("comparacion_cancelar", { trabajo: "t" });
    await c.comparacionCerrar();
    expect(invoke).toHaveBeenLastCalledWith("comparacion_cerrar");
    await c.ladoCerrar();
    expect(invoke).toHaveBeenLastCalledWith("lado_cerrar");
  });

  it("las fotos de todas las organizaciones no dependen de la abierta", async () => {
    await c.fotosPendientes();
    expect(invoke).toHaveBeenLastCalledWith("fotos_pendientes");
    await c.fotosQuitarTodas("t");
    expect(invoke).toHaveBeenLastCalledWith("fotos_quitar_todas", { trabajo: "t" });
  });

  it("excelGuardar manda el largo del pedido, el pedido con el nombre y el libro, en un solo cuerpo", async () => {
    invoke.mockResolvedValue("Ñuñoa_2026-11-14_r3.xlsx");
    await expect(c.excelGuardar("Ñuñoa_2026-11-14_r3.xlsx", new Uint8Array([0x50, 0x4b]))).resolves.toBe(
      "Ñuñoa_2026-11-14_r3.xlsx",
    );
    const cuerpo = invoke.mock.lastCall![1] as Uint8Array;
    expect(invoke.mock.lastCall![0]).toBe("excel_guardar");
    const largo = new DataView(cuerpo.buffer).getUint32(0, true);
    expect(JSON.parse(new TextDecoder().decode(cuerpo.slice(4, 4 + largo)))).toEqual({
      nombre: "Ñuñoa_2026-11-14_r3.xlsx",
    });
    expect([...cuerpo.slice(4 + largo)]).toEqual([0x50, 0x4b]);
  });
});

describe("el seguro", () => {
  it("una respuesta que llega con otra base activa se descarta", async () => {
    let resolver: (r: unknown) => void = () => {};
    invoke.mockImplementation(() => new Promise((r) => (resolver = r)));
    const p = consultar("SELECT 1");
    fijarBase("B");
    resolver([{ n: 1 }]);
    await expect(p).rejects.toBeInstanceOf(BaseCambiada);
  });

  it("un error que llega con otra base activa también se descarta", async () => {
    let rechazar: (e: unknown) => void = () => {};
    invoke.mockImplementation(() => new Promise((_, r) => (rechazar = r)));
    const p = consultar("SELECT 1");
    fijarBase("B");
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    rechazar("malo");
    await expect(p).rejects.toBeInstanceOf(BaseCambiada);
    expect(consola).toHaveBeenCalledWith("malo"); // descartado, pero con rastro
    consola.mockRestore();
  });

  it("un otra_base descartado no ensucia la consola", async () => {
    let rechazar: (e: unknown) => void = () => {};
    invoke.mockImplementation(() => new Promise((_, r) => (rechazar = r)));
    const p = consultar("SELECT 1");
    fijarBase("B");
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    rechazar("otra_base");
    await expect(p).rejects.toBeInstanceOf(BaseCambiada);
    expect(consola).not.toHaveBeenCalled();
    consola.mockRestore();
  });

  it("sincronizarOrganizacion lleva baseId", async () => {
    await c.sincronizarOrganizacion();
    expect(invoke).toHaveBeenCalledWith("sincronizar_organizacion", { baseId: "A" });
  });

  it("un lote en cola sale con la base con que se pidió", async () => {
    let soltar = () => {};
    invoke.mockImplementationOnce(() => new Promise<void>((r) => (soltar = r)));
    const primero = lote([{ sql: "a" }]);
    const segundo = lote([{ sql: "b" }]);
    fijarBase("B");
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    soltar();
    // ninguno queda colgado: quien los pidió llega a su `finally`
    await expect(primero).rejects.toBeInstanceOf(BaseCambiada);
    await expect(segundo).rejects.toBeInstanceOf(BaseCambiada);
    expect(invoke.mock.calls.map((l) => (l[1] as { baseId: string }).baseId)).toEqual(["A", "A"]);
  });
});

describe("otra_base", () => {
  const manejador = vi.fn();
  alOtraBase(manejador);
  beforeEach(() => manejador.mockClear());

  it.each([
    ["texto", "otra_base"],
    ["Fallo.codigo", { codigo: "otra_base", detalle: "" }],
  ])("con la misma base avisa una vez y no reintenta (%s)", async (_, error) => {
    invoke.mockRejectedValue(error);
    await expect(consultar("SELECT 1")).rejects.toBe(error);
    expect(manejador).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("también lo reconoce en un lote", async () => {
    invoke.mockRejectedValue("otra_base");
    await expect(lote([{ sql: "a" }])).rejects.toBe("otra_base");
    expect(manejador).toHaveBeenCalledTimes(1);
  });

  it("con la base ya cambiada no avisa", async () => {
    let rechazar: (e: unknown) => void = () => {};
    invoke.mockImplementation(() => new Promise((_, r) => (rechazar = r)));
    const p = consultar("SELECT 1");
    fijarBase("B");
    rechazar("otra_base");
    await expect(p).rejects.toBeInstanceOf(BaseCambiada);
    expect(manejador).not.toHaveBeenCalled();
  });

  it("durante un cambio no avisa y rechaza con BaseCambiada", async () => {
    marcarCambio(true);
    invoke.mockRejectedValue({ codigo: "otra_base", detalle: "" });
    await expect(consultar("SELECT 1")).rejects.toBeInstanceOf(BaseCambiada);
    expect(manejador).not.toHaveBeenCalled();
  });

  it("otro error no avisa y llega como está", async () => {
    invoke.mockRejectedValue("malo");
    await expect(consultar("SELECT 1")).rejects.toBe("malo");
    expect(manejador).not.toHaveBeenCalled();
  });
});

describe("comparación", () => {
  it("una comparación vencida, o consigo misma, se dice en palabras", async () => {
    const vencida = { codigo: "comparacion_vencida", detalle: "" };
    invoke.mockRejectedValue(vencida);
    const e: unknown = await c
      .comparacionPagina({ tabla: null, presencia: null, desde: 0, cuantos: 1 })
      .catch((x) => x);
    expect(e).toBe(vencida);
    expect(mensajeFallo(e)).toBe("Esta comparación ya no vale. Compara de nuevo.");
    expect(traducirError("comparacion_vencida")).toBe("Esta comparación ya no vale. Compara de nuevo.");
    expect(mensajeFallo({ codigo: "misma", detalle: "x" })).toBe(
      "No puedes comparar una organización consigo misma.",
    );
    expect(traducirError("misma")).toBe("No puedes comparar una organización consigo misma.");
  });
});

describe("colaVacia", () => {
  it("espera también lo que entró a la cola mientras esperaba, y no falla si un lote falló", async () => {
    const pendientes: ((e?: unknown) => void)[] = [];
    invoke.mockImplementation(() => new Promise<void>((r, x) => pendientes.push((e) => (e ? x(e) : r()))));
    const a = lote([{ sql: "a" }]);
    let vacia = false;
    const p = colaVacia().then(() => (vacia = true));
    const b = lote([{ sql: "b" }]);
    await vi.waitFor(() => expect(pendientes).toHaveLength(1));
    pendientes.shift()!("malo");
    await expect(a).rejects.toBe("malo");
    await vi.waitFor(() => expect(pendientes).toHaveLength(1));
    expect(vacia).toBe(false);
    pendientes.shift()!();
    await b;
    await p;
    expect(vacia).toBe(true);
  });
});

describe("lote", () => {
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

  it("devuelve la acción del historial que anotó Rust", async () => {
    invoke.mockResolvedValueOnce("acc-1").mockResolvedValueOnce(null);
    expect(await lote([{ sql: "a" }])).toBe("acc-1");
    expect(await lote([{ sql: "b" }])).toBeNull();
  });

  it("deshacer y rehacer esperan en la misma cola: no se adelantan a un cambio ya pedido", async () => {
    const pendientes: (() => void)[] = [];
    invoke.mockImplementation(() => new Promise<void>((r) => pendientes.push(r)));
    const a = lote([{ sql: "a" }]);
    const d = c.historialDeshacer(["acc-1"]);
    const r = c.historialRehacer(["acc-1"]);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    expect(invoke.mock.calls.map((x) => x[0])).toEqual(["db_lote"]);
    pendientes.shift()!();
    await a;
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(invoke.mock.lastCall).toEqual([
      "historial_deshacer",
      { ids: ["acc-1"], versionApp: "prueba", baseId: "A" },
    ]);
    pendientes.shift()!();
    await d;
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(3));
    expect(invoke.mock.lastCall?.[0]).toBe("historial_rehacer");
    pendientes.shift()!();
    await r;
  });

  it("Ctrl+Z y Ctrl+Y piden a Rust buscar y mover de una vez", async () => {
    invoke.mockResolvedValue(null);
    expect(await c.historialDeshacerUltima()).toBeNull();
    expect(invoke.mock.lastCall).toEqual([
      "historial_deshacer_ultima",
      { versionApp: "prueba", baseId: "A" },
    ]);
    await c.historialRehacerUltima();
    expect(invoke.mock.lastCall?.[0]).toBe("historial_rehacer_ultima");
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
