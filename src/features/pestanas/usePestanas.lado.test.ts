import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { registrarRouter } from "./routerConFoco";
import { abrirEnPestanaNueva, clicNuevaPestana, usePestanas } from "./usePestanas";

vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
const lado = vi.hoisted(() => ({ activo: false }));
vi.mock("@/lado/modo", () => ({
  get MODO_LADO() {
    return lado.activo;
  },
  idLado: () => "",
}));

const vacio = { render: () => null };
let router: Router;
const clic = (extra: Partial<MouseEvent>) =>
  ({
    type: "click",
    button: 0,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...extra,
  }) as unknown as MouseEvent;

beforeEach(async () => {
  setActivePinia(createPinia());
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "arbol", component: vacio },
      { path: "/directorio", name: "directorio", component: vacio },
    ],
  });
  registrarRouter("principal", router);
  await router.push("/");
});

describe("Pestaña nueva en el panel de al lado", () => {
  it("Ctrl+clic y clic central son un clic normal: no abren pestañas ni anulan el clic", () => {
    lado.activo = true;
    const abrirNueva = vi.spyOn(usePestanas(), "abrirNueva");
    for (const e of [
      clic({ ctrlKey: true }),
      clic({ metaKey: true }),
      clic({ type: "auxclick", button: 1 }),
    ]) {
      expect(clicNuevaPestana(e, { name: "directorio" })).toBe(false);
      expect(e.preventDefault).not.toHaveBeenCalled();
    }
    expect(abrirNueva).not.toHaveBeenCalled();
  });

  it("«Abrir en pestaña nueva» navega ahí mismo", async () => {
    lado.activo = true;
    const abrirNueva = vi.spyOn(usePestanas(), "abrirNueva");
    abrirEnPestanaNueva({ name: "directorio", query: { persona: "w1" } });
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/directorio?persona=w1"));
    expect(abrirNueva).not.toHaveBeenCalled();
  });

  it("fuera del lado, Ctrl+clic sigue abriendo una pestaña nueva", () => {
    lado.activo = false;
    const abrirNueva = vi.spyOn(usePestanas(), "abrirNueva").mockReturnValue({ ok: true });
    const e = clic({ ctrlKey: true });
    expect(clicNuevaPestana(e, { name: "directorio" })).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(abrirNueva).toHaveBeenCalledWith({ name: "directorio" });
  });
});
