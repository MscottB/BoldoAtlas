import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...a: unknown[]) => invoke(...a),
  Channel: class {
    onmessage: unknown;
  },
}));

const { CADA_HORA, PREFERENCIA, ULTIMA, mensajeError, useActualizaciones } =
  await import("./actualizaciones");

const disponible = { version: "9.9.9", modo: "portable", pagina: "https://x", novedades: null };

// localStorage en memoria: las preferencias por PC
let guardado: Map<string, string>;
const pref = (clave: string) => {
  const v = guardado.get(`boldo:${clave}`);
  return v === undefined ? undefined : JSON.parse(v);
};

beforeEach(() => {
  guardado = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => guardado.set(k, v),
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  setActivePinia(createPinia());
  invoke.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("consulta periódica (iniciar)", () => {
  it("consulta al abrir con la frecuencia por defecto y guarda la hora solo si respondió", async () => {
    invoke.mockResolvedValueOnce(null);
    useActualizaciones().iniciar();
    await vi.waitFor(() => expect(pref(ULTIMA)).toBeTypeOf("number"));
    expect(invoke).toHaveBeenCalledWith("buscar_actualizacion", expect.anything());
  });

  it("si falla no guarda la hora ni avisa: reintenta en la próxima revisión", async () => {
    invoke.mockRejectedValueOnce({ codigo: "red", detalle: "x" });
    const a = useActualizaciones();
    a.iniciar();
    await vi.waitFor(() => expect(a.buscando).toBe(false));
    expect(pref(ULTIMA)).toBeUndefined();
    expect(a.ventanaAbierta).toBe(false);
    invoke.mockResolvedValueOnce(null);
    await vi.advanceTimersByTimeAsync(CADA_HORA);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("con «Nunca» no consulta", async () => {
    guardado.set(`boldo:${PREFERENCIA}`, JSON.stringify("nunca"));
    useActualizaciones().iniciar();
    await vi.advanceTimersByTimeAsync(CADA_HORA * 48);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("un solo temporizador y sigue consultando cada día aunque ya haya una versión nueva", async () => {
    invoke.mockResolvedValue(disponible);
    const a = useActualizaciones();
    a.iniciar();
    a.iniciar();
    expect(vi.getTimerCount()).toBe(1);
    await vi.waitFor(() => expect(a.disponible?.version).toBe("9.9.9"));
    expect(invoke).toHaveBeenCalledTimes(1);
    // la automática no abre la ventana: solo el aviso de la barra
    expect(a.ventanaAbierta).toBe(false);
    await vi.advanceTimersByTimeAsync(CADA_HORA * 23);
    expect(invoke).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValue({ ...disponible, version: "10.0.0" });
    // waitFor adelanta el reloj falso unos ms: la consulta del día siguiente cae en la revisión de las 24 o 25 h
    await vi.advanceTimersByTimeAsync(CADA_HORA * 2);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(a.disponible?.version).toBe("10.0.0");
  });
});

describe("buscar", () => {
  it("con la ventana de actualización abierta, la consulta automática espera (la ventana no queda en blanco)", async () => {
    invoke.mockResolvedValue(disponible);
    const a = useActualizaciones();
    a.iniciar();
    await vi.waitFor(() => expect(a.disponible).not.toBeNull());
    a.ventanaAbierta = true;
    invoke.mockResolvedValue(null);
    await vi.advanceTimersByTimeAsync(CADA_HORA * 48);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(a.disponible?.version).toBe("9.9.9");
  });

  it("manual durante la automática espera la misma consulta y muestra su resultado", async () => {
    let responder: (v: unknown) => void = () => {};
    invoke.mockReturnValueOnce(new Promise((r) => (responder = r)));
    const a = useActualizaciones();
    const auto = a.buscar(false);
    const manual = a.buscar(true);
    responder(disponible);
    expect(await auto).toEqual({ ok: true });
    expect(await manual).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(a.ventanaAbierta).toBe(true);
  });

  it("manual sin versión nueva dice que está al día", async () => {
    invoke.mockResolvedValueOnce(null);
    expect(await useActualizaciones().buscar(true)).toEqual({
      ok: true,
      mensaje: "Ya tienes la última versión.",
    });
  });

  it("distingue el límite de GitHub de un error de red y nunca lanza", async () => {
    const a = useActualizaciones();
    invoke.mockRejectedValueOnce({ codigo: "limite", detalle: "403 Forbidden" });
    const r = await a.buscar(true);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.mensaje).toMatch(/límite|limitó/i);
    invoke.mockRejectedValueOnce({ codigo: "red", detalle: "timeout" });
    const r2 = await a.buscar(true);
    expect(!r2.ok && r2.mensaje).toMatch(/conexión/);
  });
});

describe("mensajeError", () => {
  it("traduce el código y muestra el detalle si el código es desconocido", () => {
    expect(mensajeError({ codigo: "firma", detalle: "x" })).toMatch(/firma/);
    expect(mensajeError({ codigo: "otro", detalle: "algo raro" })).toContain("algo raro");
    expect(mensajeError("texto suelto")).toContain("texto suelto");
  });
});
