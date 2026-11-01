import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { trabajos } from "@/lib/trabajos";
import {
  alCerrar,
  alCerrarGuardado,
  alPedirCierre,
  bandejaLista,
  conectarCierre,
  decidirCierre,
  pedirSalir,
  responderSalida,
  salidaAbierta,
  salir,
} from "./ventana";

const ventana = vi.hoisted(() => ({
  unminimize: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  setFocus: vi.fn(async () => {}),
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
let guardado: Map<string, string>;
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
  alCerrar.value = "preguntar";
  bandejaLista.value = true;
  trabajos.value = [];
  guardado = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => guardado.set(k, v),
  });
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

  it("con «Cerrar la app» sale sin preguntar", async () => {
    alCerrar.value = "cerrar";
    await alPedirCierre();
    expect(salidaAbierta.value).toBe(false);
    expect(llamadas()).toEqual(["salir_app"]);
  });

  it("con «Dejar en la bandeja» oculta sin preguntar y no sale", async () => {
    alCerrar.value = "bandeja";
    await alPedirCierre();
    expect(salidaAbierta.value).toBe(false);
    expect(llamadas()).toEqual(["ocultar_en_bandeja"]);
  });

  it("con «Dejar en la bandeja» y la interfaz en blanco sale, sin ocultar una ventana muerta", async () => {
    alCerrar.value = "bandeja";
    dialogo = false;
    await alPedirCierre();
    expect(llamadas()).toEqual(["salir_app"]);
  });

  it("«Salir» con «Dejar en la bandeja» sale de verdad", async () => {
    alCerrar.value = "bandeja";
    await alPedirCierre(true);
    expect(llamadas()).toEqual(["salir_app"]);
  });

  it("con un trabajo en curso pregunta, sea cual sea la opción, y responde a Rust", async () => {
    for (const opcion of ["bandeja", "cerrar"] as const) {
      vi.clearAllMocks();
      salidaAbierta.value = false;
      alCerrar.value = opcion;
      trabajos.value = ["Respaldo"];
      await alPedirCierre();
      expect(salidaAbierta.value).toBe(true);
      expect(llamadas()).toEqual(["cierre_atendido"]);
    }
  });

  it("con el diálogo abierto, otro intento no lo deja atrás aunque el trabajo ya terminó", async () => {
    alCerrar.value = "bandeja";
    salidaAbierta.value = true;
    await alPedirCierre();
    expect(llamadas()).toEqual(["cierre_atendido"]);
  });
});

describe("decidir qué hacer al cerrar", () => {
  const base = { opcion: "preguntar", hayTrabajos: false, hayBandeja: true, salida: false } as const;

  it("cada opción, con la X", () => {
    expect(decidirCierre(base)).toBe("preguntar");
    expect(decidirCierre({ ...base, opcion: "bandeja" })).toBe("bandeja");
    expect(decidirCierre({ ...base, opcion: "cerrar" })).toBe("cerrar");
  });

  it("«Salir» nunca termina en la bandeja, y con «Preguntar» sigue preguntando", () => {
    expect(decidirCierre({ ...base, salida: true })).toBe("preguntar");
    expect(decidirCierre({ ...base, opcion: "bandeja", salida: true })).toBe("cerrar");
    expect(decidirCierre({ ...base, opcion: "cerrar", salida: true })).toBe("cerrar");
  });

  it("con un trabajo en curso siempre pregunta", () => {
    for (const opcion of ["preguntar", "bandeja", "cerrar"] as const)
      for (const salida of [false, true])
        expect(decidirCierre({ ...base, opcion, salida, hayTrabajos: true })).toBe("preguntar");
  });

  it("sin bandeja, «Dejar en la bandeja» vale como «Preguntar»", () => {
    expect(decidirCierre({ ...base, opcion: "bandeja", hayBandeja: false })).toBe("preguntar");
  });
});

describe("la opción guardada", () => {
  it("sin elegir, vale la casilla de antes: quien la apagó sigue sin pregunta", () => {
    expect(alCerrarGuardado(null, false)).toBe("cerrar");
    expect(alCerrarGuardado(null, true)).toBe("preguntar");
  });

  it("la opción nueva manda sobre la casilla de antes", () => {
    expect(alCerrarGuardado("bandeja", false)).toBe("bandeja");
    expect(alCerrarGuardado("preguntar", false)).toBe("preguntar");
    expect(alCerrarGuardado("cerrar", true)).toBe("cerrar");
  });

  it("lo dañado vale el valor por defecto", () => {
    expect(alCerrarGuardado("otra", "x")).toBe("preguntar");
    expect(alCerrarGuardado(1, null)).toBe("preguntar");
  });
});

describe("responder el diálogo", () => {
  it("«No volver a preguntar» guarda la acción elegida", async () => {
    await responderSalida("bandeja", true);
    expect(alCerrar.value).toBe("bandeja");
    expect(localStorage.getItem("boldo:alCerrar")).toBe('"bandeja"');
    expect(llamadas()).toEqual(["ocultar_en_bandeja"]);
  });

  it("sin la casilla no guarda nada", async () => {
    await responderSalida("cerrar", false);
    expect(alCerrar.value).toBe("preguntar");
    expect(localStorage.getItem("boldo:alCerrar")).toBeNull();
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
  it("se lo pide a Rust, que lo distingue de la X", async () => {
    await pedirSalir();
    expect(llamadas()).toEqual(["pedir_salida"]);
  });
});

describe("sin Tauri (navegador)", () => {
  it("«Salir» y conectar no hacen nada ni fallan", async () => {
    const sinTauri = () => {
      throw new TypeError("window.__TAURI_INTERNALS__ is undefined");
    };
    vi.mocked(invoke).mockImplementationOnce(sinTauri);
    vi.mocked(listen).mockImplementationOnce(sinTauri);
    await expect(pedirSalir()).resolves.toBeUndefined();
    await expect(conectarCierre()).resolves.toBeUndefined();
    expect(llamadas()).toEqual(["pedir_salida"]);
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
