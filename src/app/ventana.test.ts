import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
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
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => {}) }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn(() => ventana) }));

const llamadas = () => vi.mocked(invoke).mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  vi.stubGlobal("document", { activeElement: null });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("HTMLElement", class {});
  salidaAbierta.value = false;
  preguntarAlSalir.value = true;
});

describe("al pedir cerrar la ventana", () => {
  it("pregunta, con la ventana al frente, y aún no sale", async () => {
    await alPedirCierre();
    expect(salidaAbierta.value).toBe(true);
    expect(ventana.unminimize).toHaveBeenCalled();
    expect(ventana.show).toHaveBeenCalled();
    expect(llamadas()).toEqual(["cierre_atendido"]);
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
    expect(llamadas()).toEqual(["cierre_atendido", "salir_app"]);
  });
});

describe("salir", () => {
  it("avisa a las vistas que guarden su estado y termina", async () => {
    await salir();
    expect(window.dispatchEvent).toHaveBeenCalled();
    expect(llamadas()).toEqual(["salir_app"]);
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
  });
});
