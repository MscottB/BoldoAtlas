import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { fijarBase } from "@/lib/baseActiva";
import { useOrganizaciones } from "@/stores/organizaciones";
import { useAtajos } from "./useAtajos";

const h = vi.hoisted(() => ({
  manejador: null as ((e: unknown) => void) | null,
  nuevaHija: vi.fn(),
}));
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

describe("useAtajos con una pestaña sin abrir", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Element", class {});
    vi.stubGlobal("document", { querySelector: () => null });
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
    fijarBase("A");
    setActivePinia(createPinia());
    h.nuevaHija.mockReset();
    useAtajos();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sin motivo, N crea en el árbol", () => {
    tecla("n");
    expect(h.nuevaHija).toHaveBeenCalledOnce();
  });

  it("con motivo, N no escribe en la organización oculta tras la pantalla", () => {
    useOrganizaciones().sinAbrir.set(usePestanas().activa, {
      codigo: "no_encontrado",
      mensaje: "m",
      detalle: "",
    });
    const e = tecla("n");
    expect(h.nuevaHija).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("con motivo, los atajos de pestañas siguen valiendo", () => {
    const pestanas = usePestanas();
    useOrganizaciones().sinAbrir.set(pestanas.activa, { codigo: "no_encontrado", mensaje: "m", detalle: "" });
    const siguiente = vi.spyOn(pestanas, "siguiente").mockReturnValue({ ok: true });
    tecla("Tab", true);
    expect(siguiente).toHaveBeenCalledWith(1);
  });
});
