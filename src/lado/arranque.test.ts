import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { createPinia } from "pinia";
import { createApp, createSSRApp, type App } from "vue";
import { renderToString } from "vue/server-renderer";
import { i18n } from "@/i18n";
import { rutas } from "@/router";
import AppLado from "./AppLado.vue";
import PantallaError from "@/vistas/PantallaError.vue";
import { arrancar, guiarRouter, VISTAS_LADO } from "./arranque";

// localStorage simulado desde antes de importar: hay módulos que leen sus preferencias al cargarse.
vi.hoisted(() =>
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} }),
);
// `createApp` de verdad, salvo donde una prueba mira qué se monta.
vi.mock("vue", async (original) => {
  const v = await original<typeof import("vue")>();
  return { ...v, createApp: vi.fn(v.createApp) };
});
// Sin `window`: el router principal se crea al importar `@/router`, y con historia en memoria se puede.
vi.mock("vue-router", async (original) => {
  const vr = await original<typeof import("vue-router")>();
  return { ...vr, createWebHashHistory: vr.createMemoryHistory };
});
// Las vistas reales no se montan aquí: solo importa a qué ruta llega el router.
const vacia = vi.hoisted(() => ({ default: { render: () => null } }));
vi.mock("@/features/arbol/VistaArbol.vue", () => vacia);
vi.mock("@/features/arboles/VistaArboles.vue", () => vacia);
vi.mock("@/features/directorio/VistaDirectorio.vue", () => vacia);
vi.mock("@/features/revision/VistaRevision.vue", () => vacia);
vi.mock("@/features/intercambio/VistaIntercambio.vue", () => vacia);
vi.mock("@/features/comparar/VistaComparar.vue", () => vacia);
vi.mock("@/vistas/VistaConfiguracion.vue", () => vacia);
vi.mock("@/vistas/VistaMantenedores.vue", () => vacia);
vi.mock("@/vistas/VistaAyuda.vue", () => vacia);
vi.mock("@/vistas/VistaAcerca.vue", () => vacia);
vi.mock("@/vistas/VistaBienvenida.vue", () => vacia);

let router: Router;
let alPadre: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  alPadre = vi.fn();
  vi.stubGlobal("window", { parent: { postMessage: alPadre } });
  vi.stubGlobal("location", { origin: "http://tauri.localhost" });
  router = guiarRouter(createRouter({ history: createMemoryHistory(), routes: rutas }));
  await router.replace("/directorio");
  alPadre.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("el router del lado", () => {
  it("router_del_lado_rechaza_configuracion_e_intercambio", async () => {
    for (const ruta of [
      "/configuracion",
      "/importar-exportar",
      "/ayuda/arbol",
      "/acerca",
      "/bienvenida",
      "/comparar",
    ]) {
      await router.push(ruta);
      expect(router.currentRoute.value.fullPath, ruta).toBe("/directorio");
      // el padre la lleva al panel principal
      expect(alPadre).toHaveBeenLastCalledWith({ tipo: "boldo-lado-fuera", ruta }, "http://tauri.localhost");
    }
  });

  it("si se abre en una vista que no va al lado, muestra el Árbol y la pide al padre", async () => {
    const nuevo = guiarRouter(createRouter({ history: createMemoryHistory(), routes: rutas }));
    await nuevo.replace("/configuracion");
    expect(nuevo.currentRoute.value.fullPath).toBe("/");
    expect(alPadre).toHaveBeenCalledWith(
      { tipo: "boldo-lado-fuera", ruta: "/configuracion" },
      "http://tauri.localhost",
    );
    expect(alPadre).toHaveBeenLastCalledWith(
      { tipo: "boldo-lado-ruta", ruta: "/" },
      "http://tauri.localhost",
    );
  });

  it("deja las vistas de trabajo y avisa al padre a cuál llegó", async () => {
    for (const ruta of ["/", "/arboles", "/revision", "/directorio"]) {
      await router.push(ruta);
      expect(router.currentRoute.value.fullPath).toBe(ruta);
      expect(alPadre).toHaveBeenLastCalledWith({ tipo: "boldo-lado-ruta", ruta }, "http://tauri.localhost");
    }
    expect(VISTAS_LADO).toEqual(["arbol", "arboles", "directorio", "revision"]);
  });
});

describe("AppLado", () => {
  const pintar = async (motivo: string) => {
    const app = createSSRApp(AppLado, { motivo }).use(createPinia()).use(router).use(i18n);
    return renderToString(app);
  };

  it("si la carga falla, muestra el motivo en el panel y no la vista", async () => {
    const html = await pintar("No se pudo leer la base.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("No se pudo leer la base.");
  });

  it("sin barra lateral, barra superior ni pestañas", async () => {
    const html = await pintar("");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain(i18n.global.t("nav.principal"));
    expect(html).not.toContain('role="tablist"');
  });
});

describe("arrancar", () => {
  it("si algo falla, el iframe muestra el motivo y no queda en blanco", async () => {
    // el padre no es la app: no hay IPC que tomar
    vi.stubGlobal("window", { parent: {} });
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const montar = vi.fn();
    const app = { use: () => app, mount: montar } as unknown as App;
    vi.mocked(createApp).mockReturnValueOnce(app);
    await arrancar();
    expect(createApp).toHaveBeenCalledWith(
      PantallaError,
      expect.objectContaining({
        info: expect.objectContaining({ error: expect.stringContaining("TypeError") }),
      }),
    );
    expect(montar).toHaveBeenCalledWith("#app");
    consola.mockRestore();
  });
});
