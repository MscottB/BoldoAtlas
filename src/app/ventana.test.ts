import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { alPedirCierre, conectarCierre, pedirSalir, preguntarAlSalir, salidaAbierta, salir } from "./ventana";

const ventana = vi.hoisted(() => ({
  unminimize: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  setFocus: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
}));
const org = vi.hoisted(() => ({ guardando: false }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn(() => ventana) }));
vi.mock("@/stores/organizacion", () => ({ useOrganizacion: () => org }));

const llamadas = () => vi.mocked(invoke).mock.calls.map((c) => c[0]);
class Elemento {
  blur = vi.fn();
}
/** Si el diálogo de salir está en la página. */
let dialogo: boolean;

beforeEach(() => {
  vi.clearAllMocks();
  dialogo = true;
  org.guardando = false;
  vi.stubGlobal("document", { activeElement: null, querySelector: () => (dialogo ? {} : null) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("HTMLElement", Elemento);
  salidaAbierta.value = false;
  preguntarAlSalir.value = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("al pedir cerrar la ventana", () => {
  it("pregunta, con la ventana al frente, y aún no sale", async () => {
    await alPedirCierre();
    expect(salidaAbierta.value).toBe(true);
    expect(ventana.unminimize).toHaveBeenCalled();
    expect(ventana.show).toHaveBeenCalled();
    expect(ventana.setFocus).toHaveBeenCalled();
    expect(llamadas()).toEqual(["cierre_atendido"]);
  });

  it("con la interfaz en blanco no responde a Rust: el vigilante sale", async () => {
    dialogo = false;
    await alPedirCierre();
    expect(llamadas()).toEqual([]);
    expect(ventana.show).not.toHaveBeenCalled();
  });

  it("un segundo intento responde a Rust y sigue habiendo un solo diálogo", async () => {
    await alPedirCierre();
    await alPedirCierre();
    expect(salidaAbierta.value).toBe(true);
    expect(llamadas()).toEqual(["cierre_atendido", "cierre_atendido"]);
  });

  it("con la opción apagada sale sin preguntar", async () => {
    preguntarAlSalir.value = false;
    await alPedirCierre();
    expect(salidaAbierta.value).toBe(false);
    expect(llamadas()).toEqual(["salir_app"]);
  });
});

describe("salir", () => {
  it("quita el foco del campo en edición, avisa a las vistas y termina", async () => {
    const campo = new Elemento();
    vi.stubGlobal("document", { activeElement: campo });
    await salir();
    expect(campo.blur).toHaveBeenCalled();
    expect(window.dispatchEvent).toHaveBeenCalled();
    expect(llamadas()).toEqual(["salir_app"]);
  });

  it("espera a que terminen las escrituras", async () => {
    vi.useFakeTimers();
    org.guardando = true;
    const fin = salir();
    await vi.advanceTimersByTimeAsync(500);
    expect(llamadas()).toEqual([]);
    org.guardando = false;
    await vi.advanceTimersByTimeAsync(50);
    await fin;
    expect(llamadas()).toEqual(["salir_app"]);
  });

  it("no espera más de 2 s por una escritura que no termina", async () => {
    vi.useFakeTimers();
    org.guardando = true;
    const fin = salir();
    await vi.advanceTimersByTimeAsync(1900);
    expect(llamadas()).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    await fin;
    expect(llamadas()).toEqual(["salir_app"]);
  });
});

describe("pedirSalir", () => {
  it("cierra la ventana: el mismo camino que la X", async () => {
    await pedirSalir();
    expect(ventana.close).toHaveBeenCalled();
  });
});

describe("sin Tauri (navegador)", () => {
  it("«Salir» y conectar no hacen nada ni fallan", async () => {
    const sinTauri = () => {
      throw new TypeError("window.__TAURI_INTERNALS__ is undefined");
    };
    vi.mocked(getCurrentWindow).mockImplementationOnce(sinTauri);
    vi.mocked(listen).mockImplementationOnce(sinTauri);
    await expect(pedirSalir()).resolves.toBeUndefined();
    await expect(conectarCierre()).resolves.toBeUndefined();
    expect(llamadas()).toEqual([]);
  });
});

describe("conectarCierre", () => {
  it("avisa a Rust solo después de escuchar", async () => {
    await conectarCierre();
    expect(listen).toHaveBeenCalledWith("cierre-pedido", expect.any(Function));
    expect(llamadas()).toEqual(["cierre_listo"]);
    expect(vi.mocked(listen).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(invoke).mock.invocationCallOrder[0]!,
    );
  });
});
