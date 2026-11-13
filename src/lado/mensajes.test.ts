import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { avisoDeFoco, escucharPadre, filtrarDelPadre } from "./mensajes";

const ORIGEN = "http://tauri.localhost";
const padre = { postMessage: vi.fn() };

describe("filtrarDelPadre", () => {
  const de = (data: unknown, source: unknown = padre, origin = ORIGEN) => ({ data, source, origin });

  it("solo la ventana que contiene al iframe, desde la app, y con un pedido bien formado", () => {
    const ir = { tipo: "boldo-lado-ir", ruta: "/directorio" };
    expect(filtrarDelPadre(de(ir), padre, ORIGEN)).toEqual(ir);
    expect(filtrarDelPadre(de({ ...ir, otra: 1 }), padre, ORIGEN)).toEqual(ir);
    expect(filtrarDelPadre(de(ir, {}), padre, ORIGEN)).toBeNull();
    expect(filtrarDelPadre(de(ir, padre, "https://otro.example"), padre, ORIGEN)).toBeNull();
    for (const malo of [null, "texto", { tipo: "boldo-lado-ir" }, { tipo: "boldo-lado-ruta", ruta: "/" }])
      expect(filtrarDelPadre(de(malo), padre, ORIGEN)).toBeNull();
  });
});

describe("avisoDeFoco", () => {
  it("avisa al entrar, una vez hasta que el iframe pierde el foco", () => {
    const enviar = vi.fn();
    const aviso = avisoDeFoco(enviar);
    aviso.entrar();
    aviso.entrar();
    expect(enviar).toHaveBeenCalledTimes(1);
    aviso.salir();
    aviso.entrar();
    expect(enviar).toHaveBeenCalledTimes(2);
  });
});

describe("escucharPadre", () => {
  const vacio = { render: () => null };
  let router: Router;
  let escuchas: Record<string, ((e: unknown) => void)[]>;
  const escuchar = (tipo: string, f: (e: unknown) => void) => (escuchas[tipo] ??= []).push(f);
  const emitir = (tipo: string, e: unknown = {}) => escuchas[tipo]?.forEach((f) => f(e));

  beforeEach(async () => {
    escuchas = {};
    padre.postMessage.mockReset();
    vi.stubGlobal("window", { parent: padre, addEventListener: escuchar });
    vi.stubGlobal("document", { addEventListener: escuchar });
    vi.stubGlobal("location", { origin: ORIGEN });
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", name: "arbol", component: vacio },
        { path: "/directorio", name: "directorio", component: vacio },
        { path: "/configuracion", name: "configuracion", component: vacio },
      ],
    });
    await router.replace("/");
    escucharPadre(router);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("navega a lo que pide la ventana si se ve al lado; lo demás, y lo de otros, no", async () => {
    emitir("message", {
      data: { tipo: "boldo-lado-ir", ruta: "/configuracion" },
      source: padre,
      origin: ORIGEN,
    });
    emitir("message", { data: { tipo: "boldo-lado-ir", ruta: "/directorio" }, source: {}, origin: ORIGEN });
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/"));
    emitir("message", {
      data: { tipo: "boldo-lado-ir", ruta: "/directorio" },
      source: padre,
      origin: ORIGEN,
    });
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/directorio"));
  });

  it("le avisa a la ventana cuando el foco o un clic entran al iframe, una vez hasta perderlo", () => {
    emitir("focusin");
    emitir("pointerdown");
    expect(padre.postMessage).toHaveBeenCalledTimes(1);
    expect(padre.postMessage).toHaveBeenCalledWith({ tipo: "boldo-lado-foco" }, ORIGEN);
    emitir("blur");
    emitir("pointerdown");
    expect(padre.postMessage).toHaveBeenCalledTimes(2);
  });
});
