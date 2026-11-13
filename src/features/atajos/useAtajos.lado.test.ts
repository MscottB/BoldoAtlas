import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { TIPO_GERENCIA } from "@/db/tipos";
import { u } from "@/features/arbol/fixture";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizacion } from "@/stores/organizacion";
import { paletaAbierta, useAtajos } from "./useAtajos";

const h = vi.hoisted(() => ({
  manejador: null as ((e: unknown) => void) | null,
  revelar: vi.fn(),
  nuevaHija: vi.fn(),
}));
vi.mock("@/lado/modo", () => ({ MODO_LADO: true, idLado: () => "" }));
vi.mock("@vueuse/core", async (original) => ({
  ...(await original<object>()),
  useEventListener: (_d: unknown, _e: unknown, f: (e: unknown) => void) => void (h.manejador = f),
}));
vi.mock("@/features/pestanas/routerConFoco", () => ({
  routerConFoco: () => ({ currentRoute: { value: { name: "arbol", query: {}, meta: {} } } }),
}));
vi.mock("@/features/arbol/useLienzo", async (original) => ({
  ...(await original<object>()),
  useLienzo: () => ({
    seleccion: { value: null },
    seleccionadas: { value: new Set() },
    editando: { value: null },
    revelar: h.revelar,
    nuevaHija: h.nuevaHija,
  }),
}));

const tecla = (key: string, ctrlKey = false) => {
  const e = {
    key,
    ctrlKey,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    target: null,
    preventDefault: vi.fn(),
  };
  h.manejador!(e);
  return e;
};

describe("Los atajos en el panel de al lado", () => {
  let alPadre: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    alPadre = vi.fn();
    vi.stubGlobal("window", { parent: { postMessage: alPadre } });
    vi.stubGlobal("location", { origin: "http://tauri.localhost" });
    vi.stubGlobal("Element", class {});
    vi.stubGlobal("document", { querySelector: () => null });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    fijarBase("A");
    setActivePinia(createPinia());
    useOrganizacion().unidades = [u("g", TIPO_GERENCIA, "Gerencia", null)];
    h.revelar.mockReset();
    h.nuevaHija.mockReset();
    paletaAbierta.value = false;
    useAtajos();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("F6 le pide al padre que el foco vuelva al panel principal", () => {
    const e = tecla("F6");
    expect(alPadre).toHaveBeenCalledWith({ tipo: "boldo-lado-tecla", tecla: "F6" }, "http://tauri.localhost");
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("sin paleta ni pestañas", () => {
    const pestanas = usePestanas();
    const abrirNueva = vi.spyOn(pestanas, "abrirNueva");
    const cerrar = vi.spyOn(pestanas, "cerrar");
    tecla("k", true);
    expect(paletaAbierta.value).toBe(false);
    tecla("t", true);
    tecla("w", true);
    expect(abrirNueva).not.toHaveBeenCalled();
    expect(cerrar).not.toHaveBeenCalled();
  });

  it("las flechas recorren el árbol; N no crea", () => {
    tecla("ArrowDown");
    expect(h.revelar).toHaveBeenCalledWith("g");
    tecla("n");
    expect(h.nuevaHija).not.toHaveBeenCalled();
  });
});
